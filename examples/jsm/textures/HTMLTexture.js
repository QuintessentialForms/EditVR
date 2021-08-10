import { CanvasTexture } from '../../../build/three.module.js';

const _cache = {};
const _urlcache = {};

class HTMLTexture extends CanvasTexture {

	constructor( url, width, height, mapping, wrapS, wrapT, magFilter, minFilter, format, type, anisotropy ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = width;
		canvas.height = height;

		super( canvas, mapping, wrapS, wrapT, magFilter, minFilter, format, type, anisotropy );


		defineHTMLTextureNode();


		this._node = document.body.appendChild( new ( customElements.get( 'htmltexture-node' ) )() );
		this.document = null; //reset to null in _init, set to document in _node.onload

		this.throttle = 0;
		this.manualUpdate = false;


		this._urlQueue = null;
		this._cache = _cache;
		this._urlcache = _urlcache;
		this._proxyCanvas = document.createElement( 'canvas' );


		this._pointers = new WeakMap();
		this._queue = [];
		this._pointerId = 0;


		this._cssNode = null; //set in _node.onload
		this._transitions = null; //set in _node.onload
		this._unstyle = null; //set in _node.onload


		this._loading = null; //set synchronously in _init

		this._init( url ); //<< this.redrawing is meaningful immediately

	}

	_init( url ) {

		//Warning: _init must be synchronous. htmlTexture.redrawing must be meaningful on synchronous constructor end.

		this.document = null;

		if ( url === '' || typeof url !== 'string' ) url = 'about:blank';

		this._node.src = url;

		this._node.loaded = false;
		this._node.onload = () => this._node.loaded = true;

		this._cssNode = null;
		this._transitions = null;
		this._unstyle = null;

		const scope = this;

		this._loading = new Promise( async load => {

			//Note: Should not await redraw.

			const onload = () => {

				scope._node.loaded = true;

				const doc = scope.document = scope._node.contentWindow.document;

				scope._cssNode = doc.createElement( 'style' );
				scope._cssNode.id = 'htmltexture-style';

				//Changes to document stylesheets must overwrite this stylesheet
				//Must warn in documentation
				doc.head.insertBefore( scope._cssNode, doc.head.firstChild );


				//if the user created CSS animations, they are expected to work. No explicit command interface.

				doc.addEventListener( 'animationstart', () => scope.requestRedraw() );


				scope._transitions = new Map();

				const transitionStart = t => {

					let s = scope._transitions.get( t.target );

					if ( ! s ) scope._transitions.set( t.target, s = new Set() );

					s.add( t.propertyName );

					scope.requestRedraw();

				};

				doc.addEventListener( 'transitionstart', transitionStart );

				const transitionEnd = t => {

					const s = scope._transitions.get( t.target );

					if ( ! s ) return;

					s.delete( t.propertyName );

					if ( s.size === 0 ) scope._transitions.delete( t.target );

					scope.requestRedraw();

				};

				doc.addEventListener( 'transitionend', transitionEnd );

				doc.addEventListener( 'transitioncancel', transitionEnd );


				const unstyled = doc.body.appendChild( new ( customElements.get( 'htmltexture-default' ) )() );

				const unstyle = getComputedStyle( unstyled );

				const _unstyle = scope._unstyle = {};

				Array.from( unstyle ).forEach( name => _unstyle[ name ] = unstyle[ name ] );

				doc.body.removeChild( unstyled );


				load();

			};

			if ( scope._node.loaded === true ) onload();

			scope._node.onload = onload;

		} );

		this.requestRedraw(); //<< this.redrawing is meaningful immediately

		return this.redrawing;

	}

	requestRedraw( url = '', width = this.image.width, height = this.image.height ) {

		//Warning: htmlTexture.redrawing must be meaningful on synchronous requestDraw() end.

		if ( this._redrawing === true ) {

			if ( url ) this._urlQueue = url;

			return this.redrawing;

		}


		const scope = this;


		this._redrawing = true;

		this.redrawing = new Promise( async resolve => {

			//API: await requestRedraw( url ) must resolve only once both load and redraw are finished

			await scope._loading;

			if ( url ) await scope._init( url );

			else if ( scope._urlQueue ) await scope._init( scope._urlQueue );

			scope._urlQueue = '';

			const doc = scope.document;

			//Chrome's element class definitions are isolated across iframe boundaries
			const { CSSImportRule, CSSMediaRule, CSSSupportsRule, CSSRule, CSSRuleList, CSSStyleSheet, Document, HTMLElement, HTMLImageElement, SVGElement, HTMLVideoElement, HTMLCanvasElement } = scope._node.contentWindow;

			const Scroller = customElements.get( 'htmltexture-scroller' );


			//Assert: The document may change at any point during the async process.
			//Spec: The draw must not block or throw on in-process changes, but its behavior is undefined.


			//block for image load
			await Promise.all( Array.from( doc.querySelectorAll( 'img' ) ).map( image => new Promise( load => image.complete ? load() : ( image.addEventListener( 'load', load ), image.addEventListener( 'error', load ) ) ) ) );


			//simulate hover
			const importedSheets = new Set();

			const C = ( r, t ) => {

				if ( typeof r === 'string' ) return ( /[^[=\s]\s*:hover/gmi ).test( r ) ? `${ r.replace( /([^[=\s])(\s*)(:hover)/gmi, '$1[vr-hover]' ) } { ${ t } }` : '';

				if ( r instanceof CSSImportRule ) return importedSheets.has( r.href ) ? '' : ( importedSheets.add( r.href ), C( r.styleSheet ) );

				if ( r instanceof CSSMediaRule ) return r.cssRules ? `@media ${r.media.mediaText} { ${ C( r.cssRules ) } }` : '';

				if ( r instanceof CSSSupportsRule ) return r.cssRules ? `@supports ${r.conditionText} { ${ C( r.cssRules ) } }` : '';

				if ( r instanceof CSSRule ) return r.cssText + '\n' + C( r.selectorText, r.style.cssText );

				if ( r instanceof CSSRuleList ) return Array.from( r ).map( C ).join( '\n' );

				if ( r instanceof CSSStyleSheet ) return ( r.ownerNode === scope._cssNode ) ? '\n' : C( r.cssRules );

				if ( r instanceof Document ) return Array.from( r.styleSheets ).map( C ).join( '\n' );

			};

			const css = C( doc );

			if ( scope._cssNode.textContent !== css ) scope._cssNode.textContent = css;



			scope._node.style.width = width + 'px';

			scope._node.style.height = height + 'px';


			//collect css urls, animations, and pseudo elements

			let animating = scope._transitions.size > 0;

			const urls = [];
			const styledElements = new Map();
			const scrollingElements = new Map();

			const collect = ( s, e, name, style ) => {

				if ( e.scrollTop || e.scrollLeft ) scrollingElements.set( e, new Scroller( e.scrollTop, e.scrollLeft ) );


				const p = e.parentNode;

				if ( p && ( p.scrollTop || p.scrollLeft ) && ( ( name === 'left' && s !== 'auto' ) || ( name === 'right' && s !== 'auto' ) || ( name === 'top' && s !== 'auto' ) ) && ( style.position === 'absolute' ) ) {

					if ( name === 'top' ) return ( ( ( 1 * s.replace( 'px', '' ) ) || 0 ) - ( p.scrollTop || 0 ) ) + 'px';

					if ( name === 'left' && style.direction === 'ltr' ) return ( ( ( 1 * s.replace( 'px', '' ) ) || 0 ) - ( p.scrollLeft || 0 ) ) + 'px';

					if ( name === 'right' && style.direction === 'rtl' ) return ( ( ( 1 * s.replace( 'px', '' ) ) || 0 ) + ( p.scrollLeft || 0 ) ) + 'px';

				}


				if ( ( name === 'animation-play-state' && s === 'running' ) ) animating = true;


				if ( ( ! ( /^url\("/ ).test( s ) ) ) return s;


				let id;
				do id = Math.random().toString().substring( 2 );
				while ( urls[ id ] );

				urls.push( [ e, id, s ] );

				return `{{url${ id }}}`;

			};

			const pseudoElements = new Map();

			const collectPseudoElements = e => {

				let before = null, after = null;

				const beforeStyle = getComputedStyle( e, '::before' );

				const afterStyle = getComputedStyle( e, '::after' );

				//All painted elements have width '<number>px'

				if ( beforeStyle.width !== 'auto' ) {

					before = scope.document.createElement( 'div' );

					before.style.cssText = Array.from( beforeStyle ).map( name => ( beforeStyle[ name ] !== scope._unstyle[ name ] ) ? `${ name }: ${ beforeStyle[ name ] }; ` : '' ).join( '' );

				}

				if ( afterStyle.width !== 'auto' ) {

					after = scope.document.createElement( 'div' );

					after.style.cssText = Array.from( afterStyle ).map( name => ( afterStyle[ name ] !== scope._unstyle[ name ] ) ? `${ name }: ${ afterStyle[ name ] }; ` : '' ).join( '' );

				}

				if ( before || after ) pseudoElements.set( e, [ before, after ] );

			};


			Array.from( doc.querySelectorAll( '*' ) ).

				map( e => ( collectPseudoElements( e ), [ e, getComputedStyle( e ), Array.from( getComputedStyle( e ) ) ] ) ).

				map( ( [ e, style, names ] ) => ( [ e, names.map( name => ( style[ name ] !== scope._unstyle[ name ] ) ? `${ name }:${ ( collect( style[ name ], e, name, style ) ) }; ` : '' ).join( '' ) ] ) ).

				forEach( ( [ e, cssText ] ) => cssText ? styledElements.set( e, [ cssText, e.style.cssText ] ) : null );


			//fetch css urls
			await Promise.all( urls.map( async ( [ e, id, s ] ) => {

				const [ css, ocss ] = styledElements.get( e );

				let rs = s;
				let i = 0, j = 0;
				while ( true ) {

					//getComputedStyle()'s URLs never have illegal characters. Easy parsing.
					i = s.indexOf( 'url("', j ); j = s.indexOf( '")', i );

					if ( i === - 1 || j === - 1 ) break;

					const u = s.substring( i + 5, j );

					if ( ( /^data:/ ).test( u ) ) continue;

					if ( scope._urlcache[ u ] ) {

						rs = rs.replace( u, scope._urlcache[ u ] );

						continue;

					}

					const r = new FileReader();

					const fetched = await ( new Promise( async load => {

						r.addEventListener( 'load', () => load( true ) );

						let f;

						try {

							f = await fetch( u );

						} catch ( e ) {

							load( false );

						}

						if ( ! f ) load( false );

						r.readAsDataURL( await f.blob() );

					} ) );

					if ( ! fetched ) continue;

					scope._urlcache[ u ] = `${ r.result }`;

					rs = rs.replace( u, scope._urlcache[ u ] );

				}

				styledElements.set( e, [ css.replace( `{{url${ id }}}`, rs ), ocss ] );

			} ) );



			//enable visuals
			const proxies = [];

			const _canvas = scope._proxyCanvas;

			const D = async ( i ) => {

				const [ style ] = styledElements.get( i ) || [ '' ];

				let d;

				if ( i instanceof HTMLImageElement && scope._cache[ i.src ] ) {

					d = new Image();

					var load = new Promise( load => d.onload = load );

					d.src = scope._cache[ i.src ].src;

					await load;

				}

				if ( i instanceof SVGElement ) {

					const src = 'data:image/svg+xml; charset=utf8, ' + encodeURIComponent( new XMLSerializer().serializeToString( i ) );

					d = new Image();

					var load = new Promise( load => d.onload = load );

					d.src = src;

					await load;

				}

				if ( ! d ) {

					_canvas.width = i.width || 0;
					_canvas.height = i.height || 0;

					if ( i instanceof HTMLImageElement || i instanceof HTMLVideoElement || i instanceof HTMLCanvasElement ) {

						try {

							_canvas.getContext( '2d' ).drawImage( i, 0, 0, i.width, i.height );

						} catch ( err ) { /* image may be in broken state */ }

					}

					d = new Image(); d.src = _canvas.toDataURL();

				}

				if ( i instanceof HTMLImageElement && i.src ) scope._cache[ i.src ] = d;

				d.setAttribute( 'style', style );

				return d;

			};

			await Promise.all( Array.from( doc.querySelectorAll( 'img, canvas, video, svg' ) ).map( async v => ( ( v, d ) => proxies.push( [ v.parentNode, v, d ] ) )( v, await D( v ) ) ) );


			//enable background color (svg does not officially support styling the svg root element, including background color)
			let backgroundColor = 'rgba( 0, 0, 0, 0)';

			if ( doc.querySelector( 'body' ) ) {

				backgroundColor = getComputedStyle( doc.querySelector( 'body' ) )[ 'background-color' ];

			}


			//-----------------BEGIN SYNC!------------------------
			//-------------BEGIN DO NOT REFLOW!-------------------

			//Proxied elements may have become disconnected or moved during proxy construction
			proxies.forEach( p => p[ 0 ] = p[ 1 ].parentNode );


			//freeze CSS animations
			styledElements.forEach( ( [ cssText ], e ) => ( e instanceof HTMLElement ) ? ( e.setAttribute( 'style', cssText ), e.style = cssText ) : null );
			//install proxies
			proxies.forEach( ( [ p, e, r ] ) => ( p instanceof HTMLElement && e instanceof HTMLElement && p.contains( e ) ) ? ( p.insertBefore( r, e ), p.removeChild( e ) ) : null );
			//install pseudo elements
			pseudoElements.forEach( ( [ before, after ], e ) => ( before ? ( e.firstChild ? e.insertBefore( before, e.firstChild ) : e.appendChild( before ) ) : null, after ? e.appendChild( after ) : null ) );
			//scroll elements
			scrollingElements.forEach( ( s, e ) => e.firstChild ? e.insertBefore( s, e.firstChild ) : e.appendChild( s ) );


			const xml = new XMLSerializer().serializeToString( doc.body || doc ).replace( /<!DOCTYPE html>/gmi, '' ).replace( /&gt;/gmi, '>' );

			//note: css @font-face rules require css inclusion (custom external font files loaded)
			const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ width }" height="${ height }"><style>${( css.indexOf( '@font-face' ) > -1 ) ? css : ''}</style><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;

			//unscroll elements
			scrollingElements.forEach( ( s, e ) => e.removeChild( s ) );
			//remove pseudo elements
			pseudoElements.forEach( ( [ before, after ], e ) => ( before ? e.removeChild( before ) : null, after ? e.removeChild( after ) : null ) );
			//remove proxies
			proxies.forEach( ( [ p, e, r ] ) => ( p instanceof HTMLElement && e instanceof HTMLElement ) ? ( p.insertBefore( e, r ), p.removeChild( r ) ) : null );
			//unfreeze CSS animations
			styledElements.forEach( ( [ , originalCssText ], e ) => ( e instanceof HTMLElement ) ? ( e.setAttribute( 'style', originalCssText ), e.style = originalCssText ) : null );

			//----------------end do not reflow-------------------
			//---------------------end sync-----------------------


			const image = new Image();

			image.onload = async () => {

				scope.image.width = width;
				scope.image.height = height;

				const context = scope.image.getContext( '2d' );

				//enable background-color
				context.fillStyle = backgroundColor;
				context.fillRect( 0, 0, width, height );

				let drawn = false;

				try {

					context.drawImage( image, 0, 0, width, height );

					drawn = true;

				} catch ( err ) {

					//the image is propbably tainted / cross-origin

					console.error( 'HTMLTexture: Failed to render HTML. The source may be cross-origin tainted.', err );

					drawn = false;

				}

				if ( drawn === true ) {

					scope._invalidHTMLCount = 0;

					if( scope.manualUpdate === false ) scope.needsUpdate = true;

				}

				scope._redrawing = false;

				for ( let i = 0; i < scope._queue.length; i ++ ) {

					const [ action, ...parameters ] = scope._queue[ i ];

					scope[ action ]( ...parameters );

				}

				scope._queue.length = 0;

				if ( animating === true || scope._urlQueue ) setTimeout( () => scope.requestRedraw(), Math.max( 1, (1*scope.throttle) || 0 ) );

				if( (1*scope.throttle) > 0 ) await new Promise( proceed => setTimeout( proceed, scope.throttle ) );

				resolve();

			};

			image.onerror = async () => {

				scope._invalidHTMLCount = scope._invalidHTMLCount || 0;
				scope._invalidHTMLCount ++;

				if ( scope._invalidHTMLCount > 100 ) {

					scope._init( 'about:blank' ).then( () => {

						scope.document.body.innerHTML = '<p style="color:red;">Invalid HTML. (Probably cross-origin security settings.)</p>';

					} );

				}

				console.error( 'HTMLTexture: Invalid HTML.', scope._node.contentWindow.location.href );

				scope._redrawing = false;

				for ( let i = 0; i < scope._queue.length; i ++ ) {

					const [ action, ...parameters ] = scope._queue[ i ];

					scope[ action ]( ...parameters );

				}

				scope._queue.length = 0;

				setTimeout( () => scope.requestRedraw(), Math.max( 1, (1*scope.throttle) || 0 ) );

				if( (1*scope.throttle) > 0 ) await new Promise( proceed => setTimeout( proceed, scope.throttle ) );

				resolve();

			};

			image.src = 'data:image/svg+xml; charset=utf8, ' + encodeURIComponent( svg );

		} );


		return this.redrawing;

	}

	//click event per https://www.w3.org/TR/uievents/#event-type-click
	//pointers per https://w3c.github.io/pointerevents/#pointerevent-interface
	//mouse events per https://w3c.github.io/uievents/#dom-mouseevent-mouseevent
	//except no hover, no focus, no pointercapture, no pointercancel, no dblclick

	addPointer( vec2, down ) {

		if ( this._redrawing ) this._queue.push( [ '_addPointer', vec2, { x: vec2.x, y: vec2.y }, down ] );

		else this._addPointer( vec2, vec2, down );

	}

	_addPointer( key, vec2, down ) {

		const { x, y } = vec2;

		down = !! down;


		const target = this.elementFromPoint( x, y );

		this._pointers.set( key, Object.freeze( { x, y, target, down, pointerId: this._pointerId ++ } ) );

		this._updatePointer( key, vec2, down, true );

	}

	updatePointer( vec2, down ) {

		if ( this._redrawing ) this._queue.push( [ '_updatePointer', vec2, { x: vec2.x, y: vec2.y }, down ] );

		else this._updatePointer( vec2, vec2, down );

	}

	_updatePointer( key, vec2, down, start = false ) {

		const pointer = this._pointers.get( key );

		if ( ! pointer ) return;


		const { x, y } = vec2;

		down = !! down;


		const event = { pointerId: pointer.pointerId, clientX: x, clientY: y, screenX: x, screenY: y, button: 1 * down };

		const dispatch = ( key, target, relatedTarget = null, bubble = true ) => {

			target.dispatchEvent( key === 'click' ? new Event( '' ) : new PointerEvent( 'pointer' + key, { relatedTarget, bubbles: bubble, ...event } ) );

			target.dispatchEvent( new MouseEvent( ( key === 'click' ) ? key : ( 'mouse' + key ), { relatedTarget, bubbles: bubble, ...event } ) );

		};


		const target = this.elementFromPoint( x, y );

		if ( target !== pointer.target || start ) {

			if ( pointer.target ) {

				dispatch( 'out', pointer.target, target );


				if ( ! pointer.target.contains( target ) ) {

					pointer.target.removeAttribute( 'vr-hover' );

					let parent = pointer.target.parentNode;

					while ( parent ) {

						if ( parent === target || parent.contains( target ) || ! parent.removeAttribute ) break;

						parent.removeAttribute( 'vr-hover' );

						parent = parent.parentNode;

					}

					dispatch( 'leave', pointer.target, target, false );

				}

			}

			if ( target ) {

				dispatch( 'over', target, pointer.target );

				if ( ! target.contains( pointer.target ) ) {

					target.setAttributeNode( document.createAttribute( 'vr-hover' ) );

					let parent = target.parentNode;

					while ( parent ) {

						if ( ! parent.setAttributeNode ) break;

						parent.setAttributeNode( document.createAttribute( 'vr-hover' ) );

						parent = parent.parentNode;

					}

					dispatch( 'enter', target, pointer.target, false );

				}

				dispatch( 'move', target );

			}

		}

		if ( target && ( ( down !== pointer.down ) || start ) ) {

			if ( down ) dispatch( 'down', target );

			if ( ! down ) {

				dispatch( 'up', target );

				if ( ! start ) {

					if ( typeof target.click === 'function' ) target.click();

					if ( typeof target.focus === 'function' ) target.focus();

					else dispatch( 'click', target );

				}

			}

		}

		this._pointers.set( key, Object.freeze( { x, y, target, down, pointerId: pointer.pointerId } ) );

	}

	fetchCORS( url, as ) {

		return new Promise( async load => {

			if ( typeof as === 'string' ) as = as.toLowerCase();

			if ( as !== 'blob' && as !== 'text' && as !== 'arraybuffer' && as !== 'json' && as !== 'formdata' ) {

				console.error( 'HTMLTexture.fetchCORS( url, as ): as must one of "blob", "text", "arraybuffer", or "json", got: ', as );

				load( null );

				return;

			}

			let cors;

			try {

				const u = new URL( url );

				if ( u.origin !== location.origin ) cors = true;

			} catch ( e ) {

				console.error( `HTMLTexture.fetchCORS: Invalid url "${url}"`, e );

				load( null );

				return;

			}


			let f;

			try {

				f = await fetch( url, cors ? { mode: 'cors' } : undefined );

			} catch ( e ) {

				console.error( `HTMLTexture.fetchCORS: Network error fetching "${url}" (Host may have refused CORS)`, e );

				load( null );

				return;

			}

			if ( ! f || ! f.ok ) {

				console.error( `HTMLTexture.fetchCORS: Failed fetching "${url}"`, f );

				load( null );

				return;

			}



			if ( as === 'text' ) load( await f.text() );

			if ( as === 'json' ) load( await f.json() );

			if ( as === 'blob' ) load( await f.blob() );

			if ( as === 'arraybuffer' ) load( await f.arrayBuffer() );

			if ( as === 'formdata' ) load( await f.formData() );

		} );

	}

	fetchCORSDataURL( url, mime ) {

		const scope = this;

		return new Promise( async load => {

			const b = await scope.fetchCORS( url, 'blob' );

			if ( ! b ) {

				load( null );

				return;

			}

			if ( mime && ( typeof mime === 'string' || ( typeof mime?.type === 'string' ) ) ) {

				const bmime = b.split( ';' )[ 0 ];

				if ( bmime !== mime ) {

					console.error( `HTMLTexture.fetchCORSDataURL: MIME mismatch "${url}" (Required "${mime}", got "${bmime}")` );

					load( null );

					return;

				}

			}

			const r = new FileReader();

			r.addEventListener( 'load', () => load( r.result ) );

			r.readAsDataURL( b );

		} );

	}

	elementFromPoint( x, y ) {

		const style = this._node.style;

		style.pointerEvents = 'auto';

		style.zIndex = '1000000';

		//can also support via scale, maybe preferable
		if ( x > innerWidth ) style.left = ( innerWidth / 2 ) - x;
		if ( y > innerHeight ) style.top = ( innerHeight / 2 ) - y;


		//elements in paint order, https://drafts.csswg.org/cssom-view/#dom-document-elementsfrompoint
		const elements = this.document.elementsFromPoint( x, y );

		let element = elements[ 0 ];

		for ( const next of elements ) {

			if ( next.contains( element ) ) continue;

			//found non-parent over-painted element
			else element = next;

		}


		style.left = 0;
		style.top = 0;

		style.pointerEvents = 'none';

		style.zIndex = '-1000000';

		if ( ! element || ! this.document.contains( element ) ) return null;

		return element;

	}

}

function defineHTMLTextureNode() {

	if ( ! customElements.get( 'htmltexture-node' ) ) {

		class HTMLTextureNode extends HTMLIFrameElement {

			constructor() {

				super();

				this.style.cssText = 'contain:layout; pointer-events:none; display:block; position:absolute; left:0; top:0; opacity:0.0; z-index:-1000000';

			}

		}

		customElements.define( 'htmltexture-node', HTMLTextureNode, { is: 'htmltexture-node', extends: 'iframe' } );

	}

	if ( ! customElements.get( 'htmltexture-default' ) ) {

		class HTMLTextureDefault extends HTMLElement {

			constructor() {

				super();

				this.style.cssText = 'all: initial !important;';

			}

		}

		customElements.define( 'htmltexture-default', HTMLTextureDefault, { is: 'htmltexture-default' } );

	}

	if ( ! customElements.get( 'htmltexture-scroller' ) ) {

		class HTMLTextureScroller extends HTMLElement {

			constructor( top, left ) {

				super();

				this.style.cssText = `display:block; width:0px; height:0px; margin-top:-${top}px; margin-left:-${left}px;`;

			}

		}

		customElements.define( 'htmltexture-scroller', HTMLTextureScroller, { is: 'htmltexture-scroller' } );

	}

}

HTMLTexture.prototype.isHTMLTexture = true;

export { HTMLTexture };
