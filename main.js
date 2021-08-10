//GOAL: Move to feature-complete beta (good art, local save, good ui)
//LACK: polypaint: no brush select, polymesh: grab edge, grab face
//BONUS GOAL: Subscription (+cloud save)
//LACK: user accounts, stripe

//TODO: grab edge, grab face 

//TODO: mesh export
//  - w/ triangle textures / custom import
//  - w/ mesh data only in real format


//TODO: layers panel
//TODO: make undo registrations layer-specific
//TODO: settings panel

//TODO: add layer-id to undo registration
//TODO: brush mesh layer-specific undo 'skips' other-layer sequence-end points (added from share)

/* 
    Trivial Update
    (IFF: mutated index.html)
    Replace inkforvr.app/v/{current}/index.html
    (index.html cacheing is disabled)

    Trivial Update
    (IFF: created new file)
    Add file to inkforvr.app/v/{current}/...
    (cache will not be a problem)

    Minor Update Checklist
    (IFF: mutated only main.js)
    1. replace inkforvr.app/v/{current}/main.js
    2. change inkforvr.app/v/{current}/index.html : 'main.js' -> 'main.js?v=[++N]'
    3. change inkforvr.app/v/{current}/index.html : 'version x' -> 'version x.++'

    Minor Sub-File Update Checklist
    (IFF: mutated existing file whose load url is specified in main.js)
    1. replace inkforvr.app/v/{current}/...
    2. change main.js : 'file.ext' -> 'file.ext?v=[++N]'
    3. replace inkforvr.app/v/{current}/main.js
    4. change inkforvr.app/v/{current}/index.html : 'main.js' -> 'main.js?v=[++N]'
    5. change inkforvr.app/v/{current}/index.html : 'version x' -> 'version x.++'

    Deploy Update Checklist
    (IFF: mutated existing file not loaded from main.js | changed app.js)

	1. on inkforvr.app, copy-paste new 
		'inforvr.app/v/{new}' webapp version folder
		'apps/v/{new}' nodeapp version folder
    2. comment out window.edit
	3. copy-replace:
		- main.js
		- /brushes (if needed), /ui (if needed)
		- if necessary, copy-replace: build/three.module.js
		- if necessary, copy-replace: examples/jsm/loaders/GLTFLoader.js
		- if necessary, copy-replace: examples/jsm/textures/HTMLTexture.js
	?. Server-side unchanged? Update ifv.a/rdr.js and done.
	4. copy-replace:
		- apps/v/{new}/app.js
	5. update ifv.a/rdr.php and rdr.js with new port, new app version
	6. browser go ifv.a/v/{new}/api, check console, wait for successful wss server launch
	7. ssh
		> cd app/v/{old}
		> cat output.log
		: PID...
		> kill -15 PID
		- app broadcasts: 'Update Available'
		- app stops accepting new user signups
        - app immediately backs up users file to AWS S3
        - app will exit(0) when last user disconnects
    8. After app exists, delete its node_modules/aws-sdk (>60MB)
    
*/

/*
    
    - How do layers work?
        - pipeline picks are layer-specific
        - pipeline adds/updates are layer-specific
        - TODO: undos will be layer-specific
        - TODO: every pipeline datum will have a two-part 32bit ID
        - layer.owned: self, sharer_id
        - Claim Layer:
            -> click layer
                -> owned? switch
                -> else send claim request
                    -> sharer: active? reject
                    -> sharer: else permit
                        -> sharer: mark not owned
                        -> sharer: on appended buffer:
                            -> loop own buffer, hide layer
                            -> append shared appended
                            -> loop shared, unhide layer
                            -> update own instancer
                            -> update shared instancer
            <- get response
                -> rejected? notify
                -> permitted? mark layer owned, map
            -> map layer:
                - loop shared buffer
                    -> itemize layer points
                    -> hide layer points
                    -> update shared instancer
                - loop own buffer
                    -> update layer points from items
                        -> flag item updated
                    -> loop over items
                        -> if not updated, append own buffer
                        -> send appended buffer
                    -> update own instancer

    - Share: 1 pipeline instancer per sharer

    - Layers enable shared drawing:
        - Only 1 user per layer
        - switch to a layer
        - switch will fail (lock + account icon) if other on layer
        - every undo registration must include layer id
        - undo will fail (with notice, need alert system) if other on undo's layer

    - experiment with LOD distance decision (at 0.005 now)
    - really need working layers
    - stats panel
    - clay modeling mesh?
    - user login
    - save local, open local
    - settings panel: 
        show floor grid slider
        enable / disable y-move
        copyright statement for Ink for VR
        license for 3JS
        
    - art
        - How to draw in 3d?
    - layer thumbnails
    - design ui panels / implement remaining
    - clean up controller setup function (can move comments elsewhere / to notes)
    - in addPoint / vertexShader,
        try GPU-loading chain color too, mixing to it w/ displacement vector length
        passing mixed color to fragment shader
        (on multi-colored smooth line, seeing little ellipses of different colors)
*/

/* 
Quest Chrome Debug:

1) In companion app, enable usb debugging under devices[quest]->Developer Mode->Toggle[on/off]
	(might have to have this settings panel open / phone app connected to headset to debug)
2) In CMD, cd to C:\Users\blaze\Downloads\platform-tools_r31.0.2-windows\platform-tools
3) In CMD run > adb devices (headset should be listed if connected via USB)
4) In headset, allow debugging (checked 'always', but might have to again anyway)
5) In headset browser, navigate to page
6) In Chrome on PC, go to chrome://inspect/#devices
7) Wait a few seconds for device to appear, with tabs list
8) Click 'inspect' under tab, wait for dev tools to launch and connect to tab

 */

/* 


    Note, rendering to 32-bit color channels:
        https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float
        var ext = gl.getExtension('EXT_color_buffer_float');
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA32F, 256, 256);

*/

/* 
    WARNING: Using modified version of 3JS:


    original ThreeJS:

	function vertexAttribPointer( index, size, type, normalized, stride, offset ) {

		if ( capabilities.isWebGL2 === true && ( type === 5124 || type === 5125 )  ) {


    Modified line to enable integer vector:

	function vertexAttribPointer( index, size, type, normalized, stride, offset ) {

		if ( capabilities.isWebGL2 === true && ( type === 5124 || type === 5125 || ( type === 5121 && (! normalized) ) )  ) {


 */


import * as THREE from './build/three.module.js';

import { GLTFLoader } from './examples/jsm/loaders/GLTFLoader.js';
import { HTMLTexture } from './examples/jsm/textures/HTMLTexture.js';

( function() {

    const settings = {
        lock_input: false,
        show_stats: false,
        show_floor_grid: true,
        max_points: 100000, //for PC, 10000 for quest
        movement_speed: 0.01,
        lock_vertical_movement: true,
        near: 0.1, far:7,
        initial_color: { h: 0, s: 0, l: 0.5 },
        lock_under_development: false,
        resolutionPixelsPerUnitDistance: 300,
        panel_visibilities: {
            'control': true,
            'art': true,
            'color': true,
            'file': false,

            'layers': false,
            'references': false,
            'camera': false,
            'settings': false,
            'stats': false,
        },
        panel_development_locks: {
            'control': false,
            'art': false,
            'color': false,
            'file': false,

            'layers': true,
            'references': true,
            'camera': true,
            'settings': true,
            'stats': true,
        },
        initial_active_tool: 'draw',
        tools: {
            draw: {
                size: {
                    initial: 0.01,
                    min: 0.003,
                    max: 0.1,
                },
                spacing: {
                    initial: 0.005,
                    min: 0.001,
                    max: 0.01,
                },
                blending: {
                    initial: 0.0,
                    min: 0.0,
                    max: 1.0,
                },
            },
            airbrush: {
                size: {
                    initial: 0.01,
                    min: 0.001,
                    max: 0.2,
                },
                opacity: {
                    initial:0.15,
                    min: 0.0,
                    max: 1.0,
                },
            },
            erase: {
                size: {
                    initial:0.005,
                    min: 0.001,
                    max: 0.1,
                },
            },
    
            polymesh: {
                //influence radius
                snapRadius: {
                    initial: 0.02,
                    min: 0.0,
                    max: 0.1,
                },
                vertex: {
                    initial:0.005,
                    min:0.0,
                    max:0.02,
                },
                edge: {
                    initial:0.01,
                    min:0.0,
                    max:0.02,
                },
            },
            polypaint: {
                opacity: {
                    initial: 1.0,
                    min: 0.0,
                    max: 1.0,
                },
                blend: {
                    initial: 0.5,
                    min: 0.0,
                    max: 1.0,
                },
                smear: {
                    initial: 0.5,
                    min: 0.2,
                    max: 0.8,
                },
                
                //cuboid brush config
                width: {
                    initial: 0.02,
                    min: 0.005,
                    max: 0.05,
                },
                height: {
                    initial: 1,
                    min: 0.0,
                    max: 1.0,
                },
                thickness: {
                    initial: 0.025,
                    min: 0.001,
                    max: 0.05,
                },
            },
            polydelete: {
    
            }
        },
    }
    
    const edit = {
        threejs: {
            loader: new GLTFLoader(),
            loadGLTF: ( path , material ) => new Promise( resolve => {
                edit.threejs.loader.load( path , ref => {
                    const obj = ref.scene;
                    if( material )
                        obj.traverse( child => {
                            if( child instanceof THREE.Mesh )
                                child.material = material;
                        } );
                    resolve( obj );
                } );
            } ),
            setup: () => {
                edit.threejs.setupCanvas();
                edit.threejs.setupRenderer();
    
                edit.threejs.canvas.appendChild(
                    edit.threejs.renderer.domElement
                );
    
                edit.world.setup();
    
                edit.ui.setup();
    
                edit.threejs.controls.setup();
    
                edit.world.raycaster.setup();
    
                edit.threejs.setupVRButton();

                //these functions are async; they will finish when they feel like it
                for( const pipeline in edit.pipelines ) {

                    edit.pipelines[ pipeline ].setup();
                    
                }

                for( const tool in edit.tools ) {

                    edit.tools[ tool ].setup();

                }

                /* edit.pipelines.brush.setup();
    
                edit.tools.airbrush.setup();
                edit.tools.erase.setup();
                edit.tools.draw.setup();
    
                edit.pipelines.mesh.setup();
    
                edit.tools.polymesh.setup();
                edit.tools.polypaint.setup();
    
                edit.tools.polypaint.setup(); */
    
                edit.ui.addAlphaPanels();
    
                edit.ui.activeToolName = settings.initial_active_tool;
    
                edit.ui.panels[ "art" ].loadToolsSettings( settings.tools );
                
                const {h,s,l} = settings.initial_color;
                edit.ui.panels[ "color" ].setHSL( h,s,l );
    
            },
            start: () => {

                edit.threejs.renderer.setAnimationLoop( edit.threejs.render );

            },
            stop: () => {

                edit.threejs.renderer.setAnimationLoop( () => {} );

            },
            render: ( time, frame ) => {

                const rightHand = edit.threejs.controls.getInput( 'right' );
                const leftHand = edit.threejs.controls.getInput( 'left' );
                const camera = edit.threejs.controls.getCamera();
                const activeTool = edit.tools[ edit.ui.activeToolName ];
    
    

                if( settings.lock_input === false ) {

                    if( edit.threejs.controls.disconnectEvent.right && 
                        activeTool.isTrapping( 'right' ) ) {
                        activeTool.loseTrappedInput();
                        edit.threejs.controls.disconnectEvent.right = false;
                    }
                    if( edit.threejs.controls.disconnectEvent.left && 
                        activeTool.isTrapping( 'left' ) ) {
                        activeTool.loseTrappedInput();
                        edit.threejs.controls.disconnectEvent.left = false;
                    }
        
                    if( activeTool.isTrapping( 'right' ) )
                        activeTool.handleInput( rightHand , 'right' );
                    else {
                        const rightTrapped = edit.ui.catchInput( rightHand , 'right' );
                        if( rightTrapped === false )
                            activeTool.handleInput( rightHand , 'right' );
                    }
        
        
                    if( activeTool.isTrapping( 'left' ) )
                        activeTool.handleInput( leftHand , 'left' );
                    else {
                        const leftTrapped = edit.ui.catchInput( leftHand , 'left' );
                        if( leftTrapped === false )
                            activeTool.handleInput( leftHand , 'left' );
                    }
        
        
                    let moving = edit.world.locomote( rightHand , camera , 'right' );
                    if( moving === false ) moving = edit.world.locomote( leftHand , camera , 'left' );
                    if( moving === false ) edit.world.stand();
        
                } else {

                    if( activeTool.isTrapping( 'right' ) || activeTool.isTrapping( 'left' ) ) activeTool.loseTrappedInput();
                    if( edit.world.movingKey !== null ) edit.world.stand();

                }

                edit.ui.updatePanelMatrices( camera );
                edit.ui.render( time );
    
                edit.pipelines.brush.render( time );
                edit.pipelines.mesh.render( time );
                
    
                edit.threejs.renderer.render(
                    edit.world.scene,
                    edit.world.camera
                );

            },
    
            vrButton: null,
            launchVR: null,
            currentSession: null,
            endSession: null,
            setupVRButton: () => {
                const renderer = edit.threejs.renderer;
    
                const button = document.getElementById( 'vr-launch-button' );
    
                edit.threejs.currentSession = null;
    
                const end = edit.threejs.endSession = () => {

                    edit.threejs.stop();

                    if( edit.threejs.currentSession === null ) return;
                    
                    edit.threejs.currentSession.removeEventListener( 'end' , end );

                    if( edit.threejs.renderer.xr.isPresenting ) edit.threejs.currentSession.end();

                    edit.threejs.currentSession = null;

                    button.innerText = 'Enter VR';

                    button.onclick = launchVR;

                }
    
                window.addEventListener( 'keydown' , k => {
                    
                    if( k.code === 'Escape' && edit.threejs.currentSession && edit.threejs.renderer.xr.isPresenting )

                        edit.threejs.endSession();

                } )
    
                const launchVR = async () => {

                    edit.threejs.start();

                    if( edit.threejs.currentSession === null ) {

                        button.innerText = '...';
                        button.classList.add( 'wait' );
                        button.onclick = () => {}

                        const options = {
                            optionalFeatures: [
                                'local-floor',
                                'bounded-floor',
                                //'hand-tracking'
                            ]
                        }

                        const session =
                            await navigator.xr.requestSession(
                                'immersive-vr',
                                options
                            );

                        if( session ) {

                            edit.threejs.currentSession = session;
                            session.addEventListener( 'end' , end );
                            await renderer.xr.setSession( session );
                            button.innerText = 'Exit VR';
                            button.onclick = end;

                        }

                        else {

                            button.innerText = 'Retry Enter VR';
                            button.onclick = launchVR;
                            button.classList.remove( 'wait' );

                        }
                    }

                    else {

                        edit.threejs.currentSession.end();

                    }
                }
    
                button.onclick = launchVR;
                button.innerText = 'Launch VR';
    
                edit.threejs.vrButton = button;
                edit.threejs.launchVR = launchVR;
    
            },
            canvas: null,
            setupCanvas: () => {
                const canvas = document.createElement( 'div' );
                document.getElementById( 'vr-canvas-container' ).appendChild( canvas );
                edit.threejs.canvas = canvas;
                window.addEventListener( 'resize' , () => {
                    const camera = edit.world.camera;
                    const renderer = edit.threejs.renderer;
    
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                
                    renderer.setSize( window.innerWidth, window.innerHeight );
                } );
            },
            renderer: null,
            setupRenderer: () => {
                const renderer = new THREE.WebGLRenderer( { antialias: false } );
                renderer.setPixelRatio( window.devicePixelRatio );
                renderer.setSize( window.innerWidth, window.innerHeight );
                renderer.outputEncoding = THREE.sRGBEncoding;
                renderer.xr.enabled = true;
                edit.threejs.renderer = renderer;
            },
            controls: {
                object: null,
                triggerThreshhold: 0.05 ,
                backupInput: {
                    'left': null,
                    'right': null,
                    'camera': null,
                },
                loadSystemFromMatrixElements: ( a , m ) => {
                    a.x = m[12]; a.y = m[13]; a.z = m[14];
    
                    a.xAxis.x = m[0]; a.xAxis.y = m[1]; a.xAxis.z = m[2];
                    a.yAxis.x = m[4]; a.yAxis.y = m[5]; a.yAxis.z = m[6];
                    a.zAxis.x = m[8]; a.zAxis.y = m[9]; a.zAxis.z = m[10];
                },
                createBlankInput: () => ( {
                    connected: false,
                    hand: null,
    
                    x:0,y:0,z:0,
    
                    xAxis: {x:0,y:0,z:0},
                    yAxis: {x:0,y:0,z:0},
                    zAxis: {x:0,y:0,z:0},
    
                    mode: 'blank',
                    selecting: false, //holding trigger or pinching
    
                    //things we can do with controllers but not hand tracking                
                    axes: {x:0,y:0}, //thumbstick
                    top: 0,bottom: 0, //UI buttons
                    trigger: 0,grip: 0, //tool buttons
                    thumb: 0, //
    
                    controller: null,
                } ),
    
                getInput: hand => {
                    let mode = 'controllers';
                    //let mode = 'handtracking';
    
                    if( mode === 'controllers' ) {
                        //controllers
                        const controls = edit.threejs.controls;
                        const a = controls.controllerA, b = controls.controllerB;
                        let c = null;
    
                        if( a && a.handedness === hand ) c = a;
                        else if( b && b.handedness === hand ) c = b;
                        else return controls.backupInput[ hand ];
    
                        if( c.connected === false ) {
                            controls.backupInput[ hand ].connected = false;
                            return controls.backupInput[ hand ];
                        }
    
                        const input = controls.createBlankInput();
    
                        input.mode = 'controller';
    
                        input.connected = true;
    
                        input.hand = hand;
    
                        if( c.gamepad ) {
                            if( c.gamepad.buttons[0] !== undefined )
                                input.trigger = c.gamepad.buttons[0].value;
                            if( c.gamepad.buttons[1] !== undefined )
                                input.grip = c.gamepad.buttons[1].value;
                            if( c.gamepad.buttons[3] !== undefined )
                                input.thumb = c.gamepad.buttons[3].value;
                            if( c.gamepad.buttons[4] !== undefined )
                                input.bottom = c.gamepad.buttons[4].value;
                            if( c.gamepad.buttons[5] !== undefined )
                                input.top = c.gamepad.buttons[5].value;
                            
                            if( c.gamepad.axes[2] !== undefined )
                                input.axes.x = c.gamepad.axes[2];
                            if( c.gamepad.axes[3] !== undefined )
                                input.axes.y = c.gamepad.axes[3];
                        }
    
                        input.controller = c;
    
                        if( input.trigger > controls.triggerThreshhold )
                            input.selecting = true;
                        else input.selecting = false;
    
                        controls.loadSystemFromMatrixElements( input , c.matrixWorld.elements );
    
                        //update backup input
                        controls.backupInput[ hand ] = input;
                        return input;
                    }
                    if( mode === 'handtracking' ) {
                        const h = null; //get hand
                        const input = controls.createBlankInput();
                        input.mode = 'hand';
                        //update backup input
                        controls.backupInput[ hand ] = input;
                        return input;
                    }
                },
                createBlankCamera: () => ( {
                    x:0,y:0,z:0,
    
                    xAxis: {x:0,y:0,z:0},
                    yAxis: {x:0,y:0,z:0},
                    zAxis: {x:0,y:0,z:0},
    
                    vr: false,
                } ),
                getCamera: () => {
                    const controls = edit.threejs.controls;
                    const camera = controls.createBlankCamera();
    
                    let matrixElements = null;
    
                    camera.vr = edit.threejs.renderer.xr.isPresenting ? true : false;
                                    
                    if( camera.vr === true ) {
                        const vrCamera = edit.threejs.renderer.xr.getCamera( edit.world.camera );
                        if( vrCamera ) matrixElements = vrCamera.matrixWorld.elements;
                        else camera.vr = false;
                    }
                    if( camera.vr === false )
                        matrixElements = edit.world.camera.matrixWorld.elements;
                    
                    controls.loadSystemFromMatrixElements( camera , matrixElements );
    
                    edit.threejs.controls.backupInput.camera = camera;
                    return camera;
                },
    
                size:1290,
                controllerRenderMaps: {
                    right: {
                        controllerColor: { x:645 + 40*0, y:646 + 40*0, w:40,h:40 },
                        thumbColor:      { x:645 + 40*2, y:646 + 40*0, w:40,h:40 },
                        topColor:        { x:645 + 40*4, y:646 + 40*0, w:40,h:40 },
                        bottomColor:     { x:645 + 40*6, y:646 + 40*0, w:40,h:40 },
                        triggerColor:    { x:645 + 40*8, y:646 + 40*0, w:40,h:40 },
                        gripColor:       { x:645 + 40*9, y:646 + 40*0, w:40,h:40 },
    
                        top: { x:57,y:57,w:200,h:226 },
                        bottom: { x:94,y:353,w:200,h:226 },
                        thumb: { x:334,y:112,w:276,h:269 },
                        system: { x:392,y:463,w:143,h:139 },
                        triggerFace: { x:680,y:25 , w:265,h:378 },
                        triggerLabel: { x:680,y:403 , w:265,h:208 },
                        gripFace: { x:990,y:25 , w:265,h:378 },
                        gripLabel: { x:990,y:403 , w:265,h:208 },
                    },
                    left: {
                        controllerColor: { x:645 + 40*1, y:646 + 40*1, w:40,h:40 },
                        thumbColor:      { x:645 + 40*3, y:646 + 40*1, w:40,h:40 },
                        topColor:        { x:645 + 40*5, y:646 + 40*1, w:40,h:40 },
                        bottomColor:     { x:645 + 40*7, y:646 + 40*1, w:40,h:40 },
                        triggerColor:    { x:645 + 40*8, y:646 + 40*1, w:40,h:40 },
                        gripColor:       { x:645 + 40*9, y:646 + 40*1, w:40,h:40 },
    
                        top: { x:1052,y:700,w:200,h:226 },
                        bottom: { x:1016,y:997,w:200,h:226 },
                        thumb: { x:699,y:756,w:276,h:269 },
                        system: { x:775,y:1103,w:143,h:139 },
                        triggerFace: { x:367,y:672 , w:265,h:378 },
                        triggerLabel: { x:367,y:1050 , w:265,h:208 },
                        gripFace: { x:57,y:672 , w:265,h:378 },
                        gripLabel: { x:57,y:1050 , w:265,h:208 },
                    },
                },
                initialRenderControllers: () => {
                    const controls = edit.threejs.controls;
                    const ctx = controls.controllerCanvas.getContext( "2d" );
                    const maps = controls.controllerRenderMaps;
                    const size = controls.size;
    
                    const RR = ( r , c ) => {
                        ctx.fillStyle = c;
                        ctx.fillRect( r.x , r.y , r.w , r.h );
                    }
                    const CR = ( r , c ) => ctx.clearRect( r.x , r.y , r.w , r.h );
    
                    const theme = edit.ui.theme;
    
                    for( const c of [ 'left' , 'right' ] ) {
                        const map = maps[ c ];
                        RR( map.controllerColor , theme.panelColor );
                        RR( map.thumbColor , theme.shadowColor );
                        RR( map.topColor , theme.shadowColor );
                        RR( map.bottomColor , theme.shadowColor );
                        RR( map.triggerColor , theme.shadowColor );
                        RR( map.gripColor , theme.shadowColor );
    
                        CR( map.top );
                        CR( map.bottom );
                        CR( map.thumb );
                        CR( map.system );
    
                        RR( map.triggerFace , theme.panelColor );
                        CR( map.triggerLabel );
    
                        RR( map.gripFace , theme.panelColor );
                        CR( map.gripLabel );
                    }
    
                    controls.updateControllerMaterial();
                },
                renderControllerLabel: ( controller , label , callback ) => {
                    if( controller.hand === null ) return false;
                    const controls = edit.threejs.controls;
                    const maps = controls.controllerRenderMaps;
                    const ctx = controls.controllerCanvas.getContext( "2d" );
                    const map = maps[ controller.hand ][ label ];
                    callback( ctx , map );
                },
    
                controllerCanvas: null,
                updateControllerMaterial: ()=>{},
                setupControllerMeshes: async () => {
                    const controls = edit.threejs.controls;
                    const size = controls.size;
    
                    const canvas = document.createElement( "canvas" );
                    canvas.width = size; canvas.height = size;
    
                    controls.controllerCanvas = canvas;
    
                    const texture = new THREE.CanvasTexture(
                        canvas,
                        THREE.UVMapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.LinearFilter,
                        THREE.LinearFilter
                    );
                    //Blender UV editing assumes unflipped Y texture
                    texture.flipY = false;
    
                    const uniforms = { 'canvas': { type: 't' , value: texture } };
    
                    const vertexShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform mat4 projectionMatrix;
                        uniform mat4 modelViewMatrix;
    
                        in vec3 position;
                        in vec2 uv;
                        
                        out highp vec2 vUV;
    
                        void main() {
                            vUV = uv;
                            gl_Position = projectionMatrix *
                                modelViewMatrix *
                                vec4( position , 1.0 );
                        }`;
                        
                    const fragmentShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform sampler2D canvas;
                        in highp vec2 vUV;
    
                        out vec4 finalColor;
    
                        void main() {
                            highp vec4 canvasColor = texture( canvas , vUV );
                            if( canvasColor.a < 0.008 ) discard;
                            finalColor = vec4( canvasColor.rgb , min( 0.5 , canvasColor.a ) ); 
                        }`;
    
                    const material = new THREE.RawShaderMaterial( {
                        uniforms,
                        vertexShader,
                        fragmentShader,
                        side: THREE.DoubleSide,
                        //transparent: true,
                    } );
    
                    const halfMaterial = new THREE.RawShaderMaterial( {
                        uniforms,
                        vertexShader,
                        fragmentShader,
                        depthTest: false,
                        depthWrite: false,
                        transparent: true,
                        opacity: 0.5,
                        side: THREE.DoubleSide ,
                    } );
    
                    controls.updateControllerMaterial = () => {
                        texture.needsUpdate = true;
                        material.needsUpdate = true;
                    }
    
                    const leftMesh = await edit.threejs.loadGLTF( 'ui/world/Touch-Controller-Left.glb' , material );
                    const rightMesh = await edit.threejs.loadGLTF( 'ui/world/Touch-Controller-Right.glb' , material );
                    const leftHalfMesh = await edit.threejs.loadGLTF( 'ui/world/Touch-Controller-Left.glb' , halfMaterial );
                    const rightHalfMesh = await edit.threejs.loadGLTF( 'ui/world/Touch-Controller-Right.glb' , halfMaterial );
    
                    return [ leftMesh , rightMesh , leftHalfMesh , rightHalfMesh ];
                },
    
                disconnectEvent: {},
                registerDisconnect: hand => {
                    edit.threejs.controls.disconnectEvent[ hand ] = true;
                },
                controllerA: null,
                controllerB: null,
                setup: async () => {
                    const controls = edit.threejs.controls;
                    const container = edit.world.container;
    
                    //populate backup input
                    controls.backupInput.camera = controls.createBlankCamera();
                    controls.backupInput.left = controls.createBlankInput();
                    controls.backupInput.right = controls.createBlankInput();
    
    
                    const controllerA = edit.threejs.renderer.xr.getController( 0 );
                    controllerA.mesh = { visible: false };
                    controllerA.connected = false;
                    controllerA.addEventListener( 'connected', function ( event ) {
                        controllerA.gamepad = event.data.gamepad;
                        controllerA.profiles = event.data.profiles;
                        controllerA.handedness = event.data.handedness;
    
                        controllerA.mesh.visible = true;
                        controllerA.connected = true;
                    } );
                    controllerA.addEventListener( 'disconnected', function () {
                        controls.registerDisconnect( controllerA.handedness );
    
                        controllerA.mesh.visible = false;
                        controllerA.connected = false;
                    } );
                    controls.controllerA = controllerA;
                    container.add( controllerA );
                    
    
                    const controllerB = edit.threejs.renderer.xr.getController( 1 );
                    controllerB.mesh = { visible: false };
                    controllerB.connected = false;
                    controllerB.addEventListener( 'connected', function ( event ) {
                        controllerB.gamepad = event.data.gamepad;
                        controllerB.profiles = event.data.profiles;
                        controllerB.handedness = event.data.handedness;
    
                        controllerB.mesh.visible = true;
                        controllerB.connected = true;
                    } );
                    controllerB.addEventListener( 'disconnected', function () {
                        controls.registerDisconnect( controllerB.handedness );
    
                        controllerB.mesh.visible = false;
                        controllerB.connected = false;
                    } );
                    controls.controllerB = controllerB;
                    edit.world.container.add( controllerB );
    
    
                    const [ leftControllerMesh , rightControllerMesh , 
                        leftGhostMesh , rightGhostMesh ] = 
                        await controls.setupControllerMeshes();
    
                    controls.initialRenderControllers();
                    edit.ui.initialRenderControllers();
    
                    controllerA.add( leftControllerMesh );
                    controllerA.add( leftGhostMesh );
                    controllerA.mesh = leftControllerMesh;
    
                    controllerB.add( rightControllerMesh );
                    controllerB.add( rightGhostMesh );
                    controllerB.mesh = rightControllerMesh;
                },
            }
        },
    
        ui: {
            iconsLoaded: true,
            icons: {},
    
            prepareLocalOpen: ( openButton ) => {

                const fileInput = document.createElement( 'input' );

                fileInput.type = 'file';
                fileInput.style.display = 'none';
                fileInput.setAttribute( 'accept', '.json, text/json' );

                fileInput.addEventListener( 'change', async () => {

                    const url = URL.createObjectURL( fileInput.files[ 0 ] );

                    let json;

                    try {

                        json = await ( await fetch( url ) ).json();

                    } catch {

                        console.error( "Failed to open file." );
                        openButton.querySelector( 'span' ).textContent = 'Retry';
                        return;

                    }

                    await edit.ui.load( json );
                    openButton.querySelector( 'span' ).textContent = 'Loaded ✓';

                } );

                openButton.parentNode.insertBefore( fileInput, openButton );

                openButton.onclick = () => {
                    openButton.querySelector( 'span' ).textContent = '...';
                    fileInput.click();
                }

            },
            prepareLocalSave: ( saveButton ) => {
    
                let triggerSave;
    
                const saveInit = () => {
    
                    saveButton.onclick = null;
                    saveButton.classList.add( 'loading' );
    
                    triggerSave.then(
                        download => {
                            download();
                            saveButton.classList.remove( 'loading' );
                            saveButton.onclick = saveInit;
                        }
                    )
    
                };
    
                triggerSave = new Promise( async load => {
    
                    const json = await edit.ui.serializePipelineSaves();
    
                    let fileName = 'save.json';

                    fileName = fileName.replace( /[^a-zA-Z0-9_\-+!() ]/gm, '' ).substring( 0, 248 ) + '.json';

                    const download = await edit.ui.downloadLocalJSONFile( fileName, json );
    
                    load( download );
    
                } );
    
                saveButton.onclick = saveInit;
    
            },
            serializePipelineSaves: async () => {

                const jsonSrc = {};
    
                for( const pipeline in edit.pipelines ) {

                    const jsonPart = await edit.pipelines[ pipeline ].serializeSave();

                    jsonSrc[ pipeline ] = jsonPart;

                }
    
                const file = JSON.stringify( jsonSrc );

                return file;

            },
            downloadURL: null,
            downloadLocalJSONFile: async ( fileName, json ) => {

                if( edit.ui.downloadURL ) URL.revokeObjectURL( edit.ui.downloadURL );
    
                const a = document.createElement( 'a' );
                a.style.display = 'none';
    
                const blob = new Blob( [json], { type: 'text/json' } );
                const url = URL.createObjectURL( blob );
                a.download = fileName;
                a.href = url;
    
                edit.ui.downloadURL = url;
    
                return () => {
                    document.body.appendChild( a );
                    a.click();
                    document.body.removeChild( a );
                }
    
            },
            load: async ( json ) => {
                
                const isDataURL = /^data:([a-z]+\/[a-z0-9-+.]+(;[a-z-]+=[a-z0-9-]+)?)?;base64,([a-z0-9+/]+={0,2})$/i;
    
                for( const pipeline in json ) {

                    const jsonPart = json[ pipeline ];
                    const { buffers } = jsonPart;

                    for( const name in buffers ) {

                        const dataURL = buffers[ name ];
    
                        if( ! isDataURL.test( dataURL.trim() ) && dataURL !== 'data:application/octet-stream;base64,' && dataURL !== 'data:' && dataURL !== '' ) {
        
                            console.error( `Data URL['${name}'] for ${pipeline} could not be read. Failed to load file.` );

                            return "fail";
                            
                        }

                    }

                }

                let failure = 0;

                for( const pipeline in json ) {

                    if( ! edit.pipelines.hasOwnProperty( pipeline ) ) {

                        console.warn( `File is for a different version. Some data cannot be displayed.` );

                        ++ failure;

                    }

                    else {

                        const jsonPart = json[ pipeline ];

                        edit.pipelines[ pipeline ].reset();

                        await edit.pipelines[ pipeline ].load( jsonPart );

                    }

                }

                if( failure > 0 ) return "partial-fail";

                return "success";

            },
            resetAllPipelines: () => {

                for( const pipeline in edit.pipelines )

                    edit.pipelines[ pipeline ].reset();

            },
    
            initialRenderControllers: () => {
                //hmmm...
            },
            renderControllers: ( left , right ) => {
                const controls = edit.threejs.controls;
                const labels = { left:[] , right:[] };
                for( const label of labels.left ) {
                    controls.renderControllerLabel( left , label.key ,
                        ( ctx , rect ) => {
    
                        }
                    )
                }
                for( const label of labels.right ) {
                    controls.renderControllerLabel( right , label.key ,
                        ( ctx , rect ) => {
                            
                        }
                    )
                }
            },
    
            activeToolName: "",
            setActiveToolName: name => {
                edit.tools[ edit.ui.activeToolName ].loseTrappedInput();
                edit.tools[ edit.ui.activeToolName ].deactivate();
                edit.ui.activeToolName = name;
                edit.tools[ name ].activate();
            },
            loseToolInputs: () => {
                for( const toolName in edit.tools )
                    edit.tools[ toolName ].loseTrappedInput();
            },

            undoList: [],
            redoList: [],

            addUndo: toolId => {
                
                edit.ui.undoList.push( toolId );

            },

            clearUndo: () => {
                edit.ui.undoList.length = 0;
                edit.ui.redoList.length = 0;
                for( const toolName in edit.tools )
                    edit.tools[ toolName ].clearUndo();
                for( const pipelineName in edit.pipelines )
                    edit.pipelines[ pipelineName ].clearUndo();
            },

            clearRedo: () => {
                edit.ui.redoList.length = 0;
    
                for( const toolName in edit.tools )
                    edit.tools[ toolName ].clearRedo();
                for( const pipelineName in edit.pipelines )
                    edit.pipelines[ pipelineName ].clearRedo();

            },

            undo: () => {
                const undoList = edit.ui.undoList;
                if( undoList.length === 0 ) return;
                const undoToolId = undoList.pop();
                //tools can choose whether to allow redo
                const redoToolId = edit.tools[ undoToolId ].undo();
                if( redoToolId )
                    edit.ui.redoList.push( redoToolId );
            },
            redo: () => {
                const redoList = edit.ui.redoList;
                if( redoList.length === 0 ) return;
                const redoToolId = redoList.pop();
                //tools can choose whether to allow un-redo
                const undoToolId = edit.tools[ redoToolId ].redo();
                if( undoToolId )
                    edit.ui.undoList.push( undoToolId );
            },
            
            uiDock: {
                clockwise: true,
                gap: 0.03, //between panels
                radius: 0.5,
                angle: 0.4,
                dip: 0.05, //descend from camera y
                actual: { x:0,y:0,z:0 },
                //speed: 0.01, //follow artist speed
                speed: 0.1, //follow artist speed
                follow: true,
            },
            updatePanelMatrices: camera => {
                const { x:X , y:Y , z:Z } = camera;
    
                const uiDock = edit.ui.uiDock;
                const dvec = {
                    x: X - uiDock.actual.x,
                    y: Y - uiDock.actual.y,
                    z: Z - uiDock.actual.z,
                };
                const d = Math.sqrt( dvec.x**2 + dvec.y**2 + dvec.z**2 );
                const speed = uiDock.speed;
                if( d < speed ) uiDock.actual = { x:X,y:Y,z:Z };
                else {
                    //normalize displacement vector, scale to speed
                    dvec.x = speed * dvec.x / d;
                    dvec.y = speed * dvec.y / d;
                    dvec.z = speed * dvec.z / d;
                    uiDock.actual.x += dvec.x;
                    uiDock.actual.y += dvec.y;
                    uiDock.actual.z += dvec.z;
                }
                const {x:ax , y:ay, z:az} = uiDock.actual;
                
                const circumdirection = uiDock.clockwise ?
                    ( Math.PI * 2 ) : ( - Math.PI * 2 );
                const circumference = Math.PI * 2 * uiDock.radius;
                const forwardAngle = 3.141;
                const angle = forwardAngle + uiDock.angle;
                let delta = 0;
                for( const order of [ 'visible', 'hidden' ] )
                    for( const panelName in edit.ui.panels ) {
                        const panel = edit.ui.panels[ panelName ];
                        if( panel.visible === false ) {
                            panel.mesh.visible = false;
                            panel.transparentMesh.visible = false;
                            if( order === 'visible' ) continue;
                        }
                        else {
                            panel.mesh.visible = true;
                            panel.transparentMesh.visible = true;
                            if( order === 'hidden' ) continue;
                        }

                        if( edit.ui.grip.isFocused( panel ) ) {
                            edit.ui.panel.extractPosition( panel );
                            continue;
                        }

                        if( uiDock.follow === true ) {
                            const arc = ( uiDock.gap + panel.worldWidth ) / circumference;
                            if( uiDock.clockwise === false ) delta += arc * circumdirection;
                            const dx = uiDock.radius * Math.cos( angle + delta );
                                const cdx = uiDock.radius * Math.cos( angle + delta + (arc*circumdirection*0.5) );
                            const dz = uiDock.radius * Math.sin( angle + delta );
                                const cdz = uiDock.radius * Math.sin( angle + delta + (arc*circumdirection*0.5) );
                            const p = { x:ax+dx , y:ay-uiDock.dip , z: az+dz };
                            const dp = { x:ax+cdx , y:ay-uiDock.dip , z: az+cdz };
                            const forwardAxis = { x:ax-dp.x, y:ay-dp.y, z:az-dp.z };
                            edit.ui.panel.setPosition( panel , p.x,p.y,p.z , forwardAxis );
                            if( uiDock.clockwise === true ) delta += arc * circumdirection;
                        }
                        else {
                            //update panel vectors from ThreeJS's computed matrices
                            edit.ui.panel.extractPosition( panel );
                        }
                    }

            },
            setup: () => {
                const scene = edit.world.scene;
                for( const name in edit.ui.panels ) {
                    const panel = edit.ui.panels[ name ]();
                    edit.ui.panels[ name ] = panel;
                    scene.add( panel.mesh );
                    panel.requestRedraw();
                }
            },
            addAlphaPanels: () => {
                for( const name in edit.ui.panels ) {
                    const panel = edit.ui.panels[ name ];
                    edit.world.scene.add( panel.transparentMesh );
                }
            },
            theme: {
                textColor: 'rgb(220,220,220)',
                panelColor: 'rgb(30,30,30)',
                shadowColor: 'rgb(18,18,18)',
            },
            panels: {
                "control": () => {
    
                    const width = 291;
                    const height = 1824;
    
                    const buttonClicks = {
    
                        'toggle-follow': { flip: element => {
                            
                            edit.ui.uiDock.follow = ! edit.ui.uiDock.follow 
    
                            if( edit.ui.uiDock.follow === true ) element.onclick( 'on' );
    
                            if( edit.ui.uiDock.follow === false ) element.onclick( 'off' );
                        
                        } },
    
                    }
    
                    for( const panelName in settings.panel_visibilities ) {
    
                        if( panelName === 'control' ) continue;
    
                        buttonClicks[ 'button-panel-' + panelName ] = { flip: () => edit.ui.panel.flipVisibility( panelName ) , panelName };
    
                    }
    
                    
                    const buttons = [];
                    const tracks = [];
    
                    let repaintRequired = false;
    
                    //html redraw must declare whether or not it repainted the html
                    const redraw = async panel => {
    
                        if( repaintRequired === false ) {
    
                            return false;
    
                        }
    
                        if( repaintRequired === true ) {
                            
                            await panel.htmlTexture.redrawing;
    
                            await panel.htmlTexture.requestRedraw();
    
                            repaintRequired = false;
    
                            return true;
                        }
    
                    }
    
    
                    const onload = htmlTexture => {
    
                        const { create } = edit.ui.button;
    
                        for( const id in buttonClicks ) {
    
                            const element = htmlTexture.document.getElementById( id );

                            if( element === null ) continue;

                            const { flip, panelName } = buttonClicks[ id ];
    
                            if( panelName && settings.lock_under_development ) {
    
                                const lock = settings.panel_development_locks[ panelName ];
    
                                if( lock ) {
    
                                    const element = htmlTexture.document.getElementById( id );
                                    element.parentNode.removeChild( element );
    
                                    continue;
    
                                }
    
                            }
    
                            const click = () => {
    
                                if( id === 'toggle-follow' ) flip( button.element );
    
                                else {
    
                                    button.element.click();
    
                                    flip();    
    
                                }
    
                                repaintRequired = true;
    
                            }
    
                            const rect = element.getClientRects()[ 0 ];
    
                            const button = create.rect( rect.left, rect.top, rect.width, rect.height, click );
    
                            button.element = element;
    
                            buttons.push( button );
    
                        }
    
                    };
    
                    //oninit may modify and repaint the html if necessary
                    const oninit = async htmlTexture => {
    
                        for( const id in buttonClicks ) {
    
                            const { panelName } = buttonClicks[ id ];
    
                            if( panelName ) {
    
                                const element = htmlTexture.document.getElementById( id );
                                if( element === null ) continue;

                                const visible = settings.panel_visibilities[ panelName ];
                                const i = element.querySelectorAll( '.icon' )[ 1 ];
    
                                if( visible ) i.textContent = '☑';
    
                                else i.textContent = '☐';
    
                            }
    
                        }
    
                        await htmlTexture.requestRedraw();
    
                    }
    
                    const controlPanel = edit.ui.panel.createHTML(
                        'control', width , height , tracks, buttons , redraw, 'ui/panels/control.html', onload, oninit
                    );
    
                    return controlPanel;
    
                },
                "art": () => {
    
                    const width = 927;
                    const height = 1348;
    
                    
                    const buttons = [];
    
                    const activatedTabs = new Set();
                    const buttonsToCapture = [];
    
                    const activate = tab => {
    
                        for( const track of tracks ) {
                            
                            track.visible = false;

                            if( track.tab === tab ) {

                                track.visible = true;
                                
                                const f = track.getFloat();
        
                                track.update( f );

                            }

                        }
    
                        for( const button of buttons ) 
    
                            if( button.guide ) {
                                
                                button.visible = button.tab === tab;
    
                                if( ! activatedTabs.has( button.tab ) ) buttonsToCapture.push( button );

                            }
    
                        activatedTabs.add( tab );
                        
    
                        repaintRequired = true;
    
    
                        edit.ui.setActiveToolName( tab );
    
                    }
    
                    
                    const update = ( f, tool, option ) => {
    
                        const { min, max } = settings.tools[ tool ][ option ];
    
                        const value = min + ( f * ( max - min ) );
    
                        edit.tools[ tool ].config[ option ] = value;
    
                    }
    
                    //TODO: Move height aspect ratio math to polypaint.config with _ variable, getter/setter
                    const updates = {
    
                        'polypaint': {
    
                            'width': f => {
    
                                update( f, 'polypaint', 'width' );
    
                                const height = tracks.find( ( { tab, option } ) => tab === 'polypaint' && option === 'height' );
    
                                const fh = height.getFloat();
    
                                height.update( fh );
    
                            },
    
                            'height': f => {
    
                                const { config } = edit.tools.polypaint;
    
                                config.height = f * config.width;
    
                            }
    
                        }
    
                    }
    
                    const tracks = [];
    
    
                    let repaintRequired = false;
    
                    //html redraw must declare whether or not it repainted the html
                    const redraw = async panel => {
    
                        for( const track of tracks ) {
    
                            if( track.visible === false ) continue;
    
                            const f = track.getFloat();
    
                            track.update( f );
    
                        }
    
                        if( repaintRequired === false ) {
    
                            return false;
    
                        }
    
                        if( repaintRequired === true ) {
                            
                            await panel.htmlTexture.redrawing;
    
                            await panel.htmlTexture.requestRedraw();
    
                            if( buttonsToCapture.length ) {
    
                                for( const button of buttonsToCapture ) {
    
                                    panel.captureButtonImageData( button );

                                    if( button.element.getAttribute( 'initial-active' ) !== null )
                                        button.element.classList.add( 'active' );
    
                                }
    
                                buttonsToCapture.length = 0;
    
                            }

                            await panel.htmlTexture.requestRedraw();

                            repaintRequired = false;
    
                            return true;
    
                        }
    
                    }
    
                    //html onload must not cause reflowing changes to the document
                    const onload = htmlTexture => {
    
                        const menu = htmlTexture.document.querySelector( '.menu' );
    
                        const buttonElements = Array.from( menu.querySelectorAll( '.button' ) );
    
                        const createButton = edit.ui.button.create.rect;
    
                        buttonElements.forEach( element => {
    
                            const tab = element.getAttribute( 'tab' );
    
                            const rect = element.getClientRects()[ 0 ];
    
                            const click = () => {
    
                                activate( tab );
    
                                element.click();
    
                                repaintRequired = true;
    
                            }
    
                            const left = parseInt( rect.left )
                            const top = parseInt( rect.top );
                            const width = parseInt( rect.width );
                            const height = parseInt( rect.height );
    
                            const button = createButton( left, top, width, height, click );
    
                            button.element = element;
                            button.tab = tab;
    
                            buttons.push( button );
    
                        } );
    
                        const tabs = Array.from( htmlTexture.document.querySelectorAll( ".tab" ) );

                        tabs.forEach( element => {
                            if( element.getAttribute( 'initial-active' ) !== null ) {
                             
                                const tab = element.getAttribute( 'tab' );
                                activatedTabs.add( tab );

                            }
                        })
    
                        const guideButtonElements = Array.from( htmlTexture.document.querySelectorAll( ".button.guide" ) );
    
                        guideButtonElements.forEach( element => {
    
                            const tab = element.getAttribute( 'tab' );
                            const guide = element.getAttribute( 'guide' );
    
                            const rect = element.getClientRects()[ 0 ]
    
                            const click = () => {
    
                                element.click();
                                
                                edit.tools[ tab ].activateGuide( guide );
    
                                repaintRequired = true;
    
                            }
    
                            const left = parseInt( rect.left )
                            const top = parseInt( rect.top );
                            const width = parseInt( rect.width );
                            const height = parseInt( rect.height );
    
                            const button = createButton( left, top, width, height, click );
    
                            button.element = element;
                            button.guide = guide;
                            button.tab = tab;
    
                            buttons.push( button );
    
                        } );
    
    
                        const trackElements = Array.from( htmlTexture.document.querySelectorAll( '.head' ) );
    
                        const createTrack = edit.ui.track.create.horizontalLine;
    
                        trackElements.forEach( element => {
    
                            const rect = element.getClientRects()[ 0 ];
    
                            const line = element.parentNode;
                            const lineRect = line.getClientRects()[ 0 ];
    
                            const radius = parseInt( rect.height / 2 );
                            const x = parseInt( rect.left );
                            const y = parseInt( lineRect.top + lineRect.height/2 );
                            const minX = x;
                            const maxX = x + parseInt( lineRect.width ) - parseInt( rect.height );
    
                            const track = createTrack( x, y, minX, maxX, radius );
    
                            const tab = element.getAttribute( 'tab' );
                            const option = element.getAttribute( 'option' );
    
                            track.element = element;
                            track.tab = tab;
                            track.option = option;
                            
                            const { min, max, initial } = settings.tools[ tab ][ option ];
    
                            const f = ( initial - min ) / ( max - min );
                            track.setFloat( f );
    
                            track.tab = tab;
                            track.option = option;
    
                            const setUpdate = updates[ tab ] ? ( updates[ tab ][ option ] ? updates[ tab ][ option ] : update ) : update;
    
                            track.update = f => setUpdate( f, tab, option );
    
                            track.visible = tab === settings.initial_active_tool;
    
                            tracks.push( track );
    
                        }   );
    
                    }
    
                    //oninit may modify and repaint the html if necessary
                    const oninit = async () => {
    
                        // track positions are handled from panel redraw
                        // we only update track floats
    
                    }
    
                    const artPanel = edit.ui.panel.createHTML(
    
                        'art', width, height, tracks, buttons, redraw, 'ui/panels/art.html', onload, oninit
    
                    );
    
                    artPanel.loadToolsSettings = configs => {
    
                        for( const tool in configs )
    
                            for( const option in configs[ tool ] )
    
                                edit.tools[ tool ].config[ option ] = configs[ tool ][ option ].initial;
                            
                    }
    
                    return artPanel;
    
                },
    
                "color": () => {
                    //color wheel does not use HTML-based rendering

                    const outlineInfo = {w:1134,h:1878};
                    const os = edit.ui.panel.outlineScale;
                    const width = outlineInfo.w*os;
                    const height = outlineInfo.h*os;
    
                    const trackHandleSize = 45;
                    const trackCenter = { x:outlineInfo.w/2,y:outlineInfo.h/2 };
                    const trackInfos = [
                        {kind:'arc',minX:157,maxX:971,baseY:591},
                        {kind:'ring', radius:380 },
                        {kind:'arc',minX:157,maxX:971,baseY:1287},
                    ]
    
                    const tracks = [];
    
                    for( const info of trackInfos ) {
                        let track = null;
                        if( info.kind === 'arc' ) track =
                            edit.ui.track.create.horizontalArc(
                                info.minX*os, info.maxX*os , info.baseY*os ,
                                trackCenter.x*os , trackCenter.y*os ,
                                trackHandleSize*os,
                            );
                        if( info.kind === 'ring' ) track =
                            edit.ui.track.create.arc(
                                trackCenter.x*os , trackCenter.y*os ,
                                info.radius*os ,
                                trackHandleSize*os,
                            );
    
                        track.setFloat( 0 );
                        tracks.push( track );
                    }
                    
                    const selectorImage = new Image();
                    let selectorImageLoaded = false;
                    selectorImage.onload = () => {
                        selectorImageLoaded = true;
                        colorSelector.redraw();
                    }
                    selectorImage.src = "ui/outlines/ui-color.webp";
                    
                    const redraw = panel => {
                        const ctx = panel.canvas.getContext( "2d" );
    
                        if( selectorImageLoaded === false ) return;
    
                        ctx.fillStyle='black';
                        ctx.fillRect(0,0,width,height);
                        ctx.clearRect( 0,0,width,height );
    
                        //update hsl color from track positions
                        //  (note: this will only happen on redraw of this UI panel)
                        const {h,s,l} = edit.ui.panels[ 'color' ].getHSL();
    
                        const th = 1.0 - tracks[1].getFloat();
                        const ts = tracks[0].getFloat();
                        const tl = tracks[2].getFloat();
                        if( ( ts !== s ) || ( th !== h ) || ( tl !== l ) ) {
                            const { r,g,b } = edit.math.color.hsl2rgb( th , ts , tl );
                            edit.ui.panels[ 'color' ].setRGB( r,g,b , true );
                            edit.ui.panels[ 'color' ].setHSL( th,ts,tl );
                        }
                        
                        //update uniforms
                        const {r,g,b} = edit.ui.panels[ 'color' ].getRGB(); //core color
                        const {r:rr,g:rg,b:rb} = edit.math.color.hsl2rgb(th,1.0,0.5); //sat/val reference color
    
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'rgba(0,0,0,0)';
                        ctx.fillStyle = `rgb(${parseInt(rr*255)},${parseInt(rg*255)},${parseInt(rb*255)})`;
                        ctx.fillRect(0,0,width,height);
                        ctx.fillStyle = `rgb(${parseInt(r*255)},${parseInt(g*255)},${parseInt(b*255)})`;
                        ctx.fillRect(0,height*0.35,width,height*0.3);
    
                        ctx.drawImage( selectorImage , 0 , 0 , width , height );
    
                        //dim header icon
                        ctx.fillStyle = edit.ui.theme.panelColor;
                        ctx.globalAlpha = 0.5;
                        ctx.fillRect( 60*os, 60*os, 100*os, 100*os );
                        ctx.globalAlpha = 1.0;
    
                        //draw track heads
                        for( const track of tracks ) {
                            const lit = (
                                    ( track.isHovering() === true ) || 
                                    ( edit.ui.grab.isFocused( track ) ) 
                                );
                            ctx.fillStyle = lit ? 'rgb(145,145,145)' : 'rgb(255,255,255)';
                            ctx.strokeStyle = lit ? 'rgb(20,20,20)' : 'rgb(0,0,0)';
                            ctx.lineWidth = 1.0;
                            ctx.shadowBlur = 5.0;
                            ctx.shadowColor = ctx.strokeStyle;
                            ctx.beginPath();
                            ctx.arc( track.x, track.y , track.radius , 0 , 6.284 , false );
                            ctx.stroke();
                            ctx.fill();
                        }
    
                    }
    
                    const buttons = [];
    
                    const colorSelector = edit.ui.panel.create(
                        'color', width , height , tracks , buttons , redraw , 
                    );
    
                    const rgb = { r:0,g:0,b:0 };
                    const hsl = { h:0,s:0,l:0 };
    
                    colorSelector.setRGB = ( r,g,b , only ) => {
                        rgb.r = r; rgb.g = g; rgb.b = b;
                        
                        if( only ) return;
    
                        const { h,s,l } = edit.math.color.rgb2hsl( r,g,b );
                        hsl.h = h; hsl.s = s; hsl.l = l;
                        colorSelector.setHSL( h,s,l );
    
                        colorSelector.redraw();
                    }
                    colorSelector.setHSL = ( h,s,l ) => {
                        tracks[0].setFloat( s );
                        tracks[1].setFloat( 1.0 - h );
                        tracks[2].setFloat( l );
                    }
                    colorSelector.getHSL = () => ( { ...hsl } );
                    colorSelector.getRGB = () => ( { ...rgb } );
    
                    return colorSelector;
                },
                
                "file": () => {
                    const width = 461;
                    const height = 675;
    
                    const tracks = [];
                    const buttons = [];
    
                    let outerFilePanel = null;
    
                    const buttonClicks = {
                        'button-toggle-vr': () => {
                            //re-enter vr
                            edit.threejs.launchVR();
                            outerFilePanel.style.display = 'none';
                            document.querySelector( '.container' ).classList.remove( 'screen-blur' );
                        },
    
                        //local save configured from edit.ui.prepareLocalSave( saveButton )
                        //'button-local-save': () => {},
                        
                        //local open configured from edit.ui.prepareLocalOpen( open )
                        //'button-local-open': () => {},

                        //unimplemented
                        //'button-local-new': () => { console.log( "Clicked new." ); },
                        //'button-local-export': () => { console.log( "Clicked export." ); },
                    }
    
    
                    //html redraw must declare whether or not it repainted the html
                    const redraw = () => false;
    
                    //html onload must not cause reflowing changes to the document
                    const onload = htmlTexture => {
    
                        //activate hover / click on toggle button inside VR
                        const toggleVRButton = htmlTexture.document.querySelector( '#button-toggle-vr' );
                        
                        const click = () => {

                            //prepare local save every time we leave VR
                            const saveButton = outerFilePanel.querySelector( '#button-local-save' );
                            edit.ui.prepareLocalSave( saveButton );

                            //prepare screen for landing from VR exit
                            document.querySelector( '.container' ).classList.add( 'screen-blur' );
                            outerFilePanel.style.display = 'block';

                            //leave vr
                            edit.threejs.endSession();

                        }
    
                        const rect = toggleVRButton.getClientRects()[ 0 ];

                        const left = parseInt( rect.left )
                        const top = parseInt( rect.top );
                        const width = parseInt( rect.width );
                        const height = parseInt( rect.height );
    
                        const button = edit.ui.button.create.rect( left, top, width, height, click );
    
                        button.element = toggleVRButton;
                        
                        buttons.push( button );

                    };
                    
                    //oninit may modify and repaint the html if necessary
                    const oninit = htmlTexture => {
                        
                        //replicate panel on main screen
                        const style = htmlTexture.document.querySelector( "#styles" ).textContent.replace( "'panels.css'", "'ui/panels/panels.css'");
                        const body = htmlTexture.document.querySelector( "body" ).innerHTML.replace( /src="icons\//gmi , 'src="ui/panels/icons/' );
                        
                        outerFilePanel = document.body.appendChild( document.createElement( 'div' ) );
                        outerFilePanel.style.display = 'none';
                        outerFilePanel.classList.add( 'file-panel' );
                        outerFilePanel.innerHTML = body;
                        outerFilePanel.appendChild( document.createElement( 'style' ) ).textContent = style;
                        outerFilePanel.querySelector( '.download-buttons' ).classList.remove( 'locked' );
        
                        for( const id in buttonClicks )
                            outerFilePanel.querySelector( "#" + id ).onclick = buttonClicks[ id ];
                            
                        for( const button of [ ...outerFilePanel.querySelectorAll( '.button, .header > .icon' ) ] ) {
                            button.classList.remove( 'marquee' );
                            button.onmouseenter = () => button.classList.add( 'marquee' );
                            button.onmouseleave = () => button.classList.remove( 'marquee' );
                        }
    
                        const reenterVRButton = outerFilePanel.querySelector( '#button-toggle-vr');
                        reenterVRButton.querySelector( 'span' ).textContent = 'Return to VR';
    
                        //prepare local open
                        const openButton = outerFilePanel.querySelector( '#button-local-open' );
                        edit.ui.prepareLocalOpen( openButton );
        
                    };
    
                    const filePanel = edit.ui.panel.createHTML(
                        'file', width, height, tracks, buttons, redraw, 'ui/panels/file.html', onload, oninit
                    );
    
                    return filePanel;
                },
                "layers": () => {

                    const layersPanel = edit.ui.panel.create( "layers", 1, 1, [], [], () => {} );

                    layersPanel.getLayer = () => 2;

                    return layersPanel;

                },
            },
            render: ( time ) => {
                for( let panelName in edit.ui.panels ) {
                    const panel = edit.ui.panels[ panelName ];
                    if( panel.needsRedraw === true )
                        panel.redraw( time );
                }
                if( edit.tools[ edit.ui.activeToolName ].render )
                    edit.tools[ edit.ui.activeToolName ].render( time );
            },
            capturedButtons: { top: {}, bottom: {} },
            fireTopButton: () => {
                edit.ui.redo(); //seems wasteful...
            },
            fireBottomButton: () => {
                edit.ui.undo();
            },
            almostCaughtStarts: {},
            catchInput: ( input , key ) => {
                const { x:gx , y:gy , z:gz } = input;
                const pressure = input.trigger;
                const squeeze = input.grip;
    
                let caught = false;
                let almostCaught = false;
    
                //use buttons
                //these do not catch, but tools must not map them
                const buttons = edit.ui.capturedButtons;
    
                if( input.top && ! buttons.top[ key ] )
                    buttons.top[ key ] = true;
                else if( ! input.top && buttons.top[ key ] ) {
                    buttons.top[ key ] = false;
                    edit.ui.fireTopButton();
                }
                if( input.bottom && ! buttons.bottom[ key ] )
                    buttons.bottom[ key ] = true;
                else if( ! input.bottom && buttons.bottom[ key ] ) {
                    buttons.bottom[ key ] = false;
                    edit.ui.fireBottomButton();
                }
    
                const zero = edit.threejs.controls.triggerThreshhold;
    
                //Grab and drag tracks
                const grabFocus = edit.ui.grab.getFocus( key );
                if( pressure >= zero ) {
                    if( grabFocus.track !== null )
                        caught = edit.ui.grab.update( gx,gy,gz , grabFocus );
                    if( ! caught && grabFocus.track === null ) 
                        [ caught , almostCaught ] = edit.ui.grab.start( gx,gy,gz , grabFocus );
                }
                else if( pressure < zero && grabFocus.track !== null ) {
                    edit.ui.grab.end( gx,gy,gz , grabFocus );
                    caught = true;
                }
    
                //Grip and drag panels
                const gripFocus = edit.ui.grip.getFocus( key );
                if( squeeze >= zero ) {
                    if( gripFocus.panel !== null )
                        caught = edit.ui.grip.update( input , gripFocus );
                    if( ! caught && gripFocus.panel === null )
                        [ caught , almostCaught ] = edit.ui.grip.start( input , gripFocus );
                }
                else if( squeeze < zero && gripFocus.panel !== null ) {
                    edit.ui.grip.end( input , gripFocus );
                    caught = true;
                }
    
                //click buttons
                const clickFocus = edit.ui.click.getFocus( key );
                if( pressure >= zero ) {
                    if( clickFocus.button !== null ) 
                        caught = edit.ui.click.update( gx,gy,gz , clickFocus );
                    if( ! caught && clickFocus.button === null ) 
                        [ caught , almostCaught ] = edit.ui.click.start( gx,gy,gz , clickFocus );
                }
                else if( pressure < zero && clickFocus.button !== null ) {
                    edit.ui.click.end( gx,gy,gz , clickFocus );
                    caught = true;
                }
    
                //Hover (does not catch input)
                const panels = edit.ui.panels;
                for( const panelName in panels ) {
                    const panel = panels[ panelName ];
                    const {x,y,z} = edit.ui.panel.projectPoint( gx,gy,gz , panel , key );
                    ( x>0 && x<1 && y>0 && y<1 && Math.abs(z) < edit.ui.panel.thickness ) ? 
                        panel.hover( x*panel.width , y*panel.height , key ) : 
                        panel.hover( false , 0 , key );
                }
    
                //once an input was almost caught, trap it inertly until release
                const almostCaughtStarts = edit.ui.almostCaughtStarts;
                if( almostCaught )
                    almostCaughtStarts[ key ] = true;
                if( pressure < zero && almostCaughtStarts[ key ] === true )
                    almostCaughtStarts[ key ] = false;
                if( almostCaughtStarts[ key ] === true )
                    almostCaught = true;
    
                return caught || almostCaught;
            },
            grip: {
                focuses: {},
                getFocus: key => {
                    if( ! edit.ui.grip.focuses[ key ] )
                        edit.ui.grip.focuses[ key ] = { panel: null };
                    return edit.ui.grip.focuses[ key ];
                },
                isFocused: panel => {
                    for( const key in edit.ui.grip.focuses )
                        if( edit.ui.grip.focuses[ key ].panel === panel )
                            return true;
                    return false;
                },
                start: ( input , focus ) => { 
                    const { x,y,z } = input;
                    const panels = edit.ui.panels;
                    for( const panelName in panels ) {
                        const panel = panels[ panelName ];
    
                        if( panel.visible === false ) continue;
    
                        let gripped = false;
                        {
                            const { x:px,y:py,z:pz } = edit.ui.panel.projectPoint( x,y,z , panel , focus.key );
                            if( Math.abs( pz ) < edit.ui.panel.thickness &&
                                px > 0 && px < 1 &&
                                py > 0 && py < 1 )
                                gripped = true;
                        }
                        if( gripped === true ) {
                            focus.panel = panel;
                            //const manualMatrix = panel.mesh.matrix.clone();
                            input.controller.attach( panel.mesh );
                            input.controller.attach( panel.transparentMesh );
                            panel.mesh.matrixAutoUpdate = true;
                            panel.transparentMesh.matrixAutoUpdate = true;
                            return [ true , true ];
                        }
                    }
                    return [ false , false ]; 
                },
                update: ( input , focus ) => {
                    if( focus.panel === null ) return false;
                    return true;
                },
                end: ( input , focus ) => { 
                    const panel = focus.panel;
                    edit.world.scene.attach( panel.mesh );
                    edit.world.scene.attach( panel.transparentMesh );
                    panel.mesh.matrixAutoUpdate = false;
                    panel.transparentMesh.matrixAutoUpdate = false;
                    focus.panel = null;
                },
            },
            click: {
                focuses: {},
                getFocus: key => {
                    if( ! edit.ui.click.focuses[ key ] )
                        edit.ui.click.focuses[ key ] = { panel: null, button: null , key };
                    return edit.ui.click.focuses[ key ];
                },
                isFocused: button => {
                    for( const key in edit.ui.click.focuses )
                        if( edit.ui.click.focuses[ key ].button === button )
                            return true;
                    return false;
                },
                button: ( x,y, buttons ) => {
                    for( const button of buttons )
                        if( button.hits( x,y ) )
                            return button;
                    return undefined;
                },
                start: ( x,y,z , focus ) => {
                    const panels = edit.ui.panels;
                    for( const panelName in panels ) {
                        const panel = panels[ panelName ];
    
                        if( panel.visible === false ) continue;
    
                        let clickedXY = null;
                        {
                            const { x:px,y:py,z:pz } = edit.ui.panel.projectPoint( x,y,z , panel , focus.key );
                            if( Math.abs( pz ) < edit.ui.panel.thickness &&
                                px > 0 && px < 1 &&
                                py > 0 && py < 1 )
                                clickedXY = { x:px*panel.width, y:py*panel.height };
                        }
    
                        if( clickedXY !== null ) {
                            const {x,y} = clickedXY;
                            const clickedButton = edit.ui.click.button( x,y, panel.buttons );
                            if( clickedButton !== undefined ) {
                                focus.panel = panel;
                                focus.button = clickedButton;
                                panel.requestRedraw();
                                return [ true , true ];
                            }
                            focus.panel = null;
                            focus.button = null;
                            //almost caught, prevent draw-start this near controls
                            return [ false , true ];
                        }
                    }
                    focus.panel = null;
                    focus.button = null;
                    return [ false , false ];
                },
                update: ( x,y,z , focus ) => {
                    if( focus.button === null || focus.panel === null ) return false;
                    const { dx,dy,button,panel } = focus;
                    const {x:px,y:py,z:pz} = edit.ui.panel.projectPoint( x,y,z , panel , focus.key );
                    const cx = px*panel.width;
                    const cy = py*panel.height;
                    if( ! button.hits( cx,cy ) ) {
                        focus.button = null;
                        focus.panel = null;
                        panel.requestRedraw();
                        return false;
                    }
                    return true;
                }, 
                end: ( x,y,z , focus ) => {
                    const panel = focus.panel;
                    const button = focus.button;
                    focus.panel = null;
                    focus.button = null;
                    const {x:px,y:py} = edit.ui.panel.projectPoint( x,y,z , panel , focus.key );
                    const clientX = px*panel.width;
                    const clientY = py*panel.height;
                    const offsetX = clientX - button.x;
                    const offsetY = clientY - button.y;
                    button.click( { clientX, clientY, offsetX, offsetY } );
                    panel.requestRedraw();
                },
            },
            grab: {
                focuses: {},
                getFocus: key => {
                    if( ! edit.ui.grab.focuses[ key ] )
                        edit.ui.grab.focuses[ key ] = { panel:null, track:null, dx:0, dy:0 };
                    return edit.ui.grab.focuses[ key ];
                },
                isFocused: track => {
                    for( let key in edit.ui.grab.focuses )
                        if( edit.ui.grab.focuses[ key ].track === track )
                            return true;
                    return false;
                },
                start: ( x,y,z , focus ) => {
                    const panels = edit.ui.panels;
                    for( const panelName in panels ) {
                        const panel = panels[ panelName ];
    
                        if( panel.visible === false ) continue;
    
                        let grabbedXY = null;
                        {
                            const { x:px,y:py,z:pz } = edit.ui.panel.projectPoint( x,y,z , panel , focus.key );
                            if( Math.abs( pz ) < edit.ui.panel.thickness &&
                                px > 0 && px < 1 &&
                                py > 0 && py < 1 )
                                grabbedXY = { x:px*panel.width, y:py*panel.height };
                        }
    
                        if( grabbedXY !== null ) {
                            const {x,y} = grabbedXY;
                            let grabbedTrack = null;
                            for( const track of panel.tracks )
                                if( track.hits( x,y ) ) {
                                    grabbedTrack = track;
                                    break;
                                }
                            if( grabbedTrack !== null ) {
                                focus.panel = panel;
                                focus.track = grabbedTrack;
                                //focus.dx = grabbedTrack.x - x;
                                //focus.dy = grabbedTrack.y - y;
    
                                //absolute track coordinate selection:
                                focus.dx = 0;
                                focus.dy = 0;
    
                                return [ true , true ];
                            }
                            focus.panel = null;
                            focus.track = null;
                            return [ false , true ]; //prevent draw-start so near controls
                        }
                    }
                    focus.panel = null;
                    focus.track = null;
                    return [ false , false ];
                },
                update: ( x,y,z , focus ) => {
                    if( focus.track === null || focus.panel === null ) return false;
                    const { dx,dy,track,panel } = focus;
                    const {x:px,y:py,z:pz} = edit.ui.panel.projectPoint( x,y,z , panel , focus.key );
                    const gx = px*panel.width + dx;
                    const gy = py*panel.height + dy;
                    edit.ui.panel.updateTrackXYAndRedraw( gx,gy , track , panel );
                    return true;
                },
                end: ( x,y,z , focus ) => {
                    const panel = focus.panel;
                    focus.panel = null;
                    focus.track = null;
                    panel.requestRedraw();
                },
            },
            panel: {
                vertexShader:
                    `#version 300 es
                    precision highp float;
                    precision highp int;
    
                    uniform mat4 projectionMatrix;
                    uniform mat4 modelViewMatrix;
    
                    in vec3 position;
                    in vec2 uv;
                    
                    out highp vec2 vUV;
    
                    void main() {
                        vUV = uv;
                        gl_Position = projectionMatrix *
                            modelViewMatrix *
                            vec4( position , 1.0 );
                    }`,
                
                fragmentShader:
                    `#version 300 es
                    precision highp float;
                    precision highp int;
    
                    uniform sampler2D canvas;
                    in highp vec2 vUV;
    
                    out vec4 finalColor;
    
                    void main() {
                        finalColor = vec4( texture( canvas , vUV ).rgb , 0.5 );
                    }`,
                projectPoint: ( gx,gy,gz , panel , key ) => {
                    const { topLeft , normal , xAxis , yAxis } = panel.vectors;
                    const vx = gx - topLeft.x, vy = gy - topLeft.y, vz = gz - topLeft.z;
                    const x = (vx*xAxis.x + vy*xAxis.y + vz*xAxis.z) / xAxis.lengthSquared;
                    const y = (vx*yAxis.x + vy*yAxis.y + vz*yAxis.z) / yAxis.lengthSquared;
                    const z = vx*normal.x + vy*normal.y + vz*normal.z;
                    panel.cursors[ key ] = {x,y,z};
                    return {x,y,z}
                },
                updateTrackXYAndRedraw: ( nx,ny , track , panel ) => {
                    const { x,y } = track;
                    if( nx===x && ny===y ) return;
                    track.setClosestXY( nx , ny ); 
                    if( track.x === x && track.y === y ) return;
                    panel.requestRedraw();
                },
                thickness: 0.10,
                pixelScale: 0.0003,
                outlineScale: 0.5,
                repaintThrottle: 300, //wait 300ms after HTML repaint
                extractPosition: panel => {                
                    //const m = panel.mesh.matrix.elements;
                    const m = panel.mesh.matrixWorld.elements;
                    const xAxisLengthSquared = panel.vectors.xAxis.lengthSquared;
                    const yAxisLengthSquared = panel.vectors.yAxis.lengthSquared;
    
                    //Matrix elements:
                    //    xAxis.x  , xAxis.y  , xAxis.z , 0 ,
                    //    yAxis.x  , yAxis.y  , yAxis.z , 0 ,
                    //    normal.x  , normal.y  , normal.z , 0 ,
                    //    topLeft.x , topLeft.y, topLeft.z , 1 ,
                    
                    const xAxis = { x: m[0] , y: m[1] , z: m[2] , lengthSquared: xAxisLengthSquared };
                    const yAxis = { x: m[4] , y: m[5] , z: m[6] , lengthSquared: yAxisLengthSquared };
                    const normal = { x: m[8] , y: m[9] , z: m[10] };
                    const topLeft = { x: m[12] , y: m[13] , z: m[14] };
    
                    panel.vectors.topLeft = topLeft;
                    panel.vectors.normal = normal;
                    panel.vectors.xAxis = xAxis;
                    panel.vectors.yAxis = yAxis;
    
                },
                setPosition: ( panel , x,y,z , forwardAxis ) => {
                    const topLeft = {x,y,z};
                    const xAxis = {x:1,y:0,z:0, lengthSquared: 1};
                    const yAxis = {x:0,y:-1,z:0, lengthSquared: 1};
                    const normal = {x:0,y:0,z:1};
                    //let's rotate the plane a bit
                    const normalize = v => {
                        const d = (v.x**2+v.y**2+v.z**2)**0.5;
                        v.x/=d; v.y/=d; v.z/=d;
                    }
                    const cross = (a,b) => ({
                        x: a.y*b.z - a.z*b.y,
                        y: a.z*b.x - a.x*b.z,
                        z: a.x*b.y - a.y*b.x
                    });
                    const set = ( v, s ) => { 
                        v.x = s.x; 
                        v.y = s.y; 
                        v.z = s.z; 
                    }
    
                    //const forwardAxis = {x:0,y:0.25,z:1};
                    normalize(forwardAxis);
                    set( xAxis , cross( forwardAxis , { x:0,y:-1,z:0} ) );
                    //xAxis.z += 0.25;
                    normalize( xAxis );
                    set( yAxis , cross( xAxis , forwardAxis ) );
                    normalize( yAxis );
                    set( normal , cross( xAxis , yAxis ) );
                    normalize( normal );
    
                    const pixelScale = edit.ui.panel.pixelScale;
                    for( const c in xAxis ) xAxis[c] *= pixelScale*panel.width;
                        xAxis.lengthSquared = (pixelScale*panel.width)**2;
                    for( const c in yAxis ) yAxis[c] *= pixelScale*panel.height;
                        yAxis.lengthSquared = (pixelScale*panel.height)**2;
                        
                    const matrix = [
                        xAxis.x  , xAxis.y  , xAxis.z , 0 ,
                        yAxis.x  , yAxis.y  , yAxis.z , 0 ,
                        normal.x  , normal.y  , normal.z , 0 ,
                        topLeft.x , topLeft.y, topLeft.z , 1 ,
                    ];
                    panel.mesh.matrixAutoUpdate = false;
                    panel.transparentMesh.matrixAutoUpdate = false;
                    for( let i=0;i<16;i++ ) {
                        panel.mesh.matrix.elements[i] = matrix[i];
                        panel.transparentMesh.matrix.elements[i] = matrix[i];
                    }
    
                    panel.vectors.topLeft = topLeft;
                    panel.vectors.normal = normal;
                    panel.vectors.xAxis = xAxis;
                    panel.vectors.yAxis = yAxis;
                },
                getVisibility: panelName => !!( edit.ui.panels[ panelName ] ? edit.ui.panels[ panelName ].visible : false ),
                flipVisibility: panelName => {
                    if( edit.ui.panels[ panelName ] ) {
                        edit.ui.panels[ panelName ].visible = ! edit.ui.panels[ panelName ].visible;
                        return edit.ui.panels[ panelName ].visible;
                    }
                    else return false;
                },
    
                //url, onload, and oninit are required
                createHTML: ( name , width , height , tracks , buttons , redraw , url, onload, oninit ) => {
    
                    const panel = edit.ui.panel.create( name, width, height, tracks, buttons, ()=>{} );
    
                    const htmlTexture = new HTMLTexture( url, width, height );
    
                    const { image } = htmlTexture;
    
                    let trackImageData = null, trackNormalData = null, trackLineData = null;
    
                    //allow make-shift hover on buttons hidden at first paint
                    //allow re-capture button changed data
                    //Usage: render button element's .marquee class before calling
                    const captureButtonImageData = button => {

                        const context = htmlTexture.image.getContext( '2d' );
    
                        const rect = button.element.getClientRects()[ 0 ];
    
                        if( ! rect ) {
                            return console.error( "Failed to delay capture ", button.element, " - missing rect." );
                        }

                        const left = parseInt( rect.left );
                        const top = parseInt( rect.top );
                        const width = parseInt( rect.width );
                        const height = parseInt( rect.height );
    
                        button.imageData = {};
    
                        const normalData = context.getImageData( left, top, width, height );
                        button.imageData.normal = { left, top, width, height, image: normalData, isDataTexture: true };
    
                        const marqueeData = context.createImageData( width, height );
                        {
    
                            const source = normalData.data, destination = marqueeData.data;
    
                            for( let i=0, l=source.length; i < l; i += 4 ) {
                                
                                destination[ i+0 ] = 255 - source[ i+0 ];
                                destination[ i+1 ] = 255 - source[ i+1 ];
                                destination[ i+2 ] = 255 - source[ i+2 ];
                                destination[ i+3 ] = source[ i+3 ];
    
                            }
    
                        }
                        button.imageData.marquee = { left, top, width, height, image: marqueeData, isDataTexture: true };

                    }
    
                    htmlTexture.redrawing.then( async () => {
                        
                        //onload must not reflow or repaint the htmlTexture
                        onload( htmlTexture );
    
                        const context = image.getContext( '2d' );
    
                        for( const button of buttons ) {
    
                            if( ! button.element || 
                                ! button.element.classList.contains( 'button' ) ||
                                  button.element.getAttribute( 'delay-capture' ) !== null )
                                  continue;
    
                            const parentRect = button.element.getClientRects()[ 0 ];
    
                            const parentLeft = parseInt( parentRect.left ) || 0;
                            const parentTop = parseInt( parentRect.top ) || 0;
    
                            //collect button marquees
    
                            const { left: floatLeft, top: floatTop, width: floatWidth, height: floatHeight } = getComputedStyle( button.element, '::after' );
                            //will we get computed style, client rects for off-screen elements???
    
                            const left = parseInt( parentLeft + (1*floatLeft.replace( 'px', '' )) );
                            const top = parseInt( parentTop + (1*floatTop.replace( 'px', '' )) );
                            const width = parseInt( floatWidth.replace( 'px', '' ) );
                            const height = parseInt( floatHeight.replace( 'px', '' ) );
    
                            const marqueeData = context.getImageData( left, top, width, height );

                            button.imageData = {};
    
                            button.imageData.marquee = { left, top, width, height, image: marqueeData, isDataTexture: true };

                            button.element.classList.remove( 'marquee' );
    
                        }
    
                        for( const track of tracks ) {
    
                            const { left: floatLeft, top: floatTop, width: floatWidth, height: floatHeight } = track.element.getClientRects()[ 0 ];
    
                            const left = parseInt( floatLeft );
                            const top = parseInt( floatTop );
                            const width = parseInt( floatWidth );
                            const height = parseInt( floatHeight );
    
                            //collect track marquees
    
                            if( ! trackImageData ) trackImageData = context.getImageData( left, top, width, height );
    
                            track.imageData = {};
    
                            track.imageData.marquee = { left, top, width, height, image: trackImageData, isDataTexture: true };
    
                            const trackX = left;
                            trackXs.set( track, trackX );
    
                            //collect track lines
        
                            const lineRect = track.element.parentNode.getClientRects()[ 0 ];
    
                            const lineLeft = parseInt( lineRect.left ) - 1;
                            const lineTop = parseInt( lineRect.top + (lineRect.height/2) - (height/2) ) - 1;
                            const lineWidth = parseInt( lineRect.width ) + 2;
                            const lineHeight = parseInt( height + lineRect.height ) + 2;
    
                            if( ! trackLineData ) {
    
                                //overwrite the head's data with the blank line to its right
                                const trackOverwriteData = context.getImageData( left + width + 1, top - 1, width + 2, height + 2 );
                                context.putImageData( trackOverwriteData, left - 1, top - 1 );
    
                                //create image data for the full blank line, without the head
                                trackLineData = context.getImageData( lineLeft, lineTop, lineWidth, lineHeight );
    
                            }
    
                            track.imageData.line = { left: lineLeft, top: lineTop, width: lineWidth, height: lineHeight, image: trackLineData, isDataTexture: true };
    
    
                            track.element.classList.remove( 'marquee' );
    
                        }
    
                        // repaint without marquees
                        await htmlTexture.redrawing;
    
                        await htmlTexture.requestRedraw();
    
                        for( const button of buttons ) {
    
                            if( ! button.element || 
                                ! button.element.classList.contains( 'button' ) ||
                                  button.element.getAttribute( 'delay-capture' ) !== null )
                                  continue;
    
                            //collect normal buttons
    
                            const { left, top, width, height } = button.imageData.marquee;
    
                            const normalData = context.getImageData( left, top, width, height );
    
                            button.imageData.normal = { left, top, width, height, image: normalData, isDataTexture: true };
    
                            //activate initial button (if any)
    
                            if( button.element.getAttribute( 'initial-active' ) !== null ) button.element.classList.add( 'active' );
    
                        }
    
                        // collect track normal data
    
                        for( const track of tracks ) {
    
                            const { left, top, width, height } = track.imageData.marquee;
    
                            //collect track marquees
    
                            if( ! trackNormalData ) trackNormalData = context.getImageData( left, top, width, height );
    
                            track.imageData.normal = { left, top, width, height, image: trackNormalData, isDataTexture: true };
    
                        }
    
    
                        //repaint with active button
    
                        await htmlTexture.redrawing;
    
                        await htmlTexture.requestRedraw();
    
                        //oninit may or may not reflow or repaint the html texture
                        await oninit( htmlTexture );
    
                    } );
    
    
                    panel.canvas = htmlTexture.image;
                    
                    const material = panel.mesh.material;
                    material.uniforms.canvas.value = htmlTexture;
    
                    const halfMaterial = panel.transparentMesh.material;
                    halfMaterial.uniforms.canvas.value = htmlTexture;
    
                    
                    const interactings = new Set();
    
                    const trackXs = new Map();
    
                    let _redrawing = false;
    
                    const redrawPanel = async ( time ) => {
    
                        if( _redrawing ) return;
    
                        _redrawing = true;
    
                        panel.needsRedraw = false;
    
                        
                        const repainted = await redraw( panel, time );
                        
                        
                        if( repainted ) {

                            //update manually / immediately? why not.
                            //const ctx = htmlTexture.image.getContext( '2d' );
                            //const d = { isDataTexture: true, image: ctx.getImageData( 0, 0, htmlTexture.image.width, htmlTexture.image.height ) };
                            const d = { image: htmlTexture.image };

                            edit.threejs.renderer.copyTextureToTexture( { x: 0, y: 0 }, d, htmlTexture );

                        }

                        for( const interactive of [ buttons, tracks ].flat() ) {
    
                            //not drawing at the moment
                            if( ! interactive.visible ) continue;
    
                            //non-interactive at the moment, do not hover
                            if( interactive.element ? interactive.element.classList.contains( 'active' ) : false ) continue;
    
                            //non-hovering button with element (probably toggle switch)
                            if( ! interactive.imageData ) continue;
    
    
                            const isTrack = tracks.find( e => e === interactive );
    
                            let trackMoved = false;
    
                            if( isTrack && interactive.x !== trackXs.get( interactive ) ) trackMoved = true;
    
    
                            const interacting =
                                interactive.isHovering() ||
                                edit.ui.click.isFocused( interactive ) ||
                                edit.ui.grip.isFocused( interactive );
    
                            if( repainted || interactings.has( interactive ) !== interacting || ( isTrack && trackMoved !== false ) ) {
    
                                let state;
    
                                if( interacting ) {
                                    
                                    state = interactive.imageData.marquee;
                                    interactings.add( interactive );
    
                                }
    
                                if( ! interacting ) {
                                    
                                    state = interactive.imageData.normal;
                                    interactings.delete( interactive );
    
                                }
    
    
                                if( isTrack ) {
    
                                    const trackX = interactive.x;
    
                                    //clear track line
                                    {
    
                                        const { left, top } = interactive.imageData.line;

                                        if( left >=0 && top >= 0 )
                                            edit.threejs.renderer.copyTextureToTexture( { x:left, y:htmlTexture.image.height - top - interactive.imageData.line.image.height }, interactive.imageData.line, htmlTexture );
    
                                    }
    
                                    //draw nib
                                    const { top } = state;
                                    
                                    if( top >= 0 && trackX >= 0 )
                                        edit.threejs.renderer.copyTextureToTexture( { x:trackX, y:htmlTexture.image.height - top - state.image.height }, state, htmlTexture );
    
                                    trackXs.set( interactive, interactive.x );
    
                                } else {
    
                                    //buttons cannot scroll because the click-detector does not support it
                                    //(cannot pull client rect here for left / top)
    
                                    const { left, top } = state;
    
                                    if( left >=0 && top >= 0 )
                                        edit.threejs.renderer.copyTextureToTexture( { x:left, y:htmlTexture.image.height - top - state.image.height }, state, htmlTexture );
    
                                }
    
                            }
    
                        }
    
                        _redrawing = false;
    
                    };
    
                    panel.redraw = redrawPanel;
    
                    panel.captureButtonImageData = captureButtonImageData;
    
                    panel.isHTMLPanel = true;
                    panel.htmlTexture = htmlTexture;
    
                    return panel;
    
                },
                create: ( name , width , height , tracks , buttons , redraw ) => {
                    const panel = { 
                        name,
                        visible: true ,
                        width , 
                        height , 
                        worldWidth: width * edit.ui.panel.pixelScale,
                        worldHeight: height * edit.ui.panel.pixelScale,
                        tracks ,
                        buttons ,
                        redraw: null,
                        needsRedraw: true,
                        redraw: null,
                        requestRedraw: () => panel.needsRedraw = true,
                        hover: null,
                        data: { 
                            hoveringTrack: null,
                            frameCount: 0,
                        },
    
                        cursors: {},
    
                        canvas: null,
                        context: null,
                        mesh: null,
                        vectors: {
                            topLeft: {x:0,y:0,z:0},
                            normal: {x:0,y:0,z:0},
                            xAxis: {x:0,y:0,z:0},
                            yAxis: {x:0,y:0,z:0},
                        },
                        initialMatrixComputed: false,
                    };
    
                    if( settings.panel_visibilities[ name ] !== undefined )
                        panel.visible = settings.panel_visibilities[ name ];
    
                    const canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    panel.canvas = canvas;
    
                    const texture = new THREE.CanvasTexture( 
                        canvas,
                        THREE.UVMapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.ClampToEdgeWrapping,
                        THREE.LinearFilter,
                        THREE.LinearFilter
                    );
    
                    const uniforms = { 'canvas': { type: 't', value: texture } };
    
                    const { vertexShader , fragmentShader } = edit.ui.panel;
    
                    const material = new THREE.RawShaderMaterial( {
                        uniforms ,
                        vertexShader ,
                        fragmentShader ,
                        side: THREE.DoubleSide ,
                    } );
                    const halfMaterial = new THREE.RawShaderMaterial( {
                        uniforms ,
                        vertexShader ,
                        fragmentShader ,
                        depthTest: false,
                        depthWrite: false,
                        transparent: true,
                        opacity: 0.5,
                        side: THREE.DoubleSide ,
                    } );
    
                    const vertices = new Float32Array( [
                        0,0,0, //0
                        1,0,0, //1
                        0,1,0, //2
                        1,1,0, //3
                    ] );
                    const uvs = new Float32Array( [
                        0,1,
                        1,1,
                        0,0,
                        1,0,
                    ])
                    const indices = new Array(
                        0,2,1,
                        2,3,1
                    );
    
                    const planeGeometry = new THREE.BufferGeometry();
                    planeGeometry.setIndex( indices );
                    planeGeometry.setAttribute( 'position' , new THREE.Float32BufferAttribute( vertices , 3 ) );
                    planeGeometry.setAttribute( 'uv' , new THREE.Float32BufferAttribute( uvs , 2 ) );
    
                    const mesh = new THREE.Mesh(
                        planeGeometry ,
                        material
                    );
                    const transparentMesh = new THREE.Mesh(
                        planeGeometry ,
                        halfMaterial
                    )
                    panel.mesh = mesh;
                    panel.transparentMesh = transparentMesh;
    
                    const redrawPanel = () => {
                        panel.needsRedraw = false;
                        redraw( panel );
    
                        texture.needsUpdate = true;
                        material.needsUpdate = true;
                        halfMaterial.needsUpdate = true;
                    };
                    panel.redraw = redrawPanel; //overwritten if htmlPanel
    
                    panel.hover = ( xOrFalse,y , key ) => edit.ui.panel.hover( xOrFalse,y, panel , key );
    
                    return panel;
                },
                hover: ( xOrFalse , y , panel , key ) => {
                    if( xOrFalse !== false ) {
                        let flippedHoveringTrack = false;
                        for( const track of panel.tracks ) {
                            const trackHits = track.hits( xOrFalse , y );
                            if( track.hovering[ key ] !== trackHits ) {
                                track.hovering[ key ] = trackHits;
                                flippedHoveringTrack = true;
                            }
                        }
    
                        let flippedHoveringButton = false;
                        for( const button of panel.buttons ) {
                            const buttonHits = button.hits( xOrFalse , y );
                            if( button.hovering[ key ] !== buttonHits ) {
                                button.hovering[ key ] = buttonHits;
                                flippedHoveringButton = true;
                            }
                        }
    
                        if( flippedHoveringTrack === true ||
                            flippedHoveringButton ) {
                            panel.requestRedraw();
                            return true;
                        }
                    }
    
                    if( xOrFalse === false ) {
                        let foundHoveringTrack = false;
                        for( const track of panel.tracks )
                            if( track.hovering[ key ] === true ) {
                                track.hovering[ key ] = false;
                                foundHoveringTrack = true;
                            }
    
                        let foundHoveringButton = false;
                        for( const button of panel.buttons )
                            if( button.hovering[ key ] === true ) {
                                button.hovering[ key ] = false;
                                foundHoveringButton = true;
                            }
    
                        if( foundHoveringTrack || foundHoveringButton ) {
                            panel.requestRedraw();
                            return true;
                        }
                    }
                    return false;
                },
            },
            button: {
                isHovering: button => {
                    for( let key in button.hovering )
                        if( button.hovering[ key ] === true )
                            return true;
                    return false;
                },
                rectHits: (x,y,b) => (b.visible && ( x>=b.x && x<=(b.x+b.w) && y>=b.y && y<=(b.y+b.h) )),
                create: {
                    rect: ( x,y,w,h , click ) => {
                        const hit = edit.ui.button.rectHits;
                        const hover = edit.ui.button.isHovering;
                        const b = {
                            visible: true,
                            x, y, w, h, click ,
                            hits: (x,y) => hit( x,y, b ) ,
                            hovering: {},
                            isHovering: () => hover( b ) ,
                        }
                        return b;
                    }
                }
            },
            track: {
                isHovering: track => {
                    for( let key in track.hovering )
                        if( track.hovering[ key ] === true )
                            return true;
                    return false;
                },
                create: {
                    custom: ( x,y , hits , setClosestXY ) => ( { x,y, hits, setClosestXY, hovering:false } ),
                    horizontalLine: ( x , y , minX , maxX , radius ) => {
                        const track = {
                            hovering: {}, visible: true,
                            isHovering: () => edit.ui.track.isHovering( track ),
                            x , y , radius , minX, maxX,
                            hits: ( ix,iy ) => ( 
                                track.visible &&
                                ix >= ( minX - radius ) && 
                                ix <= ( maxX + radius ) && 
                                iy >= ( y - radius ) && 
                                iy <= ( y + radius ) 
                            ),
                            setClosestXY: ( ix,iy ) => {
                                const newX = parseInt( Math.max( minX , Math.min( maxX , ix ) ) );
                                track.x = newX;
                                //track.y; //unchanged
                            },
                            getFloat: () => ( track.x-minX ) / (maxX-minX),
                            setFloat: f => track.x = minX + (f*(maxX-minX)),
                        }
                        return track;
                    },
                    horizontalArc: ( minX, maxX , baseY , centerX , centerY , headRadius ) => {
                        const dx = minX-centerX , dy = baseY-centerY, dx2 = maxX-centerX;
                        const xRange = maxX - minX;
                        const radius = (dx*dx+dy*dy)**0.5;
                        const minAngle = Math.atan2(dy,dx);
                        const maxAngle = Math.atan2(dy,dx2);
                        const angleRange = maxAngle - minAngle;
                        let f = 0;
                        const hr2 = headRadius**2;
                        const track = {
                            hovering: {}, visible: true ,
                            isHovering: () => edit.ui.track.isHovering( track ),
                            x:minX, y:baseY, radius: headRadius,
                            getFloat: () => f,
                            setFloat: v => { 
                                f = Math.min( 1, Math.max( 0, v ) );
                                const angle = minAngle + angleRange * f;
                                const cos = Math.cos( angle ) * radius;
                                const sin = Math.sin( angle ) * radius;
                                track.x = centerX + cos;
                                track.y = centerY + sin;
                            },
                            hits: ( ix,iy ) => {
                                const idx = ix-centerX;
                                const idy = iy-centerY;
                                const d = (idx*idx+idy*idy)**0.5;
                                if( track.visible === false ||
                                    d > (radius+headRadius) ||
                                    d < (radius-headRadius ) ||
                                    ix < minX || ix > maxX || 
                                    ( Math.sign( idy ) !== Math.sign( dy ) ) )
                                    return false;
                                return true;
                            },
                            setClosestXY: (ix,iy) => {
                                const x = Math.max( minX , Math.min( maxX , ix ) );
                                const f = ( x - minX ) / xRange;
                                track.setFloat( f );
                            }
                        };
                        return track;
                    },
                    arc: ( centerX , centerY , radius , headRadius ) => {
                        //const hr2 = headRadius**2;
                        let f = 0;
                        const track = {
                            hovering: {}, visible: true,
                            isHovering: () => edit.ui.track.isHovering( track ),
                            x:centerX + radius, y: centerY , radius: headRadius,
                            getFloat: () => f/2,
                            setFloat: v => {
                                f = Math.min(1,Math.max(0,v)) * 2;
                                track.x = centerX + Math.cos(f*3.141592653589793)*radius;
                                track.y = centerY + Math.sin(f*3.141592653589793)*radius;
                            },
                            hits: ( ix,iy ) => {
                                if( track.visible === false )
                                    return false;
                                const dx = ix-centerX;
                                const dy = iy-centerY;
                                const d = (dx*dx+dy*dy)**0.5;
                                return ! ( 
                                    d > (radius+headRadius) ||
                                    d < (radius-headRadius) 
                                );
                            },
                            setClosestXY: (ix,iy) => {
                                const dx = centerX-ix, dy = centerY-iy;
                                const angle = (Math.atan2( dy , dx ) / 3.141592653589793 + 1) / 2;
                                track.setFloat( angle );
                            }
                        };
                        return track;
                    }
                }
            },
            textline: {
                font: '12px sans-serif',
                color: 'black',
                selectColor: 'white',
                selectBackgroundColor: 'blue',
            
                default: ( line, property ) => 
                    Object.defineProperty( 
                        line, 
                        property, 
                        { 
                            get: () => edit.ui.textline[ property ],
                            enumerable:true, 
                            configurable:true,
                        }
                    ),
            
                /*line: {
                    x,y, w,h, 
                    context, 
                    value?'', 
                    font?'12px sans-serif',
                    color?'black', selectColor?'white', selectBackgroundColor?'blue',
                    scrollx!0, 
                    cursor!{start'0,end'0, startx'0,endx'0, before'value, within'', after''},
                }*/
                lines: new Set(),
            
                focused: null,
            
                delete: line => edit.ui.textline.lines.delete( line ),
                setValue: ( line, value ) => {

                    line.value = value;
                    line.scrollx = 0;

                    const { cursor } = line;
                    cursor.before = value;
                    cursor.within = '';
                    cursor.after = '';
                    cursor.start = cursor.end = 0;
                    cursor.startx = cursor.endx = line.x;

                },
                add: line => {
                    if( typeof line !== 'object' )
                        throw `Error: edit.ui.textline.add( line ): line must be an object`;
            
                    for( const req of [ 'x','y','w','h' ] )
                        if( typeof line[ req ] !== 'number' || ! isFinite( line[ req ] ) )
                            throw `edit.ui.textline.add( line ): line.${req} must be a number`;
            
                    if( ! ( line.context instanceof CanvasRenderingContext2D ) )
                        throw `Error: edit.ui.textline.add( line ): line.context must be a CanvasRenderingContext2D`;
            
                    if( ! line.value ) {
                        line.value = '';
                        line.length = 0;
                    } else {
                        let i = 0;
                        for( const c of line.value ) ++ i;
                        line.length = i;
                    }
            
                    line.scrollx = 0;
            
                    line.cursor = { 
                        at:'start', start:0, end:0, startx:0, endx:0,
                        before: line.value,
                        within: '',
                        after: ''
                    };
            
                    for( const property of [ 'font', 'color', 'selectColor', 'selectBackgroundColor' ] )
                        if( ! line[ property ] ) edit.ui.textline.default( line, property );
            
                    line.updated = true;
            
                    edit.ui.textline.lines.add( line );
                },
                focus: line => edit.ui.textline.focused = line,
                blur: () => {

                    const { focused } = edit.ui.textline;
                    if( ! focused ) return;
            
                    focused.scrollx = 0;
            
                    focused.cursor = { 
                        start:0, end:0, startx:0, endx:0,
                        before: focused.value,
                        within: '',
                        after: ''
                    };
            
                    const blur = true;
                    edit.ui.textline.redraw( blur );
                    edit.ui.textline.focused = null;

                },
            
                getWidth: ( context, text ) => 
                    context.measureText( text + '.' ).actualBoundingBoxRight - 
                    context.measureText( '.' ).actualBoundingBoxRight,
            
                setCursor: ( at, select ) => {
                    const { focused } = edit.ui.textline;
                    if( ! focused ) return;
            
                    const { value, cursor, context } = focused;
            
                    context.save();
                    context.font = focused.font;
            
                    if( ! select ) {
                        if( at === 'start' ) {
                            cursor.at = 'start';
                            cursor.start = cursor.end = 0;
                            cursor.before = '';
                            cursor.within = '';
                            cursor.after = value;
                        }
                
                        if( at === 'end' ) {
                            cursor.at = 'end';
                            let i = 0;
                            for( const _ of value ) ++ i;
                            cursor.start = cursor.end = i;
                            cursor.before = value;
                            cursor.within = '';
                            cursor.after = '';
                        }
                    }
                    if( select ) {
                        if( at === 'start' ) {
                            if( cursor.at === 'start' ) {
                                cursor.start = 0;
                                cursor.within = cursor.before + cursor.within;
                                cursor.before = '';
                            }
                            if( cursor.at === 'end' ) {
                                cursor.end = cursor.start;
                                cursor.start = 0;
                                cursor.after = cursor.within + cursor.after;
                                cursor.within = cursor.before;
                                cursor.before = '';
                                cursor.at = 'start';
                            }
                        }
                
                        if( at === 'end' ) {
                            if( cursor.at === 'start' ) {
                                cursor.start = cursor.end;
                                cursor.end = focused.length;
                                cursor.before = cursor.before + cursor.within;
                                cursor.within = cursor.after;
                                cursor.after = '';
                                cursor.at = 'end';
                            }
                            if( cursor.at === 'end' ) {
                                cursor.end = focused.length;
                                cursor.within = cursor.within + cursor.after;
                                cursor.after = '';
                            }
                        }
                    }
            
                    const newstartx = focused.scrollx + edit.ui.textline.getWidth( focused.context, cursor.before );
                    if( Math.abs( newstartx - cursor.startx ) >= 2 ) cursor.startx = newstartx;
                    const newendx = cursor.startx + edit.ui.textline.getWidth( focused.context, cursor.within );
                    if( Math.abs( newendx - cursor.endx ) >= 2 ) cursor.endx = newendx;
            
                    if( cursor.startx > focused.w ) focused.scrollx = focused.w - (cursor.startx - focused.scrollx);
                    if( cursor.startx < 0 ) focused.scrollx = - (cursor.startx - focused.scrollx);
            
                    focused.updated = true;
                    context.restore();
                },
            
                moveCursor: ( step, select ) => {
                    const { focused } = edit.ui.textline;
                    if( ! focused ) return;
            
                    const { value, cursor, context } = focused;
            
                    context.save();
                    context.font = focused.font;
            
                    if( step === 'wordleft' ) { return console.error( 'wordleft unimplemented' ) }
                    if( step === 'wordright' ) { return console.error( 'wordright unimplemented' ) }
            
                    if( step === 'left' ) {
                        if( cursor.start === 0 ) return;
                        if( select ) {
                            if( cursor.start === cursor.end ) cursor.at = 'start';
                            if( cursor.at === 'start' ) cursor.start -= 1;
                            if( cursor.at === 'end' ) cursor.end -= 1;
                        }
                        else cursor.start = cursor.end = cursor.start - 1;
                    }
            
                    if( step === 'right' ) {
                        if( cursor.end === focused.length ) return;
                        if( select ) {
                            if( cursor.start === cursor.end ) cursor.at = 'end';
                            if( cursor.at === 'start' ) cursor.start += 1;
                            if( cursor.at === 'end' ) cursor.end += 1;
                        }
                        else cursor.start = cursor.end = cursor.end + 1;
                    }
            
                    let i=0, before = '', within = '', after = '';
                    for( const c of value ) {
                        ++ i;
                        if( i <= cursor.start ) before += c;
                        if( i > cursor.start && i <= cursor.end ) within += c;
                        if( i > cursor.end ) after += c;
                    }
            
                    cursor.before = before;
                    cursor.within = within;
                    cursor.after = after;
            
                    const newstartx = focused.scrollx + edit.ui.textline.getWidth( focused.context, before );
                    if( Math.abs( newstartx - cursor.startx ) >= 2 ) cursor.startx = newstartx;
                    const newendx = focused.scrollx + edit.ui.textline.getWidth( focused.context, within );
                    if( Math.abs( newendx - cursor.endx ) >= 2 ) cursor.endx = newendx;
            
                    if( cursor.startx > focused.w ) focused.scrollx = focused.w - (cursor.startx - focused.scrollx);
                    if( cursor.startx < 0 ) focused.scrollx = - (cursor.startx - focused.scrollx);
            
                    focused.updated = true;
                    context.restore();
                },
            
                insert: c => {
                    const { focused } = edit.ui.textline;
                    if( ! focused ) return false;
            
                    const { cursor, context } = focused;
            
                    context.save();
                    context.font = focused.font;
            
                    cursor.before += c;
                    ++ cursor.start;
                    ++ focused.length;
                    cursor.end = cursor.start;
            
                    cursor.startx = cursor.endx = focused.scrollx + edit.ui.textline.getWidth( focused.context, cursor.before );
            
                    let d = 0;
                    for( const c of cursor.within ) ++ d;
                    focused.length -= d;
                    cursor.within = '';
            
                    focused.value = cursor.before + cursor.after;
            
                    if( cursor.startx > focused.w ) focused.scrollx = focused.w - (cursor.startx - focused.scrollx);
            
                    focused.updated = true;
            
                    context.restore();
                    return true;
                },
            
                backspace: ( word ) => {
                    const { focused } = edit.ui.textline;
                    if( ! focused ) return false;
            
                    const { cursor, context } = focused;
            
                    context.save();
                    context.font = focused.font;
            
                    if( cursor.start === cursor.end ) {
                        if( cursor.before.length === 0 ) return false;
            
                        let i = 0, p = null, head = '';
                        for( const c of cursor.before ) {
                            if( p !== null ) head += p;
                            p = c;
                            ++ i;
                        }
                        -- focused.length;
                        cursor.before = head;
                        -- cursor.start;
                        cursor.end = cursor.start;
                    }
            
                    cursor.startx = cursor.endx = focused.scrollx + edit.ui.textline.getWidth( focused.context, cursor.before );
            
                    if( cursor.startx < 0 ) focused.scrollx = Math.min( focused.scrollx + focused.w / 3, 0 );
            
                    let d = 0;
                    for( const c of cursor.within ) ++ d;
                    focused.length -= d;
                    cursor.within = '';
            
                    focused.value = cursor.before + cursor.after;
            
                    focused.updated = true;
            
                    context.restore();
                    return true;
                },
            
                key: e => {

                    let select = false, word = '', command = false;
                    if( typeof e.getModifierState === 'function' ) {
                        if( e.getModifierState( "Alt" ) ||
                            e.getModifierState( "OS" ) ||
                            e.getModifierState( "Fn" ) )
                            return;
                        if( e.getModifierState( "Shift" ) )
                            select = true;
                        if( e.getModifierState( "Control" ) ) { 
                            word = 'word';
                            command = true;
                        }
                    } else {
                        if( e.metaKey || e.altKey ) return;
                        if( e.shiftKey ) select = true;
                        if( e.ctrlKey ) {
                            word = 'word';
                            command = true;
                        }
                    }
            
                    if( ! command ) {
            
                        const code = e.charCode || ( e.key.length === 1 && e.key.charCodeAt( 0 ) );
                
                        if( code >= 32 && code <= 126 &&
                            edit.ui.textline.insert( String.fromCharCode( code ) ) ) {
                            
                            if( typeof e.preventDefault === 'function' ) e.preventDefault();
                            return;
                        }

                    }
            
                    if( e.key === "ArrowLeft" ) {
                        edit.ui.textline.moveCursor( word + 'left', select );
                        if( typeof e.preventDefault === 'function' ) e.preventDefault();
                        return;
                    }
                    if( e.key === "ArrowRight" ) {
                        edit.ui.textline.moveCursor( word + 'right', select );
                        if( typeof e.preventDefault === 'function' ) e.preventDefault();
                        return;
                    }
            
                    if( e.key === "Backspace" ) {
                        edit.ui.textline.backspace( word );
                        if( typeof e.preventDefault === 'function' ) e.preventDefault();
                        return;
                    }
            
                    if( e.key === "End" ) {
                        edit.ui.textline.setCursor( "end", select );
                        if( typeof e.preventDefault === 'function' ) e.preventDefault();
                        return;
                    }
                    if( e.key === "Home" ) {
                        edit.ui.textline.setCursor( "start", select );
                        if( typeof e.preventDefault === 'function' ) e.preventDefault();
                        return;
                    }
                    
                },
            
                click: ( context, { x, y } ) => {
                    const { focused } = edit.ui.textline;
                    if( focused && 
                        focused.context === context &&
                        x > focused.x &&
                        y > focused.y &&
                        x < focused.x + focused.w &&
                        y < focused.y + focused.h ) {
                            focused.context.save();
                            context.font = edit.ui.textline.focused.font;
                            const dx = x + focused.scrollx;
                            let cs = '', i = 0;
                            for( const c of focused.value ) {
                                cs += c;
                                ++ i;
                                const width = edit.ui.textline.getWidth( context, cs );
                                if( dx < ( width + focused.scrollx ) ) {
                                    if( focused.cursor.start !== i || focused.cursor.end !== i ) focused.updated = true;
            
                                    focused.cursor.start = focused.cursor.end = i;
                                    focused.cursor.startx = focused.cursor.endx = width + focused.scrollx;
            
                                    focused.cursor.before = cs;
                                    let j = 0, after = '';
                                    for( const c of focused.value ) {
                                        ++ j;
                                        if( j <= i ) continue;
                                        after += c;
                                    }
                                    focused.cursor.after = after;
                                    break;
                                }
                            }
                            focused.context.restore();
                            return true;
                        }
            
                    for( const line of edit.ui.textline.lines )
                        if( line.context === context &&
                            x > line.x &&
                            y > line.y &&
                            x < line.x + line.w &&
                            y < line.y + line.h ) {
                                edit.ui.textline.focused = line;
                                line.cursor.start = 0;
                                line.cursor.end = line.length;
            
                                line.cursor.before = '';
                                line.cursor.within = line.value;
                                line.cursor.after = '';
            
                                line.cursor.startx = 0;
                                line.cursor.endx = edit.ui.textline.getWidth( context, line.value );
                                return true;
                            }
                },
                render: () => {

                    if( ! edit.ui.textline.focused ) return;

                    if( ! edit.ui.textline.focused.updated ) return;

                    edit.ui.textline.redraw();

                },
                trailingWhitespace: /\s+$/,
                redraw: ( blur, line = edit.ui.textline.focused ) => {

                    if( line === null ) return;
            
                    const { x,y,w,h,scrollx, value, cursor, context, color,selectColor,selectBackgroundColor } = line;
                    const { startx,endx, before,after } = cursor;
            
                    context.save();
                    context.font = line.font;
                    context.textBaseline = 'top';
                    
                    if( blur ) {

                        context.beginPath();
                        context.rect( x,y, w,h );
                        context.clip();
            
                        context.fillStyle = color;
                        context.fillText( value, 0, 0 );
                        context.restore();
                
                        return;
                    }
            
                    if( before ) {
                        context.save();
            
                        context.beginPath();
                        context.rect( x,y, startx-x,h );
                        context.clip();
            
                        context.fillStyle = color;
                        context.fillText( value, x + scrollx, 0 );
            
                        context.restore();
                    }
            
                    //draw selected text
                    if( startx !== endx ) {
                        context.save();
            
                        context.beginPath();
                        context.rect( startx,y, endx-startx,h );
                        context.clip();
                        
                        context.fillStyle = selectBackgroundColor;
                        context.fillRect( startx,0, endx-startx,h );
                        context.fillStyle = selectColor;
                        context.fillText( value, x + scrollx, 0 );
            
                        context.restore();
                    }
            
                    if( after ) {
                        context.save();
            
                        context.beginPath();
                        context.rect( endx,y, w-endx,h );
                        context.clip();
                        
                        context.fillStyle = color;
                        context.fillText( value, x + scrollx, 0 );
            
                        context.restore();
                    }
            
                    //draw cursor
                    context.fillStyle = color;
                    const cursorx = cursor.at === 'start' ? startx : endx;
                    context.fillRect( cursorx, 0, 1, h );
            
                    context.restore();

                    line.updated = false;

                }
            
            },
        },
    
        world: {
            scene: null, 
            camera: null,
            color: { r:0.06 , g:0.06 , b:0.06 },
            setup: () => {
                const scene = new THREE.Scene();
                scene.background = new THREE.Color( edit.world.color.r, edit.world.color.g, edit.world.color.b );
                edit.world.scene = scene;
    
                const container = new THREE.Group();
                scene.add( container );
                edit.world.container = container;
            
                const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, settings.near, settings.far );
                camera.position.set( 0, 1.6, 3 );
                //scene.add( camera );
                container.add( camera );
                edit.world.camera = camera;
        
                if( settings.show_floor_grid === true )
                    edit.world.addFloorGrid();
    
                edit.world.setupLights();
            },
            config: {
                _floorAlpha: 1.0,
                get floorAlpha() { return edit.world.config._floorAlpha },
                set floorAlpha( f ) {
                    edit.world.config._floorAlpha = f;
                    edit.world.floorGrid.material.opacity = f;
                }
            },
            addFloorGrid: () => {
                const gridTexture = new THREE.TextureLoader().load( 'ui/world/Floor Grid.webp' );
                
                const material = new THREE.MeshBasicMaterial( {
                    map: gridTexture,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 1.0,
                } );
    
                const verts = new Float32Array( [
                    -1 , 0 , -1 ,
                    1 , 0 , -1 ,
                    1 , 0 , 1 ,
                    -1 , 0 , 1
                ] );
                const uvs = new Float32Array( [
                    0,0 ,
                    1,0 ,
                    1,1 ,
                    0,1
                ] );
                const indices = [
                    0 , 1 , 2,
                    2 , 3 , 0
                ];
    
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute( 'position' , new THREE.BufferAttribute( verts , 3 ) );
                geometry.setAttribute( 'uv' , new THREE.BufferAttribute( uvs , 2 ) );
                geometry.setIndex( indices );
    
                const grid = new THREE.Mesh( geometry , material );
                edit.world.floorGrid = grid;
                edit.world.scene.add( grid );
            },
            setupLights: () => {
                edit.world.scene.add( new THREE.HemisphereLight( 0x606060, 0x404040 ) );
        
                const light = new THREE.DirectionalLight( 0xffffff );
                light.position.set( 1, 1, 1 ).normalize();
                edit.world.scene.add( light );
            },
            raycaster: {
                object: null, matrix: null,
                setup: () => {
                    edit.world.raycaster.object = new THREE.Raycaster();
                    edit.world.raycaster.matrix = new THREE.Matrix4();
                },
                intersect: ( controller , intersectables ) => {
                    const raycaster = edit.world.raycaster.object;
                    const matrix = edit.world.raycaster.matrix;
    
                    matrix.identity().extractRotation( controller.matrixWorld );
                
                    raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
                    raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( matrix );
                
                    const intersectsArray = raycaster.intersectObjects( intersectables );
                    return intersectsArray;
                },
            },
            movingKey: null,
            stand: () => edit.world.movingKey = null,
            locomote: ( input , camera , movingKey ) => {
                if( edit.world.movingKey !== null && edit.world.movingKey !== movingKey )
                    return false;
    
                const speed = settings.movement_speed;
                const vx = input.axes.x;
                const vy = 0; //TODO: add dedicated vertical movement controls?
                const vz = input.axes.y;
                const vec = {
                    x: ( camera.xAxis.x * vx + camera.yAxis.x * vy + camera.zAxis.x * vz ),
                    y: ( camera.xAxis.y * vx + camera.yAxis.y * vy + camera.zAxis.y * vz ),
                    z: ( camera.xAxis.z * vx + camera.yAxis.z * vy + camera.zAxis.z * vz )
                }
                if( settings.lock_vertical_movement === true ) vec.y = 0;
                const d = Math.sqrt(vec.x**2 + vec.y**2 + vec.z**2);
                if( d < 0.00001 ) return false;
    
                edit.world.movingKey = movingKey;
                edit.world.container.position.x += speed * vec.x / d;
                edit.world.container.position.y += speed * vec.y / d;
                edit.world.container.position.z += speed * vec.z / d;
                return true;
            },
        },
        tools: {
            airbrush: {
                key: null,
                isTrapping: key => key === edit.tools.airbrush.key,
                loseTrappedInput: () => {
                    if( edit.tools.airbrush.key === null ) return;
    
                    //end suddenly
                    edit.tools.airbrush.undoCounts.push( edit.tools.airbrush.undoCounter );
                    edit.tools.airbrush.undoCounter = 0;
                    edit.ui.addUndo( 'airbrush' ); //register undo event with UI
    
                    edit.tools.airbrush.key = null;
                },
                setup: () => {},
                activate: () => {},
                deactivate: () => {},
                outputIsLive: false,
                handleInput: ( input , key ) => {

                    const airbrush = edit.tools.airbrush;
                    if( airbrush.key !== null && airbrush.key !== key )
                        return false; //input not consumed
        
                    const zero = edit.threejs.controls.triggerThreshhold;
                    const pressure = input.trigger;

                    //airbrush
                    if( pressure > zero && airbrush.outputIsLive === false ) {
                        airbrush.key = key;
                        airbrush.start( input );
                        return true;
                    }
                    else if( pressure > zero && airbrush.outputIsLive === true ) {
                        airbrush.update( input );
                        return true;
                    }

                    //record undo event entry
                    else if( pressure <= zero && airbrush.outputIsLive === true ) {
                        airbrush.key = null;
                        airbrush.end();
                        return true;
                    }

                    
                    //color pick
                    const squeeze = input.grip;
                    if( pressure < zero && squeeze > zero ) {
                        const radius = airbrush.config.size;
                        //const layer = edit.ui.panels[ "layers" ].getLayer();
                        const visibleOrLayer = true;
                        const closestPoint = edit.pipelines.brush.pick.closest( input , radius , visibleOrLayer );
                        if( closestPoint === null ) return;
                        const { r,g,b } = closestPoint;
                        edit.ui.panels.color.setRGB( r,g,b );
                    }
    
                    return false; //input not consumed
                },
                start: input => {
                    const airbrush = edit.tools.airbrush;
                    airbrush.outputIsLive = true;
                    airbrush.airbrush( input );
                },
                update: input => {
                    const airbrush = edit.tools.airbrush;
                    airbrush.airbrush( input );
                    edit.pipelines.brush.mergeLastUndos();
                },
                end: () => {
                    const airbrush = edit.tools.airbrush;
                    airbrush.outputIsLive = false;
                    airbrush.undoCounts.push( 1 );
                    edit.ui.addUndo( 'airbrush' );
                },
                
                undoCounts: [],
                redoCounts: [],
                undo: () => {
                    const airbrush = edit.tools.airbrush;
                    if( airbrush.undoCounts.length === 0 ) return;
    
                    airbrush.undoCounts.pop();
                    airbrush.redoCounts.push( 1 );
    
                    edit.pipelines.brush.undo();
    
                    return 'airbrush';
                },
                redo: () => {
                    const airbrush = edit.tools.airbrush;
                    if( airbrush.redoCounts.length === 0 ) return;
    
                    airbrush.redoCounts.pop();
                    airbrush.undoCounts.push( 1 );
    
                    edit.pipelines.brush.redo();
    
                    return 'airbrush';
                },
                clearUndo: () => {
                    const airbrush = edit.tools.airbrush;
                    airbrush.undoCounts.length = 0;
                    airbrush.redoCounts.length = 0;
                },
                clearRedo: () => edit.tools.airbrush.redoCounts.length = 0,
    
    
                config: {
                    size: settings.tools.airbrush.size.initial,
                    opacity: settings.tools.airbrush.opacity.initial,
                },
    
                airbrush: input => {
                    const airbrush = edit.tools.airbrush;
                    const brush = edit.pipelines.brush;
    
                    const radius = airbrush.config.size;
                    const visible = true;
                    const pointsToAirbrush = brush.pick.all( input , radius , visible );
    
                    if( pointsToAirbrush.length === 0 ) return 0;
    
                    const pressure = input.trigger;
                    const f = airbrush.config.opacity * pressure;
                    const fi = 1 - f;
    
                    const { r:R , g:G , b:B } = edit.ui.panels.color.getRGB();
    
                    for( const point of pointsToAirbrush ) {
                        const { r,g,b } = point;
                        point.r = r*fi + R*f;
                        point.g = g*fi + G*f;
                        point.b = b*fi + B*f;
                    }
    
                    brush.updatePoints( pointsToAirbrush );
    
                    return pointsToAirbrush.length;
                },
            },
            erase: {
                key: null,
                isTrapping: key => key === edit.tools.erase.key,
                loseTrappedInput: () => {
                    if( edit.tools.erase.key === null ) return;
    
                    //end suddenly
                    edit.tools.erase.undoCounts.push( 1 );
                    edit.ui.addUndo( 'erase' ); //register undo event with UI
    
                    edit.tools.erase.key = null;
                },
                setup: () => {},
                activate: () => {},
                deactivate: () => {},
    
                outputIsLive: false,
                handleInput: ( input , key ) => {
                    const erase = edit.tools.erase;
                    if( erase.key !== null && erase.key !== key )
                        return false; //input not consumed
        
                    const zero = edit.threejs.controls.triggerThreshhold;
                    const pressure = input.trigger;
                    //erase
                    if( pressure > zero && erase.outputIsLive === false ) {
                        erase.key = key;
                        erase.start( input );
                        return true;
                    }
                    else if( pressure > zero && erase.outputIsLive === true ) {
                        erase.update( input );
                        return true;
                    }
                    else if( pressure <= zero && erase.outputIsLive === true ) {
                        erase.key = null;
                        erase.end();
                        return true;
                    }
    
                    return false; //input not consumed
                },
    
                start: input => {
                    const erase = edit.tools.erase;
                    erase.outputIsLive = true;
                    erase.erase( input );
                },
                update: input => {
                    const erase = edit.tools.erase;
                    erase.erase( input );
                    edit.pipelines.brush.mergeLastUndos();
                },
                end: () => {
                    const erase = edit.tools.erase;
                    erase.outputIsLive = false;
                    erase.undoCounts.push( 1 );
                    edit.ui.addUndo( 'erase' );
                },
    
                undoCounts: [],
                redoCounts: [],
    
                undo: () => {
                    const erase = edit.tools.erase;
                    if( erase.undoCounts.length === 0 ) return;
                    
                    erase.undoCounts.pop();
                    erase.redoCounts.push( 1 );
    
                    edit.pipelines.brush.undo();
    
                    return 'erase';
                },
                redo: () => {
                    const erase = edit.tools.erase;
                    if( erase.redoCounts.length === 0 ) return;
    
                    erase.redoCounts.pop();
                    erase.undoCounts.push( 1 );
    
                    edit.pipelines.brush.redo();
    
                    return 'erase';
                },
                clearUndo: () => {
                    const erase = edit.tools.erase;
                    erase.undoCounts.length = 0;
                    erase.redoCounts.length = 0;
                },
                clearRedo: () => edit.tools.erase.redoCounts.length = 0,
                
                config: {
                    size: settings.tools.erase.size.initial,
                },
    
                erase: input => {
                    const erase = edit.tools.erase;
                    const brush = edit.pipelines.brush;
                    
                    const sizeScale = input.trigger;
                    const radius = erase.config.size * sizeScale;
                    const visible = true;
                    const pointsToErase = brush.pick.all( input , radius , true );
                    
                    for( const point of pointsToErase )
                        point.layer = 0;
    
                    edit.pipelines.brush.updatePoints( pointsToErase );
                },
            },
            draw: {
                key: null,
                isTrapping: key => key === edit.tools.draw.key,
                loseTrappedInput: () => {
                    const draw = edit.tools.draw;
                    draw.outputIsLive = false;
    
                    if( draw.key === null ) return;
    
                    //end suddenly, no more points to register
                    draw.undoCounts.push( draw.outputLine.length );
                    edit.ui.addUndo( 'draw' ); //register undo event with UI
        
                    draw.key = null;
                },
                setup: () => {},
                activate: () => {},
                deactivate: () => {},
    
                guide: 'free',
                activateGuide: guide => {
                    const draw = edit.tools.draw;
                    if( guide === 'free' ) draw.guide = 'free';
                    if( guide === 'line' ) draw.guide = 'line';
                    if( guide === 'ellipse' ) draw.guide = 'ellipse';
                    if( guide === 'overdraw' ) draw.guide = 'overdraw';
                },
                
                handleInput: ( input , key ) => {
                    const draw = edit.tools.draw;
                    if( draw.key !== null && draw.key !== key )
                        return false; //input not consumed
        
                    const zero = edit.threejs.controls.triggerThreshhold;
                    const pressure = input.trigger;
                    //start
                    if( pressure > zero && draw.outputIsLive === false ) {
                        draw.key = key;
                        draw.start( input );
                        return true;
                    }
                    //move
                    else if( pressure > zero && draw.outputIsLive === true ) {
                        draw.key = key;
                        draw.update( input );
                        return true;
                    }
                    //end
                    else if( pressure <= zero && draw.outputIsLive === true ) {
                        draw.end();
                        draw.key = null;
                        return true;
                    }
    
                    //color pick
                    const squeeze = input.grip;
                    if( pressure < zero && squeeze > zero ) {
                        const radius = draw.config.size;
                        //const layer = edit.ui.panels[ "layers" ].getLayer();
                        const visibleOrLayer = true;
                        const closestPoint = edit.pipelines.brush.pick.closest( input , radius , visibleOrLayer );
                        if( closestPoint === null ) return;
                        const { r,g,b } = closestPoint;
                        edit.ui.panels.color.setRGB( r,g,b );
                    }
                  
                    return false; //input not consumed
                },
        
                config: {
                    size: settings.tools.draw.size.initial,
                    spacing: settings.tools.draw.spacing.initial,
                    blending: settings.tools.draw.blending.initial,
                },
    
                //layer 0: reserved for deleted point
                //layer 1: (concept) reserved for flat line art
                //layer 2: initial default
                //layer 3-127: optional / available
                layer: 2, 
                _hslColor: { h:0,s:0,l:0 },
                _color: {r:0,g:0,b:0},
        
                undo: () => {
                    if( edit.tools.draw.undoCounts.length === 0 ) return;
    
                    edit.tools.draw.undoCounts.pop();
                    edit.tools.draw.redoCounts.push( 1 );
    
                    edit.pipelines.brush.undo();
    
                    return 'draw'; //allow redo on this tool ID
                },
                redo: () => {
                    if( edit.tools.draw.redoCounts.length === 0 ) return;
    
                    edit.tools.draw.redoCounts.pop();
                    edit.tools.draw.undoCounts.push( 1 );
    
                    edit.pipelines.brush.redo();
    
                    return 'draw'; //allow un-redo on this tool ID
                },
                clearUndo: () => {
                    edit.tools.draw.undoCounts.length = 0;
                    edit.tools.draw.redoCounts.length = 0;
                },
                clearRedo: () => {
                    edit.tools.draw.redoCounts.length = 0;
                },
    
                undoCounts: [],
                redoCounts: [],
    
                inputLine: [],
                inputLineDistance: 0,
                outputLine: [],
                outputIsLive: false,
    
                clearInputLine: () => {
                    const draw = edit.tools.draw;
                    draw.inputLine.length = 0
                    draw.inputLineDistance = 0;
                },
                clearOutputLine: () => edit.tools.draw.outputLine.length = 0,
    
                addInputPoint: input => {
                    const draw = edit.tools.draw;
    
                    const { 
                            x , y , z , 
                            trigger: pressure ,
                            xAxis , zAxis
                        } = input;
                    const { r , g , b } = edit.ui.panels[ 'color' ].getRGB();
                    const size = draw.config.size;
                    const layer = edit.ui.panels[ "layers" ].getLayer();
    
                    const newPoint = {
                        o: { x,y,z } , //original coordinates (if end-modified)
                        x , y , z ,
                        r , g , b ,
                        s: pressure * size ,
                        layer ,
                        h: { ...xAxis }, //horizontal vector
                        v: { ...zAxis }, //vertical vector
                        d: 0 , //distance to prior point
                        t: 0 , //traversal distance along line
                    };
    
                    let dx , dy , dz , d;
    
                    //if we're in range of our last point,
                    //  just update its non-coordinate values (avoid line-start / end tapers)
                    if( draw.inputLine.length >= 1 ) {
                        const lastPoint = draw.inputLine[ draw.inputLine.length - 1 ];
                        const spacing = draw.config.spacing;
                        dx = newPoint.x - lastPoint.o.x;
                        dy = newPoint.y - lastPoint.o.y;
                        dz = newPoint.z - lastPoint.o.z;
                        d = Math.sqrt( dx**2 + dy**2 + dz**2 );
                        if( draw.inputLength >= 2 && d < spacing ) {
                            lastPoint.x = x; lastPoint.y = y; lastPoint.z = z;
                            lastPoint.r = r; lastPoint.g = g; lastPoint.b = b;
                            //we expect the new, smaller ink to be 'covered up'
                            //  by the former, larger ink blob.
                            //  So, size-overwriting only works on rising pressure,
                            //  not falling.
                            lastPoint.s = Math.max( newPoint.s , lastPoint.s );
                            lastPoint.h = newPoint.h;
                            lastPoint.v = newPoint.v;
                            //since lastPoint.xyz does not change permanently (much),
                            //  lastPoint.d and lastPoint.t can be thought not to change
                            //  (in most cases)
                            return;
                        }
                    }
    
                    draw.inputLine.push( newPoint );
    
                    if( draw.inputLine.length >= 2 ) {
                        const lastPoint = draw.inputLine[ draw.inputLine.length - 2 ];
                        //if our last point was end-modified, restore its original coordinates
                        lastPoint.x = lastPoint.o.x;
                        lastPoint.y = lastPoint.o.y;
                        lastPoint.z = lastPoint.o.z;
    
                        if( d === undefined ) {
                            dx = newPoint.x - lastPoint.x;
                            dy = newPoint.y - lastPoint.y;
                            dz = newPoint.z - lastPoint.z;
                            d = Math.sqrt( dx**2 + dy**2 + dz**2 );
                        }
                            
                        newPoint.d = d;
                        draw.inputLineDistance += d;
                        
                        if( draw.inputLine.length === 2 ) {
                            newPoint.t = 1.0;
                            return;
                        }
                        
                        let currentDistance = 0;
                        const lineDistance = draw.inputLineDistance;
                        for( const point of draw.inputLine ) {
                            currentDistance += point.d;
                            const t = currentDistance / lineDistance;
                            point.t = t;
                        }
                    }
                },
                interpolatePoints: ( a , b , f ) => {
                    const fi = 1 - f;
                    const interpolatedPoint = {
                        x: a.x * fi + b.x * f,
                        y: a.y * fi + b.y * f,
                        z: a.z * fi + b.z * f,
    
                        r: a.r * fi + b.r * f,
                        g: a.g * fi + b.g * f,
                        b: a.b * fi + b.b * f,
    
                        s: a.s * fi + b.s * f,
    
                        layer: a.layer,
    
                        d: a.d * fi + b.d * f,
                        t: a.t * fi + b.t * f,
                    }
                    return interpolatedPoint;
                },
                interpolateInputLine: t => {
                    const draw = edit.tools.draw;
    
                    if( t === 0 ) return draw.inputLine[ 0 ];
                    if( t === 1 ) return draw.inputLine[ draw.inputLine.length - 1 ];
    
                    let priorPoint = draw.inputLine[ 0 ];
                    for( const point of draw.inputLine ) {
                        if( point.t === t )
                            return point;
                        if( point.t < t ) {
                            priorPoint = point;
                            continue;
                        }
                        const startT = priorPoint.t;
                        const endT = point.t;
                        const tRange = endT - startT;
                        const f = ( t - startT ) / tRange;
                        const interpolatedPoint = 
                            draw.interpolatePoints( 
                                priorPoint , point , f 
                            );
                        return interpolatedPoint;
                    }
                },
    
                addOutputPoint: ( point , priorPoint ) => {
                    const draw = edit.tools.draw;
                    const outputPoint = {
                        x: point.x , y: point.y , z: point.z ,
                        s: point.s ,
                        r: point.r , g: point.g , b: point.b ,
                        layer: point.layer ,
                        lastX: priorPoint ? priorPoint.x : 0,
                        lastY: priorPoint ? priorPoint.y : 0,
                        lastZ: priorPoint ? priorPoint.z : 0,
                        lastS: priorPoint ? priorPoint.s : 0,
                    }
                    draw.outputLine.push( outputPoint );
                },
                
                updateOutputLine: () => {
                    const draw = edit.tools.draw;
                    const updater = draw.outputUpdaters[ draw.guide ];
                    updater();
                },
    
                outputUpdaters: {
                    'free': () => {
                        const draw = edit.tools.draw;
                        draw.outputLine.length = 0;
                        if( draw.inputLine.length === 0 ) return;
                        {
                            //add start point
                            const point = draw.inputLine[ 0 ];
                            draw.addOutputPoint( point , null );
                        }
                        if( draw.inputLine.length === 1 ) return;
    
                        //interpolate line steps
                        let lastInterpolatedPoint = null;
    
                        {
                            const spacing = draw.config.spacing;
                            const tStepsCount = parseInt( draw.inputLineDistance / spacing );
                            if( tStepsCount === 0 ) {
                                lastInterpolatedPoint = draw.inputLine[ 0 ];
                            }
                            else if( tStepsCount <= 2 ) {
                                const interpolatedPoint = draw.interpolateInputLine( 0.5 );
                                draw.addOutputPoint( interpolatedPoint , draw.inputLine[ 0 ] );
                                lastInterpolatedPoint = interpolatedPoint;
                            }
                            else if( tStepsCount > 2 ) {
                                const tStep = spacing / draw.inputLineDistance;
                                const tStart = tStep;
                                lastInterpolatedPoint = draw.inputLine[ 0 ];
                                for( let t = tStart; t < 1.0; t += tStep ) {
                                    const interpolatedPoint = draw.interpolateInputLine( t );
                                    draw.addOutputPoint( interpolatedPoint , lastInterpolatedPoint );
                                    lastInterpolatedPoint = interpolatedPoint;
                                }
                            }
                        }
    
                        {
                            //add end point
                            const point = draw.outputLine[ draw.outputLine.length - 1 ];
                            draw.addOutputPoint( point , lastInterpolatedPoint );
                        }
                    },
                    'line': ()=>{
                        const draw = edit.tools.draw;
                        draw.outputLine.length = 0;
                        if( draw.inputLine.length === 0 ) return;
                        if( draw.inputLine.length === 1 ) {
                            //add start point
                            const point = draw.inputLine[ 0 ];
                            draw.addOutputPoint( point , null );
                            return;
                        }
                        else if( draw.inputLine.length === 2 ) {
                            const startPoint = draw.inputLine[ 0 ];
                            const endPoint = draw.inputLine[ 1 ];
                            draw.addOutputPoint( startPoint , null );
                            draw.addOutputPoint( endPoint , startPoint );
                        }
                        else if( draw.inputLine.length > 2 ) {
                            const startPoint = draw.inputLine[ 0 ];
                            const endPoint = draw.inputLine[ draw.inputLine.length - 1 ];
    
                            let lastInterpolatedPoint = startPoint;
    
                            const dx = endPoint.x - startPoint.x;
                            const dy = endPoint.y - startPoint.y;
                            const dz = endPoint.z - startPoint.z;
    
                            const d = Math.sqrt( dx*dx + dy*dy + dz*dz );
    
                            const spacing = draw.config.spacing;
    
                            //size over time does not work.
                            //  interpolation to end point would guarantee
                            //  trailing low-pressures creating undesired tapered caps
                            const size = draw.config.size;
    
                            const tStep = spacing / d;
                            const tStart = tStep;
                            for( let t = tStart; t < 1.0; t += tStep ) {
                                const linearInterpolatedPoint = draw.interpolatePoints( startPoint , endPoint , t );
                                linearInterpolatedPoint.s = size;
                                draw.addOutputPoint( linearInterpolatedPoint , lastInterpolatedPoint );
                                lastInterpolatedPoint = linearInterpolatedPoint;
                            }
                        }
                    },
                    'ellipse': ()=>{
                        const draw = edit.tools.draw;
                        draw.outputLine.length = 0;
                        if( draw.inputLine.length === 0 ) return;
                        if( draw.inputLine.length === 1 ) {
                            //only a center point
                            const point = draw.inputLine[ 0 ];
                            draw.addOutputPoint( point , null );
                            return;
                        }
                        else if( draw.inputLine.length >= 2 ) {
                            const startPoint = draw.inputLine[ 0 ];
                            const endPoint = draw.inputLine[ draw.inputLine.length - 1 ];
    
                            const dx = endPoint.x - startPoint.x;
                            const dy = endPoint.y - startPoint.y;
                            const dz = endPoint.z - startPoint.z;
    
                            const { r , g , b } = endPoint;
    
                            //since we don't have size-control over time,
                            //  we must not allow low trailing pressures to control size
                            //  size must be controlled by 2nd controller
                            const size = draw.config.size;
    
                            const radius = Math.sqrt( dx*dx + dy*dy + dz*dz );
                            const diameter = 2 * Math.PI * radius;
                            const rv = { x:dx/radius, y:dy/radius, z:dz/radius }; //radial vector
                            const tv = endPoint.h; //transverse vector
    
                            const spacing = draw.config.spacing;
    
                            const tStep = spacing / diameter; //also length of polygon sides
    
                            let lastRingVertex = null;
    
                            const addRingVertex = t => {
                                const angle = t * 6.283185307179586;
    
                                const cos = Math.cos( angle ) * radius;
                                const sin = Math.sin( angle ) * radius;
    
                                const point = {
                                    x: startPoint.x + rv.x * cos + tv.x * sin,
                                    y: startPoint.y + rv.y * cos + tv.y * sin,
                                    z: startPoint.z + rv.z * cos + tv.z * sin,
    
                                    r , g , b ,
    
                                    s: size ,
                                    
                                    layer: startPoint.layer,
    
                                    d: tStep ,
                                    t
                                }
                                draw.addOutputPoint( point , lastRingVertex );
                                lastRingVertex = point;
                            }
    
                            for( let t = 0; t < 1.0; t += tStep )
                                addRingVertex( t );
    
                            addRingVertex( 1.0 );
                        }
                    },
                    'overdraw': ()=>{
                        /* 
                            Concept:
                                A new stroke maps its flow onto the flow of previously drawn lines.
                                Those lines are updated to a weighted average of the two.
                        */
                    },
                    'broad': ()=>{
                        /* 
                            Concept:
                                Draw multiple parallel lines spaced along a line parallel to the cross-axis.
                                Creates a ribbon trailing through the air
                         */
                    }
                },
    
                pushOutputLineToBrush: () => {
                    edit.pipelines.brush.appendPoints( 
                        edit.tools.draw.outputLine );
                },
                
                removeOutputLineFromBrush: () => {
                    if( edit.tools.draw.outputIsLive === false ) return;
                    edit.pipelines.brush.undo();
                },
                
    
                start: input => {
                    const draw = edit.tools.draw;
                    draw.outputIsLive = true;
    
                    draw.clearInputLine();
                    draw.clearOutputLine();
                    draw.addInputPoint( input );
                    draw.updateOutputLine();
                    draw.pushOutputLineToBrush();
                },
                update: input => {
                    const draw = edit.tools.draw;
    
                    draw.addInputPoint( input );
                    draw.updateOutputLine();
                    draw.removeOutputLineFromBrush();
                    draw.pushOutputLineToBrush();
                },
                end: () => {
                    const draw = edit.tools.draw;
                    draw.outputIsLive = false;
    
                    //since pressure is already 0 on end,
                    //  we will add no new point.
                    //  drawing input has already terminated before entering this function
    
                    draw.undoCounts.push( 1 );
                    edit.ui.addUndo( 'draw' );
                },
    
            },
    
            polymesh: {
                key: null,
                isTrapping: key => key === edit.tools.polymesh.key,
                loseTrappedInput: () => {
                    const polymesh = edit.tools.polymesh;
                    polymesh.outputIsLive = false;
    
                    if( polymesh.key === null ) return;
    
                    polymesh.end();
                    polymesh.key = null;
                    polymesh.capturing = null;
                },
    
                setup: () => {
                    const polymesh = edit.tools.polymesh;
                    polymesh.setupEdges();
                    polymesh.setupVertexInstancer();
                },
                activate: () => {
                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    polymesh.vertexInstancer.visible = true;
    
                    mesh.showVertices();
                    mesh.useMaterial( 'wireframe' );
                },
                deactivate: () => {
                    edit.tools.polymesh.vertexInstancer.visible = false;
                },
    
                capturing: null , // null | 'pressure' | 'grip'
                dualCapturing: null,
                handleInput: ( input , key ) => {

                    
                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;

                    //TODO: implement dual capturing: grip=scale, trigger?=repeat?
                    if( polymesh.key !== null && polymesh.key !== key )
                        return false; //input not consumed
                    
                    const zero = edit.threejs.controls.triggerThreshhold;
                    const pressure = input.trigger > zero;
                    const grip = input.grip > zero;
    
                    if( pressure <= zero && grip <= zero && polymesh.capturing === null ) {
    
                        polymesh.previewEdit( input , key );
    
                    }
    
                    if( pressure > zero && polymesh.capturing === null ) {
    
                        polymesh.key = key;
                        polymesh.capturing = 'pressure';
    
                        polymesh.disablePreview();
                        mesh.hideVertices();
    
                        polymesh.startAdd( input );
    
                        return true;
                    }
    
                    else if( grip > zero && polymesh.capturing === null ) {
    
                        const gripped = polymesh.startMove( input );
    
                        if( gripped === true ) {

                            polymesh.key = key;
                            polymesh.capturing = 'grip';
    
                            polymesh.disablePreview();
                            mesh.hideVertices();
    
                            return true;

                        }
    
                        else return false;
                    }
    
                    else if( 
                        ( pressure > zero && polymesh.capturing === 'pressure' ) ||
                        ( grip > zero && polymesh.capturing === 'grip' )
                    ) {
    
                        const continueCapturing = polymesh.update( input );
    
                        if( continueCapturing === false ) {

                            polymesh.end();
                            mesh.showVertices();
    
                            polymesh.key = null;
                            polymesh.capturing = null;

                        }
    
                        return true;
                    }
    
                    else if(
                        ( pressure <= zero && polymesh.capturing === 'pressure' ) ||
                        ( grip <= zero && polymesh.capturing === 'grip' ) 
                    ) {
    
                        polymesh.end();
                        mesh.showVertices();
    
                        polymesh.key = null;
                        polymesh.capturing = null;
    
                        return true;
                    }
    
                    return false;
                },
    
                undoHistory: [],
                redoHistory: [],
                undo: () => {
                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    if( polymesh.undoHistory.length === 0 ) return;
    
                    const depth = polymesh.undoHistory.pop();
    
                    for( let i=0; i<depth; i++ ) mesh.undo();
    
                    polymesh.redoHistory.push( depth );
    
                    return 'polymesh'; //allow redo
                },
                redo: () => {
                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    if( polymesh.redoHistory.length === 0 ) return;
    
                    const depth = polymesh.redoHistory.pop();
    
                    for( let i=0; i<depth; i++ ) mesh.redo();
    
                    polymesh.undoHistory.push( depth );
    
                    return 'polymesh'; //allow undo
                },
                clearUndo: () => {
                    const polymesh = edit.tools.polymesh;
                    polymesh.undoHistory.length = 0;
                    polymesh.redoHistory.length = 0;
                },
                clearRedo: () => {
                    edit.tools.polymesh.redoHistory.length = 0;
                },
    
                mode: null,
                store: {
                    'move-vertex': { vertex: null },
                    'add-vertex': { vertex: null },
                    'add-face-from-vertex': { a: null , b: null },
                    'add-triangle-from-edge': { vertex: null, a: null, b: null },
                    'add-quad-from-edge': { a: null , b: null , va: null , vb: null, c: null, d: null },
    
                    'create-triangle': { origin:null, a:null,b:null,c:null, },
                    'create-quad': { origin:null, a:null,b:null,c:null,d:null },
    
                    'move-many': [],
                },
                modeUndoDepths: {
                    'move-vertex': 1,
                    'add-vertex': 2,
                    'add-face-from-vertex': 1,
                    'add-triangle-from-edge': 3,
                    'add-quad-from-edge': 6,
    
                    'create-triangle': 7,
                    'create-quad': 10,
    
                    //move-many varies
                },
    
                activateGuide: guide => {
                    const config = edit.tools.polymesh.config
                    
                    if( guide === 'quad' ) config.guide = 'quad';
                    if( guide === 'triangle' ) config.guide = 'triangle';
    
                },
                config: {
                    radius: 0.03,
    
                    disableVertexMode: true,
                    edgeColor: { r:1.0 , g:1.0 , b:1.0 }, //not in use? (vert mode disabled)
                    edgeThickness: 0.003, //not in use? (vert mode disabled)
    
                    guide: 'quad', //'quad' | 'triangle'
                    snapRadius: 0.1,
    
                    //proxy control mesh vertices + edges
                    _vertexColor: { r:1.0, g:0.5, b:0.2 },
                    get vertexColor() { return edit.tools.polymesh.config._vertexColor },
                    set vertexColor( {r,g,b} ) { 
                        edit.tools.polymesh.config._vertexColor = { r,g,b };
                        edit.tools.polymesh.vertexInstancer.material.uniforms.rgb.value = [r,g,b];
                    },
                    get vertex() { return edit.pipelines.mesh.config.vertexSize },
                    set vertex(s) { 
                        edit.pipelines.mesh.config.vertexSize = s;
                        edit.tools.polymesh.vertexInstancer.material.uniforms.vertexSize.value = s * 1.1;
                    },
                    get edge() { return edit.pipelines.mesh.config.wireThickness },
                    set edge(t) { edit.pipelines.mesh.config.wireThickness = t; },
                },
    
    
                previewingPoints: {},
    
                previewEdit: ( input , key ) => {
                    const polymesh = edit.tools.polymesh;
    
                    const layer = edit.ui.panels[ 'layers' ].getLayer();
                    const handles = edit.pipelines.mesh.pick.handles.closest( input , layer , polymesh.config.radius );
                    const points = [];
                    if( handles.vertex ) points.push( handles.vertex );
                    if( handles.edge ) points.push( handles.edge );
                    polymesh.previewingPoints[ key ] = points;
    
                    const allPoints = Object.values( polymesh.previewingPoints ).flat();
    
                    polymesh.updateVertexInstancer( allPoints );
                },
    
                disablePreview: () => edit.tools.polymesh.updateVertexInstancer( [] ),
    
    
                startAdd: input => {

                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    const radius = polymesh.config.snapRadius;
                    const guide = polymesh.config.guide;
                    const layer = edit.ui.panels[ "layers" ].getLayer();
    
                    const edge = mesh.pick.edges.closest( input , layer , radius );
    
                    if( edge ) {
                        if( guide === 'quad' ) {
                            const mode = 'add-quad-from-edge';
                            polymesh.mode = mode;
    
                            const store = polymesh.store[ mode ];
    
                            const layer = edit.ui.panels[ "layers" ].getLayer();
                            const color = edit.ui.panels[ "color" ].getRGB();
    
                            const { sub , dot } = edit.math.vector;
    
                            //unimplemented
    
                            //va = (a - xyz) <- cast controller space
                            const a = sub( edge.a , input );
                            store.va = {
                                x: dot( a , input.xAxis ),
                                y: dot( a , input.yAxis ),
                                z: dot( a , input.zAxis ),
                            }
    
                            //vb = (b - xyz) <- cast controller space
                            const b = sub( edge.b , input );
                            store.vb = {
                                x: dot( b , input.xAxis ),
                                y: dot( b , input.yAxis ),
                                z: dot( b , input.zAxis ),
                            }
    
                            //add new vertex a at 0
                            store.a = mesh.addVertex( edge.a );
                            
                            //add new vertex b at 1
                            store.b = mesh.addVertex( edge.b );
    
                            //add new face 0,a,1
                            mesh.addFace( { a:edge.a , b:store.a , c:edge.b , layer , color } );
    
                            //add new face a,b,1
                            mesh.addFace( { a: store.a , b: store.b , c: edge.b , layer , color } );
                            
                            //no effect, used to enable undo merging on update:
                            mesh.updateVertex( store.a );
                            mesh.updateVertex( store.b );
    
                            //prevent snap to source edge
                            store.c = edge.a;
                            store.d = edge.b;
        
                            return true;
                        }
                        else if( guide === 'triangle' ) {
                            const mode = 'add-triangle-from-edge';
                            polymesh.mode = mode;
        
                            const bisectingVertex = mesh.addVertex( { 
                                x: input.x , y: input.y , z: input.z ,
                                layer ,
                            } );
        
                            mesh.addFace( {
                                //note: shared edge will necessarily traverse in reverse
                                //  for outside-normals arrangement
                                a: edge.b , b: edge.a , c: bisectingVertex,
                                layer ,
                                color: edit.ui.panels[ 'color' ].getRGB(),
                            } );
        
                            //no effect, used to enable undo merging on update:
                            mesh.updateVertex( bisectingVertex );

                            const store = polymesh.store[ mode ];
                            store.vertex = bisectingVertex;
        
                            //prevent snap to source edge
                            store.a = edge.a;
                            store.b = edge.b;
    
                            return true;
                        }
                    } else if( ! edge && polymesh.config.disableVertexMode === false ) {
    
                        const vertex = mesh.pick.vertices.closest( input , layer , radius );
    
                        if( vertex ) {
                            const mode = 'add-face-from-vertex'
                            polymesh.mode = mode;
        
                            polymesh.edges[ 0 ].mesh.visible = true;
                            polymesh.edges[ 0 ].updatePoint( 0 , vertex );
                            polymesh.edges[ 0 ].updatePoint( 1 , input );
        
                            const store = polymesh.store[ mode ];
                            store.a = vertex;
                            store.b = null;
        
                            return true;
                        }
                        else if( ! vertex ) {
                            const mode = 'add-vertex';
        
                            polymesh.mode = mode;
        
                            const vertex = mesh.addVertex( {
                                x: input.x , y: input.y , z: input.z ,
                                layer ,
                            } );
        
                            //no effect, used to enable undo merging on update:
                            mesh.updateVertex( vertex );
        
                            const store = polymesh.store[ mode ];
                            store.vertex = vertex;
        
                            return true;
                        }
    
                    } else if( ! edge && polymesh.config.disableVertexMode === true ) {
    
                        if( guide === 'quad' ) {
    
                            polymesh.mode = 'create-quad';
    
                            const store = polymesh.store[ polymesh.mode ];
    
                            const { x,y,z } = input;
                            const color = edit.ui.panels[ 'color' ].getRGB();
    
                            //add 4 verts at input
                            const a = store.a = mesh.addVertex( { x,y,z , layer } );
                            const b = store.b = mesh.addVertex( { x,y,z , layer } );
                            const c = store.c = mesh.addVertex( { x,y,z , layer } );
                            const d = store.d = mesh.addVertex( { x,y,z , layer } );
    
                            //add 2 faces (no need to store, will update with vert update)
                            mesh.addFace( { a , b , c , layer , color } );
                            mesh.addFace( { a:c , b:d , c:a , layer , color } );
    
                            //on update compute from distance to center, axes
                            store.origin = input;
    
                            //no effect, used to enable undo merging on update:
                            mesh.updateVertex( a );
                            mesh.updateVertex( b );
                            mesh.updateVertex( c );
                            mesh.updateVertex( d );
    
                            return true;
                        }
    
                        if( guide === 'triangle' ) {
                            polymesh.mode = 'create-triangle';
    
                            const store = polymesh.store[ polymesh.mode ];
    
                            const { x,y,z } = input;
                            const color = edit.ui.panels[ 'color' ].getRGB();
    
                            //add 3 verts at input
                            const a = store.a = mesh.addVertex( { x,y,z , layer } );
                            const b = store.b = mesh.addVertex( { x,y,z , layer } );
                            const c = store.c = mesh.addVertex( { x,y,z , layer } );
    
                            //add face (no need to store, will update with vert update)
                            mesh.addFace( { a , b , c , layer , color } );
    
                            //on update compute from distance to center, axes
                            store.origin = input;
    
                            //no effect, used to enable undo merging on update:
                            mesh.updateVertex( a );
                            mesh.updateVertex( b );
                            mesh.updateVertex( c );
    
                            return true;
                        }
    
                    }
    
                },
    
                startMove: input => {
    
                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    const radius = polymesh.config.radius;
                    const layer = edit.ui.panels[ "layers" ].getLayer();
    
                    const vertex = mesh.pick.vertices.closest( input , layer , radius );
    
                    if( ! vertex ) return false;
    
                    const mode = 'move-vertex';
                    polymesh.mode = mode;
    
                    const store = polymesh.store[ mode ];
                    store.vertex = vertex;
    
                    const { sub , dot } = edit.math.vector;
    
                    const a = sub( vertex , input );
    
                    const vector = {
                        x: dot( a , input.xAxis ),
                        y: dot( a , input.yAxis ),
                        z: dot( a , input.zAxis ),
                    };
    
                    store.vector = vector;
    
                    //no effect, used to enable undo merging on update:
                    mesh.updateVertex( vertex );
    
                    return true;
                },
    
                update: input => {
                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    const mode = polymesh.mode;
                    const store = polymesh.store[ mode ];
                    const snapRadius = polymesh.config.snapRadius;
    
                    const { add , scale , sub , len , set } = edit.math.vector;
    
                    if( mode === 'move-vertex' ) {
                        const size = 1.0; //to set from 2nd controller
    
                        const ax = scale( input.xAxis , store.vector.x * size );
                        const ay = scale( input.yAxis , store.vector.y * size );
                        const az = scale( input.zAxis , store.vector.z * size );
    
                        const a = add( input , add( ax , add( ay , az ) ) );
    
                        store.vertex.x = a.x;
                        store.vertex.y = a.y;
                        store.vertex.z = a.z;
    
                        if( snapRadius > 0 ) polymesh.snapVertex( store.vertex, store );
    
                        mesh.updateVertex( store.vertex );
    
                        mesh.mergeLastUndos();
    
                        return true; //continue capturing input
                    }
    
                    else if( mode === 'add-vertex' ) {
                        store.vertex.x = input.x;
                        store.vertex.y = input.y;
                        store.vertex.z = input.z;
    
                        //do not snap individual new vertices
    
                        mesh.updateVertex( store.vertex );
    
                        mesh.mergeLastUndos();
    
                        return true; //continue capturing input
                    }
    
                    else if( mode === 'add-face-from-vertex' ) {
                        const radius = polymesh.config.radius;
                        const layer = edit.ui.panels[ "layers" ].getLayer();
                    
                        const closestVertex = mesh.pick.vertices.closest( input , layer , radius );
    
                        if( store.b === null ) {
                            const nextVertex = ( 
                                    closestVertex && 
                                    closestVertex.i === store.a.i 
                                ) ? null : closestVertex;
    
                            //currently adding first edge
                            if( ! nextVertex ) {
                                //update edge position
                                polymesh.edges[ 0 ].updatePoint( 1 , input );
    
                                return true; //continue capturing input
                            }
                            else if( nextVertex ) {
                                //proceed to adding second edge
                                polymesh.edges[ 0 ].updatePoint( 1 , nextVertex );
    
                                polymesh.edges[ 1 ].mesh.visible = true;
                                polymesh.edges[ 1 ].updatePoint( 0 , nextVertex );
                                polymesh.edges[ 1 ].updatePoint( 1 , input );
    
                                store.b = nextVertex;
                                
                                return true; //continue capturing input
                            }
                        }
                        else if( store.b ) {
                            const nextVertex = ( 
                                closestVertex &&
                                ( closestVertex.i === store.a.i ||
                                closestVertex.i === store.b.i )
                                ) ? null : closestVertex;
                            //currently adding second edge
                            if( ! nextVertex ) {
                                polymesh.edges[ 1 ].updatePoint( 1 , input );
    
                                return true; //continue capturing input
                            }
                            else if( nextVertex ) {
                                //have final vertex, auto-finish face
                                mesh.addFace( {
                                    a: store.a , b: store.b , c: nextVertex ,
                                    layer ,
                                    color: edit.ui.panels[ 'color' ].getRGB() ,
                                } );
    
                                return false; //finish capturing input
                            }
                        }
                    }
                    else if( mode === 'add-triangle-from-edge' ) {
                        store.vertex.x = input.x;
                        store.vertex.y = input.y;
                        store.vertex.z = input.z;
    
                        if( snapRadius > 0 ) polymesh.snapVertex( store.vertex, store );
    
                        mesh.updateVertex( store.vertex );
    
                        mesh.mergeLastUndos();
    
                        return true; //continue capturing input
                    }
                    else if( mode === 'add-quad-from-edge' ) {
                        
                        const size = 1.0; //to set from 2nd controller
    
                        //vector a * scale -> cast input space + controller xyz
                        const ax = scale( input.xAxis , store.va.x * size );
                        const ay = scale( input.yAxis , store.va.y * size );
                        const az = scale( input.zAxis , store.va.z * size );
    
                        //update a from vector a
                        const a = add( input , add( ax , add( ay , az ) ) );
                        store.a.x = a.x;
                        store.a.y = a.y;
                        store.a.z = a.z;
                        if( snapRadius > 0 ) polymesh.snapVertex( store.a, store );
                        mesh.upFetchUndo( 2 );
                        mesh.updateVertex( store.a );
                        mesh.mergeLastUndos();
                        
                        //vector b * scale -> cast input space + controller xyz
                        const bx = scale( input.xAxis , store.vb.x * size );
                        const by = scale( input.yAxis , store.vb.y * size );
                        const bz = scale( input.zAxis , store.vb.z * size );
    
                        //update b from vector b
                        const b = add( input , add( bx , add( by , bz ) ) );
                        store.b.x = b.x;
                        store.b.y = b.y;
                        store.b.z = b.z;
                        if( snapRadius > 0 ) polymesh.snapVertex( store.b, store );
                        mesh.upFetchUndo( 2 );
                        mesh.updateVertex( store.b );
                        mesh.mergeLastUndos();
    
                        return true; //continue capturing input
                    }
                    else if( mode === 'create-quad' ) {
                        //compute radius, compute abcd, update abcd
                        const d = sub( input , store.origin );
                        const li = len( d );
                        const rv = scale( d , 1/li );
                        const tv = input.xAxis;
    
                        set( store.a ,
                            add( store.origin , add(
                                scale( rv , li ),
                                scale( tv , 0 )
                            ) ) 
                        );
                        if( snapRadius > 0 ) polymesh.snapVertex( store.a, store );
                        mesh.upFetchUndo( 4 );
                        mesh.updateVertex( store.a );
                        mesh.mergeLastUndos();
    
                        set( store.b ,
                            add( store.origin , add(
                                scale( rv , 0 ),
                                scale( tv , li )
                            ) ) 
                        );
                        if( snapRadius > 0 ) polymesh.snapVertex( store.b, store );
                        mesh.upFetchUndo( 4 );
                        mesh.updateVertex( store.b );
                        mesh.mergeLastUndos();
    
                        set( store.c ,
                            add( store.origin , add(
                                scale( rv , -li ),
                                scale( tv , 0 )
                            ) ) 
                        );
                        if( snapRadius > 0 ) polymesh.snapVertex( store.c, store );
                        mesh.upFetchUndo( 4 );
                        mesh.updateVertex( store.c );
                        mesh.mergeLastUndos();
    
                        set( store.d ,
                            add( store.origin , add(
                                scale( rv , 0 ),
                                scale( tv , -li )
                            ) ) 
                        );
                        if( snapRadius > 0 ) polymesh.snapVertex( store.d, store );
                        mesh.upFetchUndo( 4 );
                        mesh.updateVertex( store.d );
                        mesh.mergeLastUndos();
                        
                        return true; //continue capturing input
                    }
                    else if( mode === 'create-triangle' ) {
                        //compute radius, compute abcd, update abcd
                        const d = sub( input , store.origin );
                        const li = len( d );
                        const rv = scale( d , 1 / li );
                        const tv = input.xAxis;
    
                        set( store.a ,
                            add( store.origin , add(
                                scale( rv , -li*0.86 ),
                                scale( tv , 0 )
                            ) ) 
                        );
                        if( snapRadius > 0 ) polymesh.snapVertex( store.a, store );
                        mesh.upFetchUndo( 3 );
                        mesh.updateVertex( store.a );
                        mesh.mergeLastUndos();
    
                        set( store.b,
                            add( store.origin , add(
                                scale( rv , li*0.5 ),
                                scale( tv , -li*0.5 )
                            ) ) 
                        );
                        if( snapRadius > 0 ) polymesh.snapVertex( store.b, store );
                        mesh.upFetchUndo( 3 );
                        mesh.updateVertex( store.b );
                        mesh.mergeLastUndos();
    
                        set( store.c ,
                            add( store.origin , add(
                                scale( rv , li*0.5 ),
                                scale( tv , li*0.5 )
                            ) ) 
                        );
                        if( snapRadius > 0 ) polymesh.snapVertex( store.c, store );
                        mesh.upFetchUndo( 3 );
                        mesh.updateVertex( store.c );
                        mesh.mergeLastUndos();
    
                        return true; //continue capturing input
                    }
                },
                end: () => {

                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    const mode = polymesh.mode;
                    const store = polymesh.store[ mode ];
    
                    let snappedVertices = 0;
    
                    if( mode === 'move-vertex' ) {
                        if( store.vertex.snap ) {
                            mesh.replaceVertex( store.vertex, store.vertex.snap );
                            snappedVertices++;
                        }
    
                        store.vertex = null;
    
                        mesh.requestTrianglesUpdate();
                    }
    
                    else if( mode === 'add-vertex' ) {
    
                        //do not snap individual new vertices
    
                        store.vertex = null;
    
                        mesh.requestTrianglesUpdate();
    
                    }
    
                    else if( mode === 'add-face-from-vertex') {
                        //hide both edges only for add-face-from-vertex
                        polymesh.edges[ 0 ].mesh.visible = false;
                        polymesh.edges[ 1 ].mesh.visible = false;
    
                        if( store.a.snap ) {
                            mesh.replaceVertex( store.a, store.a.snap );
                            snappedVertices++;
                        }
                        if( store.b.snap ) {
                            mesh.replaceVertex( store.b, store.b.snap );
                            snappedVertices++;
                        }
    
                        store.a = null;
                        store.b = null;
    
                        mesh.requestTrianglesUpdate();
                    }
    
                    else if( mode === 'add-triangle-from-edge') {
                        if( store.vertex.snap ) {
                            mesh.replaceVertex( store.vertex, store.vertex.snap );
                            snappedVertices++;
                        }
    
                        store.vertex = null;
                        store.a = null;
                        store.b = null;
    
                        mesh.requestTrianglesUpdate();
                    }
    
                    else if( mode === 'add-quad-from-edge' ) {
                        if( store.a.snap ) {
                            mesh.replaceVertex( store.a, store.a.snap );
                            snappedVertices++;
                        }
                        if( store.b.snap ) {
                            mesh.replaceVertex( store.b, store.b.snap );
                            snappedVertices++;
                        }
    
                        store.a = null;
                        store.b = null;
                        store.va = null;
                        store.vb = null;
                        store.c = null;
                        store.d = null;
    
                        mesh.requestTrianglesUpdate();
                    }
    
                    else if( mode === 'create-quad' ) {
                        store.origin = null;
    
                        if( store.a.snap ) {
                            mesh.replaceVertex( store.a, store.a.snap );
                            snappedVertices++;
                        }
                        if( store.b.snap ) {
                            mesh.replaceVertex( store.b, store.b.snap );
                            snappedVertices++;
                        }
                        if( store.c.snap ) {
                            mesh.replaceVertex( store.c, store.c.snap );
                            snappedVertices++;
                        }
                        if( store.d.snap ) {
                            mesh.replaceVertex( store.d, store.d.snap );
                            snappedVertices++;
                        }
    
                        store.a = null;
                        store.b = null;
                        store.c = null;
                        store.d = null;
    
                        mesh.requestTrianglesUpdate();
                    }
    
                    else if( mode === 'create-triangle' ) {
                        store.origin = null;
    
                        if( store.a.snap ) {
                            mesh.replaceVertex( store.a, store.a.snap );
                            snappedVertices++;
                        }
                        if( store.b.snap ) {
                            mesh.replaceVertex( store.b, store.b.snap );
                            snappedVertices++;
                        }
                        if( store.c.snap ) {
                            mesh.replaceVertex( store.c, store.c.snap );
                            snappedVertices++;
                        }
    
                        store.a = null;
                        store.b = null;
                        store.c = null;
    
                        mesh.requestTrianglesUpdate();
                    }
    
                    const depth = polymesh.modeUndoDepths[ mode ];
    
                    polymesh.undoHistory.push( depth + snappedVertices );
    
                    edit.ui.addUndo( 'polymesh' );
    
                    polymesh.mode = null;
                },
    
                snapVertex: ( vertex, store ) => {
    
                    const polymesh = edit.tools.polymesh;
                    const mesh = edit.pipelines.mesh;
    
                    const layer = edit.ui.panels[ 'layers' ].getLayer();
                    const radius = polymesh.config.snapRadius;
    
                    const all = mesh.pick.vertices.all( vertex, layer, radius );
                    
                    const not = Object.values( store );
    
                    const from = [];
    
                    filter:
                    for( const vert of all ) {
                        for( const n of not )
                            if( n && ( n.i === vert.i || n.i === vertex.i ) )
                                continue filter;
                        from.push( vert );
                    }
                    
                    if( from.length === 0 ) return vertex.snap = false;
    
                    const closest = mesh.pick.vertices.closest( vertex, layer, radius, from );
    
                    if( ! closest ) return vertex.snap = false;
    
                    vertex.x = closest.x;
                    vertex.y = closest.y;
                    vertex.z = closest.z;
                    vertex.snap = closest;
                },
    
                //edge geometry:
                //2 line geometries, update start / end or hide / unhide
                //usage: polymesh.edges[ 0|1 ].updatePoint( 0|1 , xyz )
                //usage: polymesh.edges[ 0|1 ].mesh.visible = true|false
                //update color: polymesh.edges[ 0 ].mesh.material.color = new THREE.Color( rFloat, gFloat , bFloat )
                edges: [],
                setupEdges: () => {
                    const polymesh = edit.tools.polymesh;
    
                    for( let i=0; i<2; i++ ) {
                        const vertices = new Float32Array( 4 * 3 );
                        for( let j=0; j<vertices.length; j++ ) vertices[j] = Math.random();
                        const dys = new Float32Array( [
                            -1 , //top-left
                            -1 , //top-right
                            1 , //bottom-right
                            1 , //bottom-left
                        ] )
    
                        const geometry = new THREE.BufferGeometry();
                        geometry.setAttribute( 'position' , new THREE.Float32BufferAttribute( vertices , 3 ) );
                        geometry.setAttribute( 'dy' , new THREE.Float32BufferAttribute( dys , 1 ) );
                        geometry.setIndex( [ 0,1,2 , 2,3,0 ] );
    
                        const vertexShader = 
                            `#version 300 es
                            precision highp float;
                            precision highp int;
    
                            uniform mat4 projectionMatrix;
                            uniform mat4 modelViewMatrix;
                            uniform float edgeThickness;
    
                            in vec3 position;
                            in float dy;
                            
                            void main() {
                                highp vec4 realPosition = projectionMatrix *
                                    modelViewMatrix *
                                    vec4( position ,  1.0 );
    
                                realPosition.y += ( dy * edgeThickness );
    
                                gl_Position = realPosition;
                            }`; 
    
                        const fragmentShader = 
                            `#version 300 es
                            precision highp float;
                            precision highp int;
    
                            uniform vec3 edgeColor;
    
                            out vec4 finalColor;
    
                            void main() {
                                finalColor = vec4( edgeColor , 1.0 ); 
                            }`;
    
                        const { r , g , b } = polymesh.config.edgeColor;
                        const { edgeThickness } = polymesh.config;
    
                        const uniforms = { 
                            'edgeColor': { value: [ r , g , b ] } ,
                            'edgeThickness': { value: edgeThickness } ,
                        }
    
                        const material = new THREE.RawShaderMaterial( {
                            uniforms,
                            vertexShader,
                            fragmentShader,
                            side: THREE.DoubleSide,
                        } );
    
                        const mesh = new THREE.Mesh( geometry , material );
                        mesh.visible = false;
    
                        const updatePoint = ( I , xyz ) => {
                            //if I is 0
                            let i = 0; //top-left
                            let j = 9; //bottom-left
    
                            if( I === 1 ) {
                                i = 3; //top-right
                                j = 6; //bottom-right
                            }
    
                            const { x , y , z } = xyz;
    
                            const vertices = mesh.geometry.attributes.position.array;
    
                            //top vertex
                            vertices[ i + 0 ] = x;
                            vertices[ i + 1 ] = y;
                            vertices[ i + 2 ] = z;
    
                            //bottom vertex
                            vertices[ j + 0 ] = x;
                            vertices[ j + 1 ] = y;
                            vertices[ j + 2 ] = z;
    
                            mesh.geometry.attributes.position.needsUpdate = true;
                            mesh.needsUpdate = true;
                        }
    
                        edit.world.scene.add( mesh );
    
                        const edge = {
                            mesh,
                            updatePoint,
                        }
    
                        polymesh.edges.push( edge );
                    }
                },
    
                vertexInstancer: null,
                setupVertexInstancer: () => {
                    const polymesh = edit.tools.polymesh;
    
                    const geometry = new THREE.SphereGeometry( 1, 7 , 7 );
    
                    const vertexShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform mat4 modelViewMatrix;
                        uniform mat4 projectionMatrix;
                        uniform float vertexSize;
    
                        in vec3 position;
                        in mat4 instanceMatrix;
    
                        void main() {
                            gl_Position = projectionMatrix *
                                modelViewMatrix *
                                instanceMatrix *
                                vec4( position * vertexSize , 1.0 );
                        }
                    `;
    
                    const fragmentShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform vec3 rgb;
    
                        out vec4 finalColor;
                        
                        void main() {
                            finalColor = vec4( rgb , 1.0 );
                        }`;
    
                    const { r, g, b } = polymesh.config.vertexColor;
    
                    const uniforms = {
                        vertexSize: { value: polymesh.config.vertex * 1.1 },
                        rgb: { value: [ r, g, b ] },
                    };
    
                    const material = new THREE.RawShaderMaterial( { 
                        uniforms,
                        vertexShader,
                        fragmentShader,
                    } );
    
                    const vertexInstancer = new THREE.InstancedMesh( geometry , material , edit.pipelines.mesh.maxVertices );
                    vertexInstancer.count = 0;
    
                    polymesh.vertexInstancer = vertexInstancer;
    
                    edit.world.scene.add( vertexInstancer );
                },
                _m: new THREE.Matrix4(),
                updateVertexInstancer: points => {
                    const polymesh = edit.tools.polymesh;
                    const vertexInstancer = polymesh.vertexInstancer;
                    const _m = polymesh._m;
                    let i = 0;
                    for( const vertex of points ) {
                        _m.identity();
                        _m.elements[12] = vertex.x;
                        _m.elements[13] = vertex.y;
                        _m.elements[14] = vertex.z;
                        vertexInstancer.setMatrixAt( i , _m );
                        i ++;
                    }
                    vertexInstancer.count = i;
                    vertexInstancer.instanceMatrix.needsUpdate = true;
                    vertexInstancer.needsUpdate = true;
                }
            },
    
            polydelete: {
                key: null,
                isTrapping: key => key === edit.tools.polydelete.key,
                loseTrappedInput: () => {
                    const polydelete = edit.tools.polydelete;

                    polydelete.capturing = null;
                    polydelete.key = null;
                },
    
                newFrame: false,
                frameIndex: 0,
                render: () => edit.tools.polydelete.newFrame = true,
                setup: () => edit.tools.polydelete.buildIndicatorInstancer(),
                activate: () => {
                    const polydelete = edit.tools.polydelete;
                    const mesh = edit.pipelines.mesh;
    
                    polydelete.indicatorInstancer.visible = true;
    
                    mesh.showVertices();
                    mesh.useMaterial( 'wireframe' );
                },
                deactivate: () => {
                    const polydelete = edit.tools.polydelete;
    
                    polydelete.indicatorMesh.visible = false;
                    polydelete.indicatorInstancer.visible = false;
                },
    
                undoHistory: [],
                redoHistory: [],
                undo: () => {
                    const polydelete = edit.tools.polydelete;
                    const mesh = edit.pipelines.mesh;

                    if( polydelete.undoHistory.length === 0 ) return;

                    const depth = polydelete.undoHistory.pop();
                    
                    for( let i=0; i<depth; i++ ) mesh.undo();
                    
                    polydelete.redoHistory.push( depth );

                    return 'polydelete'; //allow redo
                },
                redo: () => {
                    const polydelete = edit.tools.polydelete;
                    const mesh = edit.pipelines.mesh;

                    if( polydelete.redoHistory.length === 0 ) return;

                    const depth = polydelete.redoHistory.pop();
                    
                    for( let i=0; i<depth; i++ ) mesh.redo();
                    
                    polydelete.undoHistory.push( depth );

                    return 'polydelete'; //allow re-undo
                },
                clearUndo: () => {
                    const polydelete = edit.tools.polydelete;
                    polydelete.undoHistory.length = 0;
                    polydelete.redoHistory.length = 0;
                },
                clearRedo: () => edit.tools.polydelete.redoHistory.length = 0,
    
                capturing: null,
                keys: [],
                handleInput: ( input , key ) => {
                    const polydelete = edit.tools.polydelete;

                    if( polydelete.key !== null && polydelete.key !== key )
                        return false; //input not consumed
                    
                    const zero = edit.threejs.controls.triggerThreshhold;
                    const pressure = input.trigger > zero;

                    //show orange x on closest point to each controller,
                    // until trigger, then latch on to current closest point
                    // if triggering, too far from latched point, get new latch point
                    // on release trigger, if latched point, delete
                    // while triggering, use red x on latched point only

                    const { sub, lenSq } = edit.math.vector;

                    if( polydelete.key === null ) {

                        if( polydelete.newFrame ) {
                            polydelete.updateIndicatorInstancer( null, [] );
                            polydelete.newFrame = false;
                            polydelete.frameIndex = 0;
                        }
    
                        const handle = polydelete.getSourceHandle( input );

                        if( handle && pressure > zero ) {
                            polydelete.key = key;
                        }
                        else if( handle && pressure <= zero ) {
                            const keyIndex = polydelete.frameIndex;
                            polydelete.updateInstancer( keyIndex, handle );
                            polydelete.frameIndex++;

                            return false;
                        }

                    }

                    if( polydelete.key !== null ) {
                        
                        if( polydelete.capturing === null ) {
                            const handle = polydelete.getSourceHandle( input );
                            if( handle ) {
                                const handles = edit.pipelines.mesh.pick.handles.crawlDependency( handle );
                                polydelete.capturing = { handle, handles };
                                polydelete.updateIndicatorInstancer( handle, handles );
                            }
                        }

                        if( polydelete.capturing !== null ) {
                            const d = lenSq( sub( polydelete.capturing.handle, input ) );

                            if( d > polydelete.config.radius**2 ) {
                                polydelete.capturing = null;
                                polydelete.updateIndicatorInstancer( null, [] );
                            }
                            else if( pressure <= zero ) {
                                polydelete.delete( polydelete.capturing.handles );
                                polydelete.capturing = null;
                                polydelete.key = null;
                                polydelete.updateIndicatorInstancer( null, [] );
                            }
                        }
                        else if( pressure <= zero ) {
                            polydelete.key = null;
                        }

                        return true;
                    }

                    return false; //input not consumed
                },

                delete: handles => {
                    const polydelete = edit.tools.polydelete;
                    const mesh = edit.pipelines.mesh;

                    let undoDepth = 0;

                    for( const handle of handles ) {
                        if( handle.is === 'vertex' ) mesh.removeVertex( handle );
                        if( handle.is === 'face' ) mesh.removeFace( handle );
                        if( handle.is === 'edge' ) continue;
                        undoDepth ++;
                    }

                    polydelete.undoHistory.push( undoDepth );
                    edit.ui.addUndo( 'polydelete' );
                },

                getSourceHandle: ( input ) => {
                    const polydelete = edit.tools.polydelete;

                    const layer = edit.ui.panels[ 'layers' ].getLayer();
                    const radius = polydelete.config.radius;
                    const handles = edit.pipelines.mesh.pick.handles.closest( input , layer , radius );
                    
                    const { vertex, edge, face } = handles;
                    //find closest handle
                    const handle = [ vertex, edge, face ].reduce( 
                        ( a, n ) => ( a && n ) ? ( ( a.d < n.d ) ? a : n ) : ( a || n )
                    )

                    return handle;

                },

                config: {

                    radius: 0.03,

                    indicatorPrimaryColor: { r:1.0, g:0.0, b: 0.0 },
                    indicatorSecondaryColor: { r:1.0, g:0.0, b:0.0 },

                },

                _m: new THREE.Matrix4(),
                updateIndicatorInstancer: ( primaryHandle, allHandles ) => {

                    const polydelete = edit.tools.polydelete;
                    const mesh = edit.pipelines.mesh;

                    const vertexSize = mesh.config.vertexSize * 1.2;

                    const indicator = polydelete.indicatorMesh;
                    if( primaryHandle ) {
                        indicator.visible = true;
                        indicator.position.set( primaryHandle.x, primaryHandle.y, primaryHandle.z );
                        indicator.material.uniforms.vertexSize.value = vertexSize;
                    }
                    else indicator.visible = false;

                    const instancer = polydelete.indicatorInstancer;
                    instancer.material.uniforms.vertexSize.value = vertexSize;

                    const _m = polydelete._m;
                    let count = 0;
                    for( const handle of allHandles ) {

                        if( handle.is === primaryHandle.is &&
                            handle.i === primaryHandle.i )
                            continue;

                        _m.identity();
                        _m.elements[12] = handle.x;
                        _m.elements[13] = handle.y;
                        _m.elements[14] = handle.z;
                        instancer.setMatrixAt( count , _m );
                        count++;
                    }
                    instancer.count = count;
                    instancer.instanceMatrix.needsUpdate = true;
                    instancer.needsUpdate = true;

                },
                updateInstancer: ( index, handle ) => {
                    const polydelete = edit.tools.polydelete;
                    const mesh = edit.pipelines.mesh;

                    const vertexSize = mesh.config.vertexSize * 1.2;
                    const instancer = polydelete.indicatorInstancer;
                    instancer.material.uniforms.vertexSize.value = vertexSize;

                    const _m = polydelete._m;
                    _m.identity();
                    _m.elements[12] = handle.x;
                    _m.elements[13] = handle.y;
                    _m.elements[14] = handle.z;
                    instancer.setMatrixAt( index , _m );

                    if( index >= instancer.count ) instancer.count = index + 1;
                    instancer.instanceMatrix.needsUpdate = true;
                    instancer.needsUpdate = true;
                },

                indicatorMesh: null,
                indicatorInstancer: null,
                buildIndicatorInstancer: () => {
                    const polydelete = edit.tools.polydelete;

                    const mesh = edit.pipelines.mesh;
                    const vertexSize = mesh.config.vertexSize * 1.2;

                    const geometry = new THREE.SphereGeometry( 1, 7, 7 );

                    const vertexShader = instance =>
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform mat4 modelViewMatrix;
                        uniform mat4 projectionMatrix;
                        uniform float vertexSize;
    
                        in vec3 position;
                        ${instance ? 'in mat4 instanceMatrix;' : ''}
    
                        void main() {
                            gl_Position = projectionMatrix *
                                modelViewMatrix *
                                ${instance ? 'instanceMatrix *' : ''}
                                vec4( position * vertexSize , 1.0 );
                        }
                    `;
    
                    const fragmentShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform vec3 rgb;
    
                        out vec4 finalColor;
                        
                        void main() {
                            finalColor = vec4( rgb , 1.0 );
                        }`;
    
                    //indicator mesh is primary color
                    {
                        const { r,g,b } = polydelete.config.indicatorPrimaryColor;

                        const uniforms = {
                            'vertexSize': { value: vertexSize },
                            'rgb':{ value: [ r,g,b ] },
                        }

                        const material = new THREE.RawShaderMaterial( { 
                            uniforms,
                            vertexShader: vertexShader( false ),
                            fragmentShader
                        } );

                        polydelete.indicatorMesh = new THREE.Mesh( geometry, material );
                        polydelete.indicatorMesh.visible = false;

                        edit.world.scene.add( polydelete.indicatorMesh );
                    }

                    //indicator instances are secondary color
                    {
                        const { r,g,b } = polydelete.config.indicatorSecondaryColor;

                        const uniforms = {
                            'vertexSize': { value: vertexSize },
                            'rgb':{ value: [ r,g,b ] },
                        }

                        const material = new THREE.RawShaderMaterial( { 
                            uniforms,
                            vertexShader: vertexShader( true ),
                            fragmentShader
                        } );

                        polydelete.indicatorInstancer = new THREE.InstancedMesh( geometry, material, mesh.maxVertices + mesh.maxFaces*4 );
                        edit.world.scene.add( polydelete.indicatorInstancer );
                    }
                },
            },
    
            polypaint: {
                key: null,
                isTrapping: key => key === edit.tools.polypaint.key,
                loseTrappedInput: () => {
                    const polypaint = edit.tools.polypaint;
    
                    if( polypaint.outputIsLive ) {
                        
                        const painted = edit.pipelines.mesh.cachePaintUndo();
                        
                        if( painted === true ) {
    
                            polypaint.undoHistory.push( 1 );
    
                            edit.ui.addUndo( 'polypaint' );
    
                        }
    
                    }
    
                    polypaint.outputIsLive = false;
    
                    if( polypaint.key === null ) return;
    
                    polypaint.key = null;
                },
                newFrame: false,
                render: () => {
                    edit.tools.polypaint.newFrame = true;
                },
                setup: () => {
                    const polypaint = edit.tools.polypaint;
    
                    //load brushes
                    for( const url in polypaint.brushHeads ) {
    
                        const img = new Image();
                        img.onload = () => img.loaded = true;
                        img.src = 'brushes/' + url;
    
                        polypaint.brushHeads[ url ] = img;
    
                    }
    
                    //default brush
                    polypaint.brush.headImage = polypaint.brushHeads[ polypaint.config.defaultBrush ];
    
                    polypaint.setupBrushMeshes();
                },
                activate: () => {
                    edit.pipelines.mesh.hideVertices();
                    edit.pipelines.mesh.useMaterial( 'texture' );
    
                    const polypaint = edit.tools.polypaint;
                    for( const hand in polypaint.brushMeshes )
                        polypaint.brushMeshes[ hand ].visible = true;
                },
                deactivate: () => {
                    const polypaint = edit.tools.polypaint;
                    for( const hand in polypaint.brushMeshes )
                        polypaint.brushMeshes[ hand ].visible = false;
                },
    
                handleInput: ( input , key ) => {
                    const polypaint = edit.tools.polypaint;
    
                    //if we can't handle input on a brush at all, we should hide its mesh guide
                    if( polypaint.newFrame ) {
    
                        Object.values( polypaint.brushMeshes ).forEach( mesh => mesh.visible = false );
                        polypaint.newFrame = false;
    
                    }
    
                    if( ! polypaint.key || polypaint.key === key ) polypaint.brushMeshes[ key ].visible = true;
    
                    if( polypaint.key !== null && polypaint.key !== key )
                        return false; //input not consumed
    
                    if( ! polypaint.brush.headImage.loaded ) return;
    
                    const zero = edit.threejs.controls.triggerThreshhold;
                    const pressure = input.trigger;
                    const squeeze = input.grip;
    
                    edit.tools.polypaint.updateBrushMesh( input );
    
                    //start
                    if( pressure > zero && polypaint.outputIsLive === false ) {
                        polypaint.key = key;
                        polypaint.start( input );
                        return true;
                    }
                    //move
                    else if( pressure > zero && polypaint.outputIsLive === true ) {
                        polypaint.key = key;
                        polypaint.update( input );
                        return true;
                    }
                    //end
                    else if( pressure <= zero && polypaint.outputIsLive === true ) {
                        polypaint.end();
                        polypaint.key = null;
                        return true; 
                        //do we really need to consume this input?
                        //does that make us catch another zero-input next frame?
                        //...no, we always test trapping before trying to handle input
                    }
                    //color pick
                    else if( squeeze > zero ) {
                        polypaint.colorPick( input );
                        return true;
                    }
    
                    return false; //input not consumed
                },
    
                undoHistory: [],
                redoHistory: [],
                undo: () => {
                    const polypaint = edit.tools.polypaint;
                    if( polypaint.undoHistory.length === 0 ) return;
                    polypaint.undoHistory.pop();
                    polypaint.redoHistory.push( 1 );
                    edit.pipelines.mesh.undo();
                    return 'polypaint';
                },
                redo: () => {
                    const polypaint = edit.tools.polypaint;
                    if( polypaint.redoHistory.length === 0 ) return;
                    polypaint.redoHistory.pop();
                    polypaint.undoHistory.push( 1 );
                    edit.pipelines.mesh.redo();
                    return 'polypaint';
                },
                clearUndo: () => {
                    const polypaint = edit.tools.polypaint;
                    polypaint.undoHistory.length = 0;
                    polypaint.redoHistory.length = 0;
                },
                clearRedo: () => edit.tools.polypaint.redoHistory.length = 0,
                
                outputIsLive: false,
                start: input => {
                    edit.pipelines.mesh.startPaintUndo();
    
                    const polypaint = edit.tools.polypaint;
    
                    const brush = polypaint.brush;
    
                    const { width, height } = polypaint.config;
    
                    let fw = width * 2;
                    let fh = height * 2;
                    const hw = parseInt( fw * settings.resolutionPixelsPerUnitDistance );
                    const hh = parseInt( fh * settings.resolutionPixelsPerUnitDistance );
    
                    brush.update( hw, hh );
    
                    fw = brush.hfw;
                    fh = brush.hfh;
                    const headData = brush.headData;
                    const blendData = brush.blendData;
    
                    polypaint.outputIsLive = true;
                    polypaint.paintCuboid( input, { headData, blendData, fw, fh, hw, hh } );
    
                    for( const hand in polypaint.brushMeshes )
                        polypaint.brushMeshes[ hand ].visible = false;
    
                    polypaint.brushMeshes[ input.hand ].visible = true;
                },
                update: input => {
                    const polypaint = edit.tools.polypaint;
    
                    const brush = polypaint.brush;
    
                    const fw = brush.hfw;
                    const fh = brush.hfh;
                    const hw = brush.source.width;
                    const hh = brush.source.height;
    
                    const headData = brush.headData;
                    const blendData = brush.blendData;
    
                    polypaint.paintCuboid( input, { headData, blendData, fw, fh, hw, hh }  );
                },
                end: () => {
                    const polypaint = edit.tools.polypaint;
                    polypaint.outputIsLive = false;
    
                    for( const hand in polypaint.brushMeshes )
                        polypaint.brushMeshes[ hand ].visible = true;
    
                    const painted = edit.pipelines.mesh.cachePaintUndo();
                    
                    if( painted === true ) {
    
                        polypaint.undoHistory.push( 1 );
    
                        edit.ui.addUndo( 'polypaint' );
    
                    }
                },
    
                config: {
                    //I question the sphere brush...
                    //  it was supposed to be faster,
                    //  but otherwise inferior in every way
                    radius: 0.01, //sphere brush
                    hitDepth: 0.01, //sphere brush
    
                    //cuboid brush
                    width: 0.02,
                    //height: 0.02,
                    height: 0.02,
                    thickness: 0.02,
    
                    opacity: 0.08,
                    blend: 0.0, //blend
                    smear: 0.0, //smear
    
                    defaultBrush: 'brushTip-RoughSquare-128.png',
                },
    
                brushHeads: {
                    'brushTip-RoughSquare-128.png': null,
                },
                brush: {
                    headImage: null,
                    source: document.createElement( 'canvas' ),
                    headData: null, //U8[] brush head data
                    blendData: null, //U8[] blend data
                    hfw:0, hfh:0, //size of data in brush coordinates
                    update: ( w, h, headImage ) => {
                        const polypaint = edit.tools.polypaint;
                        const brush = polypaint.brush;
    
                        let update = false;
    
                        if( headImage && brush.headImage !== headImage ) {
    
                            brush.headImage = headImage;
                            update = true;
    
                        }
    
                        const cnv = brush.source;
    
                        if( w || h ) {
    
                            w = parseInt( w );
                            h = parseInt( h );
    
                            if( ( w !== cnv.width ) || ( h !== cnv.height ) ) update = true;
    
                            if( ! w ) w = cnv.width;
                            if( ! h ) h = cnv.height;
    
                            if( update === true ) brush.blendData = new Uint8ClampedArray( w * h * 4 );
    
                            const { width, height } = polypaint.config;
    
                            brush.hfw = width * 2;
                            brush.hfh = height * 2;
    
                        }
    
                        if( update === true ) {
    
                            cnv.width = w;
                            cnv.height = h;
    
                            const ctx = brush.source.getContext( '2d' );
                            ctx.drawImage( brush.headImage, 0, 0, w, h );
    
                            brush.headData = ctx.getImageData( 0, 0, w, h ).data;
                            brush.blendData.fill( 0 );
    
                        } else {
    
                            brush.blendData.fill( 0 );
    
                        }
    
                    },
                },
    
                paintCuboid: ( input, brushData ) => {
                    const polypaint = edit.tools.polypaint;
                    const mesh = edit.pipelines.mesh;
    
                    const { r , g , b } = edit.ui.panels[ "color" ].getRGB();
                    const { width , height , thickness , opacity, blend, smear } = polypaint.config;
                    const strength = input.trigger;
    
                    const { 
                        headData, //Uint8ClampedArray brush head image data
                        blendData, //Uint8ClampedArray brush blend data (cleared on start)
                        fw, fh, //size of brush head data in brush coordinates
                        hw, hh //size of brush head data in pixels
                    } = brushData;
    
                    const brush = {
                        r , g , b ,
                        opacity: opacity * strength ,
                        blend, 
                        smear,
    
                        xAxis: input.xAxis, xEdge: width,
                        yAxis: input.yAxis, yEdge: height,
                        zAxis: input.zAxis, zEdge: thickness,
    
                        data: { headData, blendData, fw, fh, hw, hh },
                    }
    
                    const layer = edit.ui.panels[ "layers" ].getLayer();
                    const radius = Math.max( width , height , thickness );
    
                    const faces = mesh.pick.faces.all( input , layer , radius );
                    for( const face of faces ) {
                        edit.pipelines.mesh.paint[ 'hard-cuboid' ]( 
                            input , face , brush
                        );
                    }
                },
                paintSphere: input => {
                    const face = edit.pipelines.mesh.faces[ 0 ];
                    const brush = {
                        r: 1.0,
                        g: 0.5, 
                        b: 0.1,
                        opacity: 0.08,
                        radius: 0.03,
                    }
                    edit.pipelines.mesh.paint[ 'soft-sphere' ]( input , face , brush );
                },
                colorPick: input => {
                    const polypaint = edit.tools.polypaint;
                    const mesh = edit.pipelines.mesh;
                    const layer = edit.ui.panels[ "layers" ].getLayer();
                    const radius = polypaint.config.radius;
                    const color = mesh.pick.color.closest( input , layer , radius );
                    if( color === null ) return;
                    const { r,g,b } = color;
                    edit.ui.panels[ 'color' ].setRGB( r,g,b );
                },
    
                brushMeshes: {},
                setupBrushMeshes: () => {
                    const polypaint = edit.tools.polypaint;
                    for( const hand of [ 'left' , 'right' ] ) {
                        polypaint.brushMeshes[ hand ] = polypaint.buildBrushMesh();
                    }
                },
    
                buildBrushMesh: () => {
                    const geometry = new THREE.BoxGeometry( 1, 1, 1 );
                    const uv = geometry.attributes[ 'uv' ].array;
                    for( let plane=0; plane<6; plane++ ) {
                        let i = plane * 4 * 2;
                        uv[ i + 0 + 0 ] = 1; uv[ i + 0 + 1 ] = 1; //top-left
                        uv[ i + 2 + 0 ] = 0; uv[ i + 2 + 1 ] = 1; //top-right
                        uv[ i + 4 + 0 ] = 1; uv[ i + 4 + 1 ] = 0; //bottom-left
                        uv[ i + 6 + 0 ] = 1; uv[ i + 6 + 1 ] = 1; //bottom-right
                    }
    
                    const vertexShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform mat4 projectionMatrix;
                        uniform mat4 modelViewMatrix;
    
                        in vec3 position;
                        in vec2 uv;
                        
                        out highp vec2 vUV;
    
                        void main() {
                            vUV = uv;
                            gl_Position = projectionMatrix *
                                modelViewMatrix *
                                vec4( position , 1.0 );
                        }`;
                    const fragmentShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform float wireThickness;
                        uniform vec3 wireColor;
    
                        in highp vec2 vUV;
    
                        out vec4 finalColor;
    
                        void main() {
                            highp float wireThreshhold = 1.0 - wireThickness;
    
                            highp float wireWeight = max(
                                step( wireThreshhold , vUV.x ),
                                step( wireThreshhold , vUV.y )
                            );
    
                            if( wireWeight < 0.5 ) discard;
    
                            finalColor = vec4( wireColor * wireWeight , 1.0 ); 
                        }`;
    
                    const uniforms = {
                        'wireThickness': { value: 0.01 },
                        'wireColor': { value: [1.0,1.0,1.0 ] },
                    }
    
                    const material = new THREE.RawShaderMaterial( {
                        uniforms,
                        vertexShader,
                        fragmentShader,
                        side:THREE.DoubleSide,
                    } );
                    
                    const mesh = new THREE.Mesh( geometry , material );
                    mesh.visible = false;
    
                    edit.world.scene.add( mesh );
    
                    return mesh;
                },
                updateBrushMesh: input => {
                    const polypaint = edit.tools.polypaint;
                    const { width,height,thickness } = polypaint.config;
    
                    const mesh = polypaint.brushMeshes[ input.hand ];
    
                    mesh.position.set( input.x , input.y , input.z );
                    mesh.scale.set( width*2 , height*2 , thickness*2 );
                    const q = input.controller.quaternion;
                    mesh.quaternion.set( q.x , q.y , q.z , q.w );
                },
            },
        },
        pipelines: {
            brush: {

                reset: () => {

                    edit.pipelines.brush.pointsCount = 0;
                    edit.pipelines.brush.points8.fill( 0 );
                    edit.pipelines.brush.pointsToWrite = true;

                },
                
                setup: () => {
                    edit.pipelines.brush.buildMemories();
                    edit.pipelines.brush.buildInstancer();
                },
    
    
                serializeSave: async () => {
                    const brush = edit.pipelines.brush;
    
                    const src8 = brush.points8;
                    //const srcI32 = brush.pointsI32;
                    const srcF32 = brush.pointsF32;
                    const pointsLen = brush.pointsCount;
                    const stride32 = brush.f32ElementsPerPoint;
    
                    const buffer = new ArrayBuffer( pointsLen * 4 * stride32 );
                    const view = new DataView( buffer );
    
                    const srcStruct = brush.pointStructure;
                    if( Object.keys( srcStruct.i32 ).length )
                        console.warn( "Warning! i32 save/load is disabled!" );
    
                    for( let i=0; i<pointsLen; i++ ) {
    
                        const j32 = i * stride32;
                        const j8 = j32 * 4;
    
                        //for( const key in srcStruct.i32 ) {
                        //    const src32i = srcStruct.i32[ key ];
                        //    const d = srcI32[ j32 + src32i ];
                        //    view.setInt32( j8 + ( src32i * 4 ), d );
                        //}
    
                        for( const key in srcStruct.f32 ) {
                            const src32i = srcStruct.f32[ key ];
                            const d = srcF32[ j32 + src32i ];
                            view.setFloat32( j8 + ( src32i * 4 ), d, true );
                        }
    
                        for( const key in srcStruct.u8 ) {
                            const src8i = srcStruct.u8[ key ]
                            const d = src8[ j8 + src8i ]
                            view.setUint8( j8 + src8i, d, true );
                        }
    
                    }
    
                    const array = new Uint8ClampedArray( buffer );
    
                    const json = JSON.stringify( {
                        pointByteStride: brush.f32ElementsPerPoint * 4,
                        pointStructure: brush.pointStructure,
                    } );
    
                    const arrayBlob = new Blob( [ array ], { type:'application/octet-stream' } );

                    const fileReader = new FileReader();

                    let dataURL = '';

                    await new Promise( load => {

                        fileReader.addEventListener( 'load', () => load() );
                        fileReader.readAsDataURL( arrayBlob );

                    } );

                    dataURL = fileReader.result;

                    const buffers = { data: dataURL };

                    return { json, buffers };

                },
                load: async ( jsonPart ) => {
    
                    const brush = edit.pipelines.brush;
    
                    let json, buffer;
    
                        const { json: jsonSrc, buffers } = jsonPart;
                        const dataURL = buffers.data;
                        
                        json = JSON.parse( jsonSrc );
                        if( dataURL !== '' && dataURL !== 'data:')
                            buffer = await ( await fetch( dataURL ) ).arrayBuffer()
    
                    const srcStride8 = json.pointByteStride || brush.f32ElementsPerPoint * 4;
                    const srcStruct = json.pointStructure || brush.pointStructure;
    
                    const dstStride8 = brush.f32ElementsPerPoint * 4;
                    const dstStride32 = brush.f32ElementsPerPoint;
                    const dstStruct = brush.pointStructure;
    
                    if( ! buffer || buffer.byteLength === 0 ) {
                        
                        //no save data to load here, still a success (I guess)
                        return true;
    
                    }
    
                    const srcView = new DataView( buffer );
                    //const dstI32 = brush.pointsI32;
                    if( Object.keys( dstStruct.i32 ).length )
                        console.warn( "Warning! i32 save/load is disabled!" );
    
                    //const dstView = new DataView( brush.pointsMem );
                    const dst32 = brush.pointsF32;
                    const dst8 = brush.points8;
                    const pointsLen = buffer.byteLength / srcStride8;
    
                    let versionMismatch = false;
                    //Note: Never use interleaved data structures again.

                    for( let i=0; i<pointsLen; i++ ) {
    
                        const srcJ = i * srcStride8;
                        const dstJ8 = i * dstStride8;
                        const dstJ32 = i * dstStride32;
    
                        //for( const key in map.i32 ) {
                        //    const srcI = srcMap.i32 ? srcMap.i32[ key ] : undefined;
                        //    const d = srcI === undefined ? 0 : srcView.getInt32( srcJ + ( srcI * 4 ) );
                        //    dst32[ dstJ32 + ( map.i32[ key ] * 4  ) ] = d;
                        //}
    
                        for( const key in dstStruct.f32 ) {
                            const srcI = srcStruct.f32 ? srcStruct.f32[ key ] : undefined;
                            if( srcI === undefined ) versionMismatch = true;
                            const d = (srcI === undefined) ? 0 : srcView.getFloat32( srcJ + ( srcI * 4 ), true );
                            //const dst32i = dstStruct.f32[ key ];
                            //dstView.setFloat32( dstJ8 + ( dst32i * 4 ), d );
                            dst32[ dstJ32 + dstStruct.f32[ key ] ] = d;
                        }
    
                        for( const key in dstStruct.u8 ) {
                            const srcI = srcStruct.u8 ? srcStruct.u8[ key ] : undefined;
                            if( srcI === undefined ) versionMismatch = true;
                            const d = (srcI === undefined) ? 0 : srcView.getUint8( srcJ + srcI, true );
                            //const dst8i = dstStruct.u8[ key ];
                            //dstView.setUint8( dstJ8 + ( dst8i * 4 ), d );
                            dst8[ dstJ8 + dstStruct.u8[ key ] ] = d;
                        }
    
                    }
    
                    if( versionMismatch === true )
                        console.warn( `Warning! File loaded data structure does not match this version of pipeline.brush. Brush data may render incorrectly!` );
    
                    brush.pointsCount = pointsLen;
    
                    brush.pointsToWrite = true;
    
                    return true;
                },
    
                render: () => {
                    if( edit.pipelines.brush.pointsToWrite === true )
                        edit.pipelines.brush.uploadPointsToGPU();
                },
                instancerMesh: null,
                instancerBufferF32: null,
                pointsToWrite: false,
                uploadPointsToGPU: () => {
                    const buffer  = edit.pipelines.brush.instancerBufferF32;
                    const buffer8 = edit.pipelines.brush.instancerBuffer8;
                    buffer.updateRange.offset = 0;
                    buffer.updateRange.count = edit.pipelines.brush.pointsCount * edit.pipelines.brush.f32ElementsPerPoint;
                    buffer.needsUpdate = true;
                    buffer8.updateRange.offset = 0;
                    buffer8.updateRange.count = edit.pipelines.brush.pointsCount * edit.pipelines.brush.f32ElementsPerPoint * 4;
                    buffer8.needsUpdate = true;
                    const mesh = edit.pipelines.brush.instancerMesh;
                    mesh.count = edit.pipelines.brush.pointsCount;
                    edit.pipelines.brush.pointsToWrite = false;
                },
                buildInstancer: () => {
                    //full round geometry
                    const vertexOffsetsArray = new Float32Array( 16 * 3 * 2 );
                    {
                        const delta = 0.39269908169872414;
                        for( let a=0; a<16; a++ ) {
                            const i = a * 6;
                            const angle0cos = Math.cos( a*delta ) / 2;
                            const angle0sin = Math.sin( a*delta ) / 2;
                            const angle1cos = Math.cos( (a+1)*delta ) / 2;
                            const angle1sin = Math.sin( (a+1)*delta ) / 2;
    
                            vertexOffsetsArray[ i + 0 ] = 0;
                            vertexOffsetsArray[ i + 1 ] = 0;
    
                            vertexOffsetsArray[ i + 2 ] = angle1cos;
                            vertexOffsetsArray[ i + 3 ] = angle1sin;
    
                            vertexOffsetsArray[ i + 4 ] = angle0cos;
                            vertexOffsetsArray[ i + 5 ] = angle0sin;
                        }
                    }
                    //no indices = render triangles
                    const positions = new THREE.Float32BufferAttribute( vertexOffsetsArray , 2 , false );
    
                    //hexagon geometry
                    const hexagonVertexOffsetsArray = new Float32Array( 16 * 3 * 2 );
                    {
                        hexagonVertexOffsetsArray.fill( 0 );
                        const delta = 1.0471975511965976;
                        for( let a=0; a<6; a++ ) {
                            const i = a * 6;
                            const angle0cos = Math.cos( a*delta ) / 2;
                            const angle0sin = Math.sin( a*delta ) / 2;
                            const angle1cos = Math.cos( (a+1)*delta ) / 2;
                            const angle1sin = Math.sin( (a+1)*delta ) / 2;
    
                            hexagonVertexOffsetsArray[ i + 0 ] = 0;
                            hexagonVertexOffsetsArray[ i + 1 ] = 0;
    
                            hexagonVertexOffsetsArray[ i + 2 ] = angle1cos;
                            hexagonVertexOffsetsArray[ i + 3 ] = angle1sin;
    
                            hexagonVertexOffsetsArray[ i + 4 ] = angle0cos;
                            hexagonVertexOffsetsArray[ i + 5 ] = angle0sin;
                        }
                    }
                    //no indices = render triangles
                    const hexagonPositions = new THREE.Float32BufferAttribute( hexagonVertexOffsetsArray , 2 , false );
    
                    //8 elements per point
                    const interleavedBufferF32 = 
                        new THREE.InstancedInterleavedBuffer( 
                            edit.pipelines.brush.pointsF32 , 
                            edit.pipelines.brush.f32ElementsPerPoint , 
                            1 
                        );
                    const interleavedBuffer8 = 
                        new THREE.InstancedInterleavedBuffer( 
                            edit.pipelines.brush.points8 , 
                            4 * edit.pipelines.brush.f32ElementsPerPoint , 
                            1 
                        );
    
                    const aXYZS = new THREE.InterleavedBufferAttribute( interleavedBufferF32 , 4 , 0 , false );
                    const aRGB = new THREE.InterleavedBufferAttribute( interleavedBuffer8 , 4 , 16 , false );
                    const aChain = new THREE.InterleavedBufferAttribute( interleavedBufferF32 , 4 , 5 , false );
    
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute( 'position' , positions );
                    geometry.setAttribute( 'hexagonPosition' , hexagonPositions );
                    geometry.setAttribute( 'aXYZS' , aXYZS );
                    geometry.setAttribute( 'aRGBLayer' , aRGB );
                    geometry.setAttribute( 'aChain' , aChain );
    
                    //shaders
                    const vertexShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform mat4 modelViewMatrix;
                        uniform mat4 projectionMatrix;
    
                        in vec2 position;
                        in vec2 hexagonPosition;
                        in vec4 aXYZS;
                        in uvec4 aRGBLayer;
                        in vec4 aChain;
    
                        out vec3 fRGB;
    
                        void main() {
                            highp vec4 facePosition =
                                projectionMatrix *
                                modelViewMatrix *
                                vec4( aXYZS.xyz , 1.0 );
                            
                            highp vec4 chainPosition =
                                projectionMatrix *
                                modelViewMatrix *
                                vec4( aChain.xyz , 1.0 );
    
                            /* if our size is too small... but what is small?
                                1900x1900 pixels per eye
                                10x10 pixels is very small, or .005 size */
                            highp float depthedSize = aXYZS.w / facePosition.w;
                            highp vec2 LODPosition = mix( 
                                hexagonPosition , position , 
                                step( 0.005 , depthedSize )
                            );
    
                            highp vec2 faceXY = facePosition.xy / facePosition.w;
                            highp vec2 chainXY = chainPosition.xy / chainPosition.w;
    
                            /* restore w to avoid double-perspective-scaling this at interpolation */
                            highp vec2 dChain = ( chainXY - faceXY ) * facePosition.w;
    
                            /* project dChain on this vertex's vector */
                            highp float chainProjection = (LODPosition.x * dChain.x) + ( LODPosition.y * dChain.y );
    
                            /* we only project those vertices cast positively onto chain, excepting 0 */
                            highp float chainStep = step( 0.0000152587890625 , chainProjection );
                            chainStep = chainStep * step( 0.0000152587890625 , aChain.w );
    
                            highp float layer = float( aRGBLayer.a );
                            highp float layerScale = step( 1.5 , ( layer - 127.0 ) );
    
                            highp float selfSize = aXYZS.w;
    
                            /* scale any chain-stepping vertices to the size of the chain target */
                            highp float chainSize = aChain.w;
    
                            highp float size = mix( selfSize , chainSize , chainStep );
    
                            highp vec2 scaledPosition = LODPosition * size;
    
    
                            highp float r = float( aRGBLayer.r );
                            highp float g = float( aRGBLayer.g );
                            highp float b = float( aRGBLayer.b );
    
                            fRGB = vec3( r / 255.0 , g / 255.0 , b / 255.0 );
    
                            gl_Position = vec4( 
                                facePosition.xy + 
                                    scaledPosition
                                    + ( dChain * chainStep * 0.9 ), 
                                facePosition.zw 
                            ) * layerScale;
                        }
                    `;
                    const fragmentShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        in vec3 fRGB;
                        out vec4 finalColor;
                        
                        void main() {
                            finalColor = vec4( fRGB , 1.0 );
                        }
                    `;
                    
                    //build material
                    const material = new THREE.RawShaderMaterial( {
                        uniforms: {},
                        vertexShader, 
                        fragmentShader,
                        side: THREE.DoubleSide
                    } );
                    
                    //add mesh
                    const mesh = new THREE.InstancedMesh( geometry , material , edit.pipelines.brush.maxPoints );
                    mesh.count = 1;
    
                    edit.pipelines.brush.instancerBufferF32 = interleavedBufferF32;
                    edit.pipelines.brush.instancerBuffer8 = interleavedBuffer8;
                    edit.pipelines.brush.instancerMesh = mesh;
                    edit.world.scene.add( mesh );
                },
                pointsCount: 0,
                maxPoints: settings.max_points,
                f32ElementsPerPoint: 9,
                pointsMem: null,
                pointsF32: null,
                points8: null,
                pointStructure: {
                    i32: {},
                    f32: {
                        x: 0, y: 1, z: 2, size: 3,
                        lx: 5, ly: 6, lz: 7, lsize: 8,
                    },
                    u8: {
                        r: 16, g: 17, b: 18, layer: 19,   
                    },
                },
                
                buildMemories: () => {
                    const brush = edit.pipelines.brush;
                    
                    brush.pointsMem = new ArrayBuffer( 
                            brush.maxPoints * 
                            brush.f32ElementsPerPoint * 
                            4 
                        );
                    brush.pointsF32 = new Float32Array( brush.pointsMem );
                    brush.points8 = new Uint8Array( brush.pointsMem );
                },
    
                undoHistory: [],
                redoHistory: [],
                undo: () => {
                    const brush = edit.pipelines.brush;
    
                    if( brush.undoHistory.length === 0 ) return;
                    const u = brush.undoHistory.pop();
                    if( u.t === 'append-points' ) {
                        brush.pointsCount -= u.length;
                        brush.redoHistory.push( u );
                        brush.pointsToWrite = true;
                    }
                    if( u.t === 'update-points' ) {
                        brush._loadPoints( u.backup )
                        brush.redoHistory.push( u );
                        brush.pointsToWrite = true;
                    }
                },
                redo: () => {
                    const brush = edit.pipelines.brush;
                    if( brush.redoHistory.length === 0 ) return;
                    const r = brush.redoHistory.pop();
                    if( r.t === 'append-points' ) {
                        brush.pointsCount += r.length;
                        brush.undoHistory.push( r );
                        brush.pointsToWrite = true;
                    }
                    if( r.t === 'update-points' ) {
                        brush._loadPoints( r.points )
                        brush.undoHistory.push( r );
                        brush.pointsToWrite = true;
                    }
                },
                clearUndo: () => {
                    const brush = edit.pipelines.brush;
                    brush.undoHistory.length = 0;
                    brush.redoHistory.length = 0;
                },
                clearRedo: () => edit.pipelines.brush.redoHistory.length = 0,
                mergeLastUndos: () => {
                    const brush = edit.pipelines.brush;
                    if( brush.undoHistory.length < 2 ) return false;
    
                    const history = brush.undoHistory;
    
                    if( history[ history.length-1 ].t !==
                        history[ history.length-2 ].t )
                        return false;
                        
                    const second = history.pop();
                    const first = history.pop();
    
                    let newUndo = null;
    
                    if( first.t === 'append-points' ) {
                        newUndo = { 
                            t:'append-points' , 
                            pointsCount:
                                first.pointsCount +
                                second.pointsCount,
                        }
                    }
                    if( first.t === 'update-points' ) {
                        const points = {};
                        const backup = {};
                        for( const point of first.points )
                            points[ point.i ] = point;
                        for( let i=second.backup.length-1; i>=0; i-- ) {
                            const point = second.backup[ i ];
                            backup[ point.i ] = point;
                        }
                        for( const point of second.points )
                            points[ point.i ] = point;
                        for( let i=first.backup.length-1; i>=0; i-- ) {
                            const point = first.backup[ i ];
                            backup[ point.i ] = point;
                        }
                        newUndo = {
                            t: 'update-points',
                            points: Object.values( points ),
                            backup: Object.values( backup ),
                        }
                    }
    
                    history.push( newUndo );
    
                    return true;
                },
    
                appendPoints: points => {
                    const brush = edit.pipelines.brush;
                    const f32 = brush.pointsF32;
                    const i8 = brush.points8;
                    const stride = brush.f32ElementsPerPoint;
    
                    let i = brush.pointsCount * stride;
    
                    for( const point of points ) {
                        const j = i * 4;
                        f32[ i + 0 ] = point.x;
                        f32[ i + 1 ] = point.y;
                        f32[ i + 2 ] = point.z;
    
                        f32[ i + 3 ] = point.s;
    
                        i8[ j + 16 + 0 ] = point.r * 255;
                        i8[ j + 16 + 1 ] = point.g * 255;
                        i8[ j + 16 + 2 ] = point.b * 255;
    
                        i8[ j + 16 + 3 ] = point.layer + 127;
    
                        f32[ i + 5 ] = point.lastX;
                        f32[ i + 6 ] = point.lastY;
                        f32[ i + 7 ] = point.lastZ;
    
                        f32[ i + 8 ] = point.lastS;
                        
                        ++brush.pointsCount;
    
                        i += stride;
                    }
    
                    brush.undoHistory.push( { t: 'append-points' , length: points.length } );
    
                    brush.pointsToWrite = true;
    
                    edit.ui.clearRedo();
    
                    return i;
                },
                updatePoints: points => {
                    const brush = edit.pipelines.brush;
    
                    const backup = brush.pick.indices( points );
    
                    brush._loadPoints( points );
    
                    brush.undoHistory.push( { t: 'update-points' , points , backup } );
    
                    edit.ui.clearRedo();
                },
                _loadPoints: points => {
                    const brush = edit.pipelines.brush;
    
                    const f32 = brush.pointsF32;
                    const i8 = brush.points8;
    
                    for( const point of points ) {
                        const i = point.i;
                        const j = i * 4;
    
                        f32[ i + 0 ] = point.x;
                        f32[ i + 1 ] = point.y;
                        f32[ i + 2 ] = point.z;
    
                        f32[ i + 3 ] = point.s;
    
                        i8[ j + 16 + 0 ] = point.r * 255;
                        i8[ j + 16 + 1 ] = point.g * 255;
                        i8[ j + 16 + 2 ] = point.b * 255;
    
                        i8[ j + 16 + 3 ] = point.layer + 127;
    
                        f32[ i + 5 ] = point.lastX;
                        f32[ i + 6 ] = point.lastY;
                        f32[ i + 7 ] = point.lastZ;
    
                        f32[ i + 8 ] = point.lastS;
                    }
    
                    brush.pointsToWrite = true;
                },
    
                pick: {
                    indices: points => {
                        const brush = edit.pipelines.brush;
                        const f32 = brush.pointsF32;
                        const i8 = brush.points8;
                        
                        const picked = new Array( points.length );
    
                        let k = 0;
                        for( const point of points ) {
                            const i = point.i;
                            const j = i * 4;
                            picked[ k++ ] = {
                                i,
    
                                x: f32[i+0],
                                y: f32[i+1],
                                z: f32[i+2],
            
                                s: f32[i+3],
            
                                r: i8[j+16+0] / 255,
                                g: i8[j+16+1] / 255,
                                b: i8[j+16+2] / 255,
            
                                layer: i8[j+16+3] - 127,
            
                                lastX: f32[i+5],
                                lastY: f32[i+6],
                                lastZ: f32[i+7],
                                lastS: f32[i+8],
                            };
                        }
                        return picked;
                    },
                    all: ( xyz , r = 0 , visibleOrLayer = false ) => {
                        const brush = edit.pipelines.brush;
                        const { x:X , y:Y , z:Z } = xyz;
                        if( brush.pointsCount === 0 ) return [];
                        let points = [];
                        const f32 = brush.pointsF32;
                        const i8 = brush.points8;
                        const pointsCount = brush.pointsCount;
                        const step = brush.f32ElementsPerPoint;
                        const R = r;
                        const V = visibleOrLayer;
                        for( let c = 0; c < pointsCount; c++ ) {
                            const i = c * step;
                            const j = i*4;
                            const layer = i8[j+16+3] - 127;
        
                            if( ( V === true && layer < 2 ) || ( V === false && layer >= 2 ) ) continue;
                            else if( ( typeof V === 'number' ) && layer !== visibleOrLayer && layer !== ( -1 * visibleOrLayer ) ) continue;
    
                            const x = f32[i+0]; 
                            const y = f32[i+1]; 
                            const z = f32[i+2]; 
                            const dx = X-x;
                            const dy = Y-y; 
                            const dz = Z-z;
                            const d = dx*dx + dy*dy + dz*dz;
        
                            const s = f32[i+3];
                            if( d < ( ( s + R )**2 ) )
                                points.push( {
                                    i,
                                    d,
    
                                    x: f32[i+0],
                                    y: f32[i+1],
                                    z: f32[i+2],
                
                                    s: f32[i+3],
                
                                    r: i8[j+16+0] / 255,
                                    g: i8[j+16+1] / 255,
                                    b: i8[j+16+2] / 255,
                
                                    layer: layer,
                
                                    lastX: f32[i+5],
                                    lastY: f32[i+6],
                                    lastZ: f32[i+7],
                                    lastS: f32[i+8],
                                } );
                        }
                        return points;
                    },
                    closest: ( xyz , r = 0 , visibleOrLayer = false ) => {
                        const pick = edit.pipelines.brush.pick;
                        const points = pick.all( xyz , r , visibleOrLayer );
    
                        if( points.length === 0 ) return null;
    
                        let closest = points[ 0 ];
                        for( const point of points )
                            if( point.d < closest.d )
                                closest = point;
                        return closest;
                    },
                },
            },
            mesh: {
                
                maxVertices: 3000,
                maxFaces: 1000,
    
                reset: () => {

                    const mesh = edit.pipelines.mesh;

                    mesh.detachedTextures.clear();
                    mesh.textureFreedLength = 0;
                    mesh.textureAllocatedLength = 0;
                    mesh.textureArray.fill( 0 );
                    mesh.textureArrayFlip = null;

                    mesh.undoHistory = [];
                    mesh.redoHistory = [];
                    mesh.paintUndo = null;

                    mesh.faces = {};
                    mesh.vertices = {};

                    mesh.requestTextureUpdate();
                    mesh.requestUpdate();
    
                },

                setup: () => {
                    const mesh = edit.pipelines.mesh;
    
                    mesh.setupTexture();
                    mesh.buildMeshes();

                    mesh.requestTextureUpdate();
                    mesh.requestUpdate();
    
                },
    
                load: async ( jsonPart ) => {
    
                    const mesh = edit.pipelines.mesh;
    
    
                    const { json: jsonSrc, buffers } = jsonPart;
                    const json = JSON.parse( jsonSrc );

                    const { loaderId } = json;
                    
                    if( Object.keys( mesh.loaders ).indexOf( loaderId ) === -1 ) {

                        console.error( `Pipelines.Mesh: Failed to load mesh data for "${fileName}". Unrecognized version.` );
                        return false;

                    }

                    for( const name in buffers ) {

                        if( buffers[ name ] === '' || buffers[ name ] === 'data:' ) {

                            buffers[ name ] = new ArrayBuffer( 0 );
                            continue;

                        }

                        const buffer = await ( await fetch( buffers[ name ] ) ).arrayBuffer();
                        buffers[ name ] = buffer;

                    }

                    return mesh.loaders[ loaderId ]( json, buffers );
    
                },
                serializeSave: async () => {
                    
                    const loaderId = 'v1';
    
                    const mesh = edit.pipelines.mesh;
    
                    const dst = new Uint8ClampedArray( mesh.textureArray.length );
                    const src = mesh.textureArray;
                    
                    let j = 0;
                    const faces = {};

                    for( const id in mesh.faces ) {

                        const face = mesh.faces[ id ];

                        if( face.deleted === null ) continue;

                        const saveFace = { ...mesh.faces[ id ] }

                        if( face.texture !== null ) {

                            saveFace.texture = {
                                offset: j / 3,
                                length: face.texture.length
                            };

                            const offset = face.texture.offset * 3;
                            const length = face.texture.length * 3;

                            for( let i=0; i<length; i++ ) 
                                dst[ j++ ] = src[ offset + i ];

                        }

                        faces[ id ] = saveFace;

                    }
    
                    const vertices = {};
                    for( const id in mesh.vertices )
                        if( ! mesh.vertices[ id ].deleted )
                            vertices[ id ] = mesh.vertices[ id ];
    
                    const textureArray = new Uint8ClampedArray( dst.buffer , 0 , j );
    
                    const json = JSON.stringify( {

                        loaderId,
                        faces , 
                        vertices, 
                        textureAllocatedLength: j

                    } );
    
                    const buffers = {};

                    const arrayBlob = new Blob( [ textureArray ], { type:'application/octet-stream' } );
                    const fileReader = new FileReader();
                    
                    await new Promise( load => {
                        fileReader.addEventListener( 'load', () => load() );
                        fileReader.readAsDataURL( arrayBlob );
                    } );
                    
                    buffers.textureArray = fileReader.result;
    
                    return { json, buffers };

                },
    
                //loaders are indexed by file-save version, always convert to current version
                loaders: {
                    'v1': ( json, buffers ) => {
    
                        const mesh = edit.pipelines.mesh;
    
                        mesh.vertices = json.vertices;
                        mesh.faces = json.faces;
    
                        mesh.textureAllocatedLength = json.textureAllocatedLength;
                        const textureArray = new Uint8ClampedArray( buffers.textureArray );
                        mesh.textureArray.set( textureArray );
    
                        mesh.requestTextureUpdate();
                        mesh.requestUpdate();
    
                        return true;
    
                    },
                },
                loaderArrayNames: {
                    'v1': [ 'textureArray' ]
                },
    
                meshNeedsUpdate: false,
                requestUpdate: () => edit.pipelines.mesh.meshNeedsUpdate = true,
    
                textureNeedsUpdate: false,
                requestTextureUpdate: () => edit.pipelines.mesh.textureNeedsUpdate = true,
    
                trianglesNeedUpdate: false,
                requestTrianglesUpdate: () => edit.pipelines.mesh.trianglesNeedUpdate = true,
    
                render: () => {
    
                    const mesh = edit.pipelines.mesh;
    
                    if( mesh.trianglesNeedUpdate === true ) {
                        for( const id in mesh.faces ) {
                            const face = mesh.faces[ id ];
    
                            if( face.deleted === true ) continue;
    
                            if( face.triangleNeedsUpdate === true ) {
                                const formerTriangle = face.triangle;
    
                                mesh.triangle.updateFace( face );
    
                                if( face.texture !== null &&
                                     //undo replace-vertex on new face had no former triangle :-|
                                    formerTriangle !== null )
                                    mesh.resizeTexture( face , formerTriangle );
    
                                mesh.requestUpdate();
                            }
                        }
                        mesh.trianglesNeedUpdate = false;
                    }
    
                    if( mesh.textureNeedsUpdate === true ) {
                        mesh.faceMesh.material.needsUpdate = true;
                        mesh.faceMesh.material.uniforms.dataTexture.value.needsUpdate = true;
                        mesh.textureNeedsUpdate = false;
                    }
    
                    if( mesh.meshNeedsUpdate === true ) {
                        mesh.update();
                        mesh.meshNeedsUpdate = false;
                    }
                },
    
                _m: new THREE.Matrix4(),
                update: () => {
                    const mesh = edit.pipelines.mesh;
                    
                    const vertexInstancer = mesh.vertexInstancer;
                    const vertices = mesh.vertices;
                    const _m = mesh._m;
                    let i = 0;
                    for( const id in vertices ) {
                        const vertex = vertices[ id ];
    
                        if( vertex.deleted === true ) continue;
    
                        _m.identity();
                        _m.elements[12] = vertex.x;
                        _m.elements[13] = vertex.y;
                        _m.elements[14] = vertex.z;
                        vertexInstancer.setMatrixAt( i , _m );
                        i ++;
                    }
                    for( const id in mesh.faces ) {
                        const face = mesh.faces[ id ];
    
                        if( face.deleted === true ) continue;
    
                        const { triangle } = face;
    
    
                        const center = triangle.center;
                        
                        _m.identity();
                        _m.elements[12] = center.x;
                        _m.elements[13] = center.y;
                        _m.elements[14] = center.z;
                        vertexInstancer.setMatrixAt( i , _m );
                        i ++;
    
    
                        const { p0, p1, p2 } = triangle;
                        const { add , scale } = edit.math.vector;
    
                        for( const edge of [ [p0,p1] , [p1,p2] , [p2,p0] ] ) {
    
                            const [ a , b ] = edge;
    
                            const middle = scale( add( a , b ) , 0.5 );
    
                            _m.identity();
                            _m.elements[12] = middle.x;
                            _m.elements[13] = middle.y;
                            _m.elements[14] = middle.z;
                            vertexInstancer.setMatrixAt( i , _m );
                            i ++;
                        }
    
                    }
                    vertexInstancer.count = i;
                    vertexInstancer.instanceMatrix.needsUpdate = true;
                    vertexInstancer.needsUpdate = true;
    
                    const faces = mesh.faces;
    
                    const faceMesh = mesh.faceMesh;
                    const faceIndicesArray = faceMesh.geometry.index.array;
                    const xyzArray = faceMesh.geometry.attributes.position.array;
                    const uvsArray = faceMesh.geometry.attributes.uv.array;
                    const triangleArray = faceMesh.geometry.attributes.triangle.array;
                    const triangleColorArray = faceMesh.geometry.attributes.triangleColor.array;
    
                    i = 0;
                    for( const id in faces ) {
                        const face = faces[ id ];
                        if( face.deleted === true ) continue;
    
                        const indexI = i * 3;

                        //TODO: remove indices //...I don't know why I wrote that...
                        faceIndicesArray[ indexI + 0 ] = indexI + 0;
                        faceIndicesArray[ indexI + 1 ] = indexI + 1;
                        faceIndicesArray[ indexI + 2 ] = indexI + 2;
    
                        const xyzI = i * 3 * 3; //3 xyz[3] per
                        const a = vertices[ face.a ];
                        xyzArray[ xyzI + 0 ] = a.x;
                        xyzArray[ xyzI + 1 ] = a.y;
                        xyzArray[ xyzI + 2 ] = a.z;
                        const b = vertices[ face.b ];
                        xyzArray[ xyzI + 3 ] = b.x;
                        xyzArray[ xyzI + 4 ] = b.y;
                        xyzArray[ xyzI + 5 ] = b.z;
                        const c = vertices[ face.c ];
                        xyzArray[ xyzI + 6 ] = c.x;
                        xyzArray[ xyzI + 7 ] = c.y;
                        xyzArray[ xyzI + 8 ] = c.z;
    
                        const { triangle } = face;
    
                        const uvI = i * 2 * 3; //6 uv[2] per face
                        
                        let cornerOffset = null;
                        if( a.i === triangle.corner.i ) cornerOffset = 0;
                        else if( b.i === triangle.corner.i ) cornerOffset = 2;
                        else if( c.i === triangle.corner.i ) cornerOffset = 4;
    
                        let shortOffset = null;
                        if( a.i === triangle.shortEnd.i ) shortOffset = 0;
                        else if( b.i === triangle.shortEnd.i ) shortOffset = 2;
                        else if( c.i === triangle.shortEnd.i ) shortOffset = 4;
    
                        let remainingOffset = null;
                        if( a.i === triangle.longEnd.i ) remainingOffset = 0;
                        else if( b.i === triangle.longEnd.i ) remainingOffset = 2;
                        else if( c.i === triangle.longEnd.i ) remainingOffset = 4;
    
                        uvsArray[ uvI + cornerOffset + 0 ] = 0;
                        uvsArray[ uvI + cornerOffset + 1 ] = 1;
    
                        uvsArray[ uvI + shortOffset + 0 ] = 0;
                        uvsArray[ uvI + shortOffset + 1 ] = 0;
    
                        uvsArray[ uvI + remainingOffset + 0 ] = 1;
                        uvsArray[ uvI + remainingOffset + 1 ] = 1;
    
                        {
                            const triangleI = i * 4 * 3; //3 triangle[4] per face
                            const triangleIC = i * 3 * 3; //3 color[3] per face
                            //same triangle data shared by all 3 vertices
                            const offset = ( face.texture === null ) ? -10 : face.texture.offset;
                            const { r , g , b } = face.color;
                            const { widthInt , decayInt , rowsInt } = triangle;
                            for( let t=0; t<3; t++ ) {
                                const ti = t * 4;
                                triangleArray[ triangleI + ti + 0 ] = widthInt;
                                triangleArray[ triangleI + ti + 1 ] = rowsInt;
                                triangleArray[ triangleI + ti + 2 ] = decayInt;
                                triangleArray[ triangleI + ti + 3 ] = offset;
    
                                const tc = t * 3;
                                triangleColorArray[ triangleIC + tc + 0 ] = r;
                                triangleColorArray[ triangleIC + tc + 1 ] = g;
                                triangleColorArray[ triangleIC + tc + 2 ] = b;
                            }
                        }
    
                        i++;
                    }
    
                    const verticesToDraw = i * 3;
                    faceMesh.geometry.setDrawRange( 0 , verticesToDraw );
    
                    faceMesh.geometry.index.needsUpdate = true;
                    faceMesh.geometry.attributes.position.needsUpdate = true;
                    faceMesh.geometry.attributes.uv.needsUpdate = true;
                    faceMesh.geometry.attributes.triangle.needsUpdate = true;
                    faceMesh.geometry.attributes.triangleColor.needsUpdate = true;
    
                    faceMesh.needsUpdate = true;
                },
    
                vertices: {},
                faces: {},
                redoHistory: [],
                undoHistory: [],
                redo: () => {
                    const mesh = edit.pipelines.mesh;
    
                    if( mesh.redoHistory.length === 0 ) return;
    
                    const r = mesh.redoHistory.pop();
    
                    if( r.t === 'replace-vertex' ) {
    
                        const { t, i, ri, faces } = r;
    
                        mesh.undoHistory.push( { t , i , ri, faces } );
    
                        for( const [ id, v ] of faces ) {
    
                            mesh.faces[ id ][ v ] = ri;
                            mesh.faces[ id ].triangleNeedsUpdate = true;
    
                        };
    
                        if( faces.length ) mesh.requestTrianglesUpdate();
    
                        mesh.vertices[ i ].deleted = true;
    
                    }
    
                    if( r.t === 'update-vertex' ) {
                        const { t , i , oldVertex , newVertex } = r;
    
                        mesh.undoHistory.push( { t , i , oldVertex , newVertex } );
    
                        mesh.vertices[ i ] = newVertex;
    
                        let trianglesUpdated = false;
    
                        for( const id in mesh.faces ) {
                            const face = mesh.faces[ id ];
                            if( face.a === i || face.b === i || face.c === i ) {
                                face.triangleNeedsUpdate = true;
    
                                //If face is deleted, its triangle will not update in render loop until un-deleted
                                if( face.deleted === false )
                                    trianglesUpdated = true;
                            }
                        }
    
                        if( trianglesUpdated === true )
                            mesh.requestTrianglesUpdate();
                    }
    
                    if( r.t === 'add-vertex' ) {
                        const { t , i } = r;
                        mesh.undoHistory.push( { t , i } );
                        mesh.vertices[ i ].deleted = false;
                    }
    
                    if( r.t === 'add-face' ) {
                        const { t , i } = r;
    
                        mesh.undoHistory.push( { t , i } );
    
                        const face = mesh.faces[ i ];
    
                        face.deleted = false;
                        if( face.texture !== null ) mesh.detachedTextures.delete( face.texture );
    
                        if( face.triangleNeedsUpdate === true )
                            mesh.requestTrianglesUpdate();
                    }
    
                    if( r.t === 'remove-vertex' ) {
                        const { t , i } = r;
                        mesh.undoHistory.push( { t , i } );
                        mesh.vertices[ i ].deleted = true;
                    }
    
                    if( r.t === 'remove-face' ) {
                        const { t , i } = r;
    
                        mesh.undoHistory.push( { t , i } );
    
                        const face = mesh.faces[ i ];
    
                        face.deleted = true;
                        if( face.texture !== null ) mesh.detachedTextures.add( face.texture );
                    }
                    
                    if( r.t === 'paint' ) {
    
                        const { t , fs } = r;
                        mesh.undoHistory.push( { t , fs } );
    
                        let c = 0;
    
                        for( const id in fs ) {
    
                            const { final } = fs[ id ];
                            const face = mesh.faces[ id ];
                            const offset = face.texture.offset * 3;
    
                            mesh.textureArray.set( final, offset );
    
                            c++;
                        }
    
                        if( c > 0 ) mesh.requestTextureUpdate();
    
                    }
    
                    mesh.requestUpdate();
                },
                undo: () => {
                    const mesh = edit.pipelines.mesh;
                    if( mesh.undoHistory.length === 0 ) return;
    
                    const u = mesh.undoHistory.pop();
    
                    if( u.t === 'replace-vertex' ) {
    
                        const { t, i, ri, faces } = u;
    
                        mesh.redoHistory.push( { t , i , ri, faces } );
    
                        for( const [ id, v ] of faces ) {
    
                            mesh.faces[ id ][ v ] = i;
                            mesh.faces[ id ].triangleNeedsUpdate = true;
    
                        };
    
                        if( faces.length ) mesh.requestTrianglesUpdate();
    
                        mesh.vertices[ i ].deleted = false;
    
                    }
    
                    if( u.t === 'update-vertex' ) {
                        const { t , i , oldVertex , newVertex } = u;
    
                        mesh.redoHistory.push( { t , i , oldVertex , newVertex } );
    
                        mesh.vertices[ i ] = oldVertex;
    
                        let trianglesUpdated = false;
    
                        for( const id in mesh.faces ) {
                            const face = mesh.faces[ id ];
    
                            if( face.a === i || face.b === i || face.c === i ) {
                                face.triangleNeedsUpdate = true;
    
                                //If face is deleted, its triangle will not update in render loop
                                if( face.deleted === false )
                                    trianglesUpdated = true;
                            }
                        }
    
                        if( trianglesUpdated ) mesh.requestTrianglesUpdate();
                    }
    
                    if( u.t === 'add-vertex' ) {
                        const { t , i } = u;
                        mesh.redoHistory.push( { t , i } );
                        mesh.vertices[ i ].deleted = true;
                    }
    
                    if( u.t === 'add-face' ) {
                        const { t , i } = u;
                        mesh.redoHistory.push( { t , i } );
    
                        const face = mesh.faces[ i ];
    
                        face.deleted = true;
                        if( face.texture !== null ) mesh.detachedTextures.add( face.texture );
                    }
    
                    if( u.t === 'remove-vertex' ) {
                        const { t , i } = u;
                        mesh.redoHistory.push( { t , i } );
                        mesh.vertices[ i ].deleted = false;
                    }
    
                    if( u.t === 'remove-face' ) {
                        const { t , i } = u;
                        mesh.redoHistory.push( { t , i } );
    
                        const face = mesh.faces[ i ];
    
                        face.deleted = false;
                        if( face.texture !== null ) mesh.detachedTextures.delete( face.texture );
    
                        if( face.triangleNeedsUpdate === true )
                            mesh.requestTrianglesUpdate();
                    }
    
                    if( u.t === 'paint' ) {
    
                        const { t , fs } = u;
                        mesh.redoHistory.push( { t , fs } );
    
                        let c = 0;
    
                        for( const id in fs ) {
    
                            const { original } = fs[ id ];
                            const face = mesh.faces[ id ];
                            const offset = face.texture.offset * 3;
    
                            mesh.textureArray.set( original, offset );
    
                            c++;
                        }
    
                        if( c > 0 ) mesh.requestTextureUpdate();
    
                    }
    
                    mesh.requestUpdate();
                },
                clearUndo: () => {
                    const mesh = edit.pipelines.mesh;
    
                    for( const u of mesh.undoHistory ) {
                        if( u.t === 'add-face' ) {
                            const face = mesh.faces[ u.i ];
    
                            if( face.texture !== null ) {
                                mesh.detachedTextures.delete( face.texture );
                                mesh.freeTexture( face.texture );
                            }
                        }
                    }
    
                    mesh.undoHistory.length = 0;
                    
                    mesh.clearRedo();
                },
                clearRedo: () => {
                    const mesh = edit.pipelines.mesh;
    
                    for( const r of mesh.redoHistory ) {
                        if( r.t === 'remove-face' ) {
                            const face = mesh.faces[ r.i ];
    
                            if( face.texture !== null ) {
                                mesh.detachedTextures.delete( face.texture );
                                mesh.freeTexture( face.texture );
                            }
                        }
                    }
    
                    mesh.redoHistory.length = 0;
                },
                mergeLastUndos: () => {
                    const mesh = edit.pipelines.mesh;
    
                    if( mesh.undoHistory.length < 2 ) return false;
    
                    const history = mesh.undoHistory;
    
                    const second = history.pop();
                    const first = history.pop();
    
                    let newUndo = null;
    
                    if( first.t === 'update-vertex' &&
                        second.t === 'update-vertex' &&
                        first.i === second.i ) {
                        newUndo = {
                            t: 'update-vertex',
                            i: first.i,
                            oldVertex: first.oldVertex,
                            newVertex: second.newVertex,
                        }
                    }
    
                    if( newUndo === null ) {
                        //should never land here
                        history.push( first );
                        history.push( second );
                        console.error( "Warning: Mesh mergeLastUndos called even though impossible." );
                        return false;
                    }
    
                    history.push( newUndo );
                    return true;
                },
                upFetchUndo: n => {
                    //bring undo n-deep to the top of the undo stack
                    const mesh = edit.pipelines.mesh;
    
                    const history = mesh.undoHistory;
    
                    if( history.length < n ) return false;
    
                    for( let i = 1; i <= n; i ++ )
    
                        if( history[ history.length - i ].t !== 'update-vertex' ) {
    
                            console.error( "Warning: Mesh upFetchUndo(n) called even though impossible." , i , history.length-i, JSON.stringify( history ) );
    
                            return false;
                        }
    
                    history.push( history.splice( history.length - n , 1 )[ 0 ] );
    
                },
                paintUndo: null,
                startPaintUndo: () => edit.pipelines.mesh.paintUndo = {},
                addPaintUndoFace: id => {
                    
                    const mesh = edit.pipelines.mesh;
                    const fs = mesh.paintUndo;
    
                    if( ! fs ) return; //not cacheing undos
    
                    if( fs[ id ] ) return; //already cached face
    
    
                    fs[ id ] = {};
                    
                    const { texture } = mesh.faces[ id ];
                    const offset = texture.offset * 3;
                    const length = texture.length * 3;
    
                    fs[ id ].original = mesh.textureArray.slice( offset, offset + length );
    
                },
                cachePaintUndo: () => {
    
                    const mesh = edit.pipelines.mesh;
                    const fs = mesh.paintUndo;
    
                    if( ! fs || Object.keys( fs || {} ).length === 0 ) {
    
                        mesh.paintUndo = null;
    
                        return false;
    
                    }
    
                    for( const id in fs ) {
    
                        const { texture } = mesh.faces[ id ];
                        const offset = texture.offset * 3;
                        const length = texture.length * 3;
    
                        fs[ id ].final = mesh.textureArray.slice( offset, offset + length );
    
                    }
    
                    mesh.undoHistory.push( { t:'paint' , fs } );
    
                    mesh.clearRedo();
    
                    mesh.paintUndo = null;
    
                    return true;
    
                },
                consolidatePaintUndo: () => {
                    //TODO: free memory by merging oldest consecutive paint undos
                },
                
                addVertex: ( vertex ) => {
                    const mesh = edit.pipelines.mesh;
                    const { x,y,z , layer } = vertex;
    
                    const i = Object.keys( mesh.vertices ).length;
    
                    const newVertex = {
                        i , x,y,z,
                        layer,
    
                        //internal property
                        deleted: false,
                    };
                    mesh.vertices[ i ] = newVertex;
    
                    //return a clone, so tool can modify and pass it to updateVertex
                    const referenceVertex = {
                        i , x,y,z,
                        layer,
                    };
    
                    mesh.undoHistory.push( { t:'add-vertex' , i } );
                    mesh.requestUpdate();
                    mesh.clearRedo();
    
                    return referenceVertex;
                },
                updateVertex: vertex => {
                    const mesh = edit.pipelines.mesh;
                    const { i , x,y,z , layer } = vertex;
    
                    if( mesh.vertices[ i ].deleted === true ) return;
    
                    const oldVertex = mesh.vertices[ i ];
    
                    const newVertex = {
                        i , x,y,z,
                        layer,
    
                        //internal property
                        deleted: false,
                    };
    
                    mesh.vertices[ i ] = newVertex;
    
                    mesh.undoHistory.push( { t:'update-vertex' , i , oldVertex, newVertex } );
                    
                    for( const id in mesh.faces ) {

                        const face = mesh.faces[ id ];

                        const {a,b,c} = face;

                        if( [ a,b,c ].indexOf( i ) != -1 )

                            face.triangleNeedsUpdate = true;
                            
                    }
    
                    mesh.clearRedo();
    
                    mesh.requestUpdate();
    
                    //return nothing
                },
    
                addFace: ( face ) => {
                    const mesh = edit.pipelines.mesh;
                    const { a , b , c  , layer , color } = face;
    
                    const i = Object.keys( mesh.faces ).length;
    
                    const newFace = {
                        i,
                        a: a.i , b: b.i , c: c.i , 
                        color: { ...color },
                        layer ,
                        texture: null,
                        triangle: null,
    
                        //internal properties
                        deleted: false,
                        triangleNeedsUpdate: true,
                    };
    
                    mesh.faces[ i ] = newFace;
    
                    mesh.triangle.updateFace( mesh.faces[ i ] );
    
                    //waiting till paint to allocate texture
                    //mesh.allocateTexture( mesh.faces[ i ] );
    
                    mesh.requestUpdate();
    
                    mesh.undoHistory.push( { t:'add-face' , i } );
    
                    mesh.clearRedo();
    
                    const referenceFace = { 
                        i,
                        a: a.i , b: b.i , c: c.i , 
                        color: { ...color },
                        layer ,
                        texture : null,
                        triangle: newFace.triangle , //triangle is frozen, no need to clone
                    }
    
                    return referenceFace;
                },
    
                replaceVertex: ( original, replacement ) => {
                    const mesh = edit.pipelines.mesh;
    
                    const i = original.i;
                    const ri = replacement.i;
                    const faces = [];
    
                    let trianglesUpdated = false;
    
                    for( const id in mesh.faces ) {
    
                        const face = mesh.faces[ id ];

                        //replace on deleted faces as well

                        //what about layer-isolation?
    
                        if( face.a !== i && face.b !== i && face.c !== i ) continue;
    
                        if( face.a === i ) { faces.push( [ id, 'a' ] ); face.a = ri; }
                        if( face.b === i ) { faces.push( [ id, 'b' ] ); face.b = ri; }
                        if( face.c === i ) { faces.push( [ id, 'c' ] ); face.c = ri; }
    
                        face.triangleNeedsUpdate = true;
                        trianglesUpdated = true;
    
                    }
    
                    if( trianglesUpdated ) mesh.requestTrianglesUpdate();
    
                    mesh.vertices[ i ].deleted = true;
    
                    mesh.undoHistory.push( { t: 'replace-vertex', i, ri, faces } );
                    mesh.requestUpdate();
                    mesh.clearRedo();
    
                },
    
                vertexIsDeleted: vertex => edit.pipelines.mesh.vertices[ vertex.i ].deleted,

                //WARNING: Must first call removeFace() on relevant faces!
                removeVertex: vertex => {
                    const mesh = edit.pipelines.mesh;
    
                    const { i } = vertex;
    
                    mesh.vertices[ i ].deleted = true;
                    mesh.undoHistory.push( { t: 'remove-vertex' , i } );
                    mesh.requestUpdate();
                    mesh.clearRedo();
                    
                    //return nothing
                },
    
                faceIsDeleted: face => edit.pipelines.mesh.faces[ face.i ].deleted,

                removeFace: face => {
                    const mesh = edit.pipelines.mesh;
    
                    const { i } = face;
    
                    mesh.faces[ i ].deleted = true;
                    if( face.texture !== null ) mesh.detachedTextures.add( face.texture );
    
                    mesh.undoHistory.push( { t: 'remove-face' , i } );
    
                    mesh.clearRedo();
    
                    mesh.requestUpdate();
                    //return nothing
                },
    
                hideVertices: () => 
                    edit.pipelines.mesh.vertexInstancer.visible = false,
                showVertices: () => 
                    edit.pipelines.mesh.vertexInstancer.visible = true,
                useMaterial: material => {
                    const mesh = edit.pipelines.mesh;
                    if( material === 'wireframe' ) {
                        mesh.faceMesh.material = mesh.materials[ 'wireframe' ];
                    } else if( material === 'texture' ) {
                        mesh.faceMesh.material = mesh.materials[ 'texture' ];
                    }
                },
    
                //detached textures are not in use, 
                //  but re-acquireable via undo history
                detachedTextures: new Set(),
                textureFreedLength: 0,
                textureAllocatedLength: 0,
                textureWidth: 1024,
                setupTexture: () => {
                    const mesh = edit.pipelines.mesh;
                    const { textureWidth } = mesh;
                    mesh.textureArray = new Uint8ClampedArray( 
                        textureWidth * textureWidth * 3 );
                },
    
                textureArray: null,
                textureArrayFlip: null,
                extendTextureArray: () => {
                    const mesh = edit.pipelines.mesh;
                    const src = mesh.textureArray;
                    if( mesh.textureWidth >= 4096 ) {
                        console.error( "Overextending texture. Reduce texture resolution instead!" );
                        throw `Pipelines.Mesh - Overlarge Texture`;
                    }
                    const textureWidth = mesh.textureWidth * 2;
                    const extended = new Uint8ClampedArray( 
                        textureWidth * textureWidth );
                    extended.set( src );
                    mesh.textureWidth = textureWidth;
                    mesh.textureArray = extended;
                    mesh.textureArrayFlip = null;
                },
                defragmentTextureArray: () => {
                    const mesh = edit.pipelines.mesh;
                    const src = mesh.textureArray;
                    const dst = 
                        ( mesh.textureArrayFlip === null ) ?
                        new Uint8ClampedArray( src.length ) :
                        mesh.textureArrayFlip;
                    let j=0;
                    for( const id in mesh.faces ){
                        const face = mesh.faces[ id ];
                        if( face.texture === null ) continue;
                        const offset = face.texture.offset * 3;
                        const length = face.texture.length * 3;
                        face.texture.offset = j / 3;
                        for( let i=0; i<length; i++ ) {
                            dst[ j++ ] = src[ offset + i ];
                        }
                    }
                    for( const texture of mesh.detachedTextures ) {
                        const offset = texture.offset * 3;
                        const length = texture.length * 3;
                        texture.offset = j / 3;
                        for( let i=0; i<length; i++ ) {
                            dst[ j++ ] = src[ offset + i ];
                        }
                    }
                    mesh.textureAllocatedLength = j;
                    mesh.textureFreedLength = 0;
                    mesh.textureArray = dst;
                    mesh.textureArrayFlip = src;
                },
    
                //texture converters (declared by origin type) convert to current type
                allocateAndConvertTexture: {
                    'v1': ( saveFace, oldTextureArray, newFace, loader ) => {
    
                        if( saveFace.texture === null ) return;
    
                        const mesh = edit.pipelines.mesh;
    
                        mesh.triangle.updateFace( newFace );
                        loader.allocateTexture( newFace );
    
                        if( newFace.texture.length === saveFace.texture.length ) {
    
                            const oldI = saveFace.texture.offset * 3;
                            const oldEnd = oldI + ( saveFace.texture.length * 3 );
                            const oldTexture = oldTextureArray.subarray( oldI, oldEnd );
    
                            const newI = newFace.texture.offset * 3;
                            mesh.textureArray.set( oldTexture, newI );
    
                        } else {
    
                            const src = saveFace.triangle;
                            const oldI = saveFace.texture.offset * 3;
                            const oldEnd = oldI + ( saveFace.texture.length * 3 );
                            const oldTexture = oldTextureArray.subarray( oldI, oldEnd );
    
                            const newI = newFace.texture.offset * 3;
                            const newEnd = newI + ( newFace.texture.length * 3 );
                            const newTexture = mesh.textureArray.subarray( newI, newEnd );
                            
                            mesh.copyTextureToTexture( src, oldTexture, newFace.triangle, newTexture );
    
                        }
    
                    },
                },
    
                allocateTexture: face => {
                    const mesh = edit.pipelines.mesh;
    
                    const textureLength = face.triangle.textureLength * 3;
    
                    if( (mesh.textureAllocatedLength + textureLength) > 
                        mesh.textureArray.length ) {
                        if( mesh.textureFreedLength < textureLength )
                            mesh.defragmentTextureArray();
                        else mesh.extendTextureArray();
                    }
    
                    face.texture = {
                        offset: mesh.textureAllocatedLength / 3,
                        length: textureLength
                    }
    
                    const textureArray = mesh.textureArray;
                    for( let j=0; j<face.texture.length; j++ ) {
                        const i = ( face.texture.offset + j ) * 3;
                        textureArray[ i + 0 ] = face.color.r * 255;
                        textureArray[ i + 1 ] = face.color.g * 255;
                        textureArray[ i + 2 ] = face.color.b * 255;
                    }
    
                    mesh.textureAllocatedLength += textureLength * 3;
    
                    mesh.requestUpdate();
                },
                resizeTexture: ( face , formerTriangle ) => {
    
                    const { triangle } = face;
                    if( formerTriangle.textureLength === triangle.textureLength &&
                        formerTriangle.widthInt === triangle.widthInt &&
                        formerTriangle.decayInt === triangle.decayInt &&
                        formerTriangle.rowsInt === triangle.rowsInt &&
                        formerTriangle.corner.i === triangle.corner.i &&
                        formerTriangle.longEnd.i === triangle.longEnd.i )
                        return true;
    
                    const mesh = edit.pipelines.mesh;
    
                    const { texture: formerTexture } = face;
    
                    //allocate might defragment, so temporarily keep former texture alive but detached
                    //  (free at end of function)
    
                    const formerTextureArray = 
                        new Uint8ClampedArray(
                            mesh.textureArray.buffer,
                            formerTexture.offset * 3,
                            formerTexture.length * 3
                        );
    
                    mesh.detachedTextures.add( formerTexture );
    
                    mesh.allocateTexture( face );
    
                    const { texture } = face;
                    const textureArray = 
                        new Uint8ClampedArray(
                            mesh.textureArray.buffer,
                            texture.offset * 3,
                            texture.length * 3
                        );
    
                    mesh.copyTextureToTexture( 
                        formerTriangle, formerTextureArray , 
                        triangle , textureArray
                    );
    
                    mesh.detachedTextures.delete( formerTexture );
                    mesh.freeTexture( formerTexture );
    
                    mesh.requestTextureUpdate();
                },
    
                freeTexture: texture => {
                    const mesh = edit.pipelines.mesh;
                    mesh.textureFreedLength += texture.length;
                    //should never keep this object alive, but just in case
                    texture.offset = null;
                    texture.length = null;
                },
    
                pick: {
                    handles: {
                        //includes vertices and edge centers, cannot be used for updating...
                        all: ( xyz , layer , radius ) => {
                            const mesh = edit.pipelines.mesh;
    
                            const r2 = radius**2;
                            const vr2 = mesh.config.vertexSize ** 2;
                            const { sub , lenSq , scale , add } = edit.math.vector;
    
                            const handles = [];
    
                            for( const id in mesh.vertices ) {
                                const vertex = mesh.vertices[ id ];
    
                                if( vertex.deleted === true || vertex.layer !== layer ) continue;
    
                                const d = lenSq( sub( vertex , xyz ) );
                                if( d < ( r2 + vr2 ) ) {
                                    const handleReference = {
                                        d ,
                                        x: vertex.x,
                                        y: vertex.y,
                                        z: vertex.z,
                                        i: vertex.i,
                                        is: 'vertex',
                                    }
                                    handles.push( handleReference );
                                }
                            }
                            const edgeIds = new Set();

                            for( const id in mesh.faces ) {
                                const face = mesh.faces[ id ];
                                if( face.deleted === true || face.layer !== layer ) continue;

                                const { triangle } = face;
                                {
                                    const { center } = triangle;
                                    const d = lenSq( sub( center, xyz ) );
                                    if( d < ( r2 + vr2 ) ) {
                                        const handleReference = {
                                            d ,
                                            x: center.x,
                                            y: center.y,
                                            z: center.z,
                                            i: face.i,
                                            a: { i: face.a },
                                            b: { i: face.b },
                                            c: { i: face.c },
                                            is: 'face',
                                        }
                                        handles.push( handleReference );
                                    }
                                }

                                const { p0, p1, p2 } = triangle;

                                for( const edge of [ [p0,p1] , [p1,p2] , [p2,p0] ] ) {
                                    const [ a , b ] = edge;
    
                                    const id = Math.min( a.i, b.i ) + '-' + Math.max( a.i, b.i );
                                    if( edgeIds.has( id ) ) continue;
                                    else edgeIds.add( id );
    
                                    const middle = scale( add( a , b ) , 0.5 );
                                    const d = lenSq( sub( middle , xyz ) );
                                    if( d < ( r2 + vr2 ) ) {
                                        const handleReference = {
                                            d ,
                                            x: middle.x,
                                            y: middle.y,
                                            z: middle.z,
                                            i: id,
                                            a: { i: a.i },
                                            b: { i: b.i },
                                            is: 'edge',
                                        }
                                        handles.push( handleReference );
                                    }
                                }
                            }
    
                            return handles;
                        },
                        closest: ( xyz , layer , radius, from ) => {
                            const mesh = edit.pipelines.mesh;
    
                            const closest = { 
                                vertex: { d:Infinity },
                                edge: { d:Infinity },
                                face: { d:Infinity },
                            };
    
                            const handles = from || mesh.pick.handles.all( xyz , layer , radius );
    
                            if( handles.length === 0 ) {
                                closest.vertex = null;
                                closest.edge = null;
                                closest.face = null;
                            }
                            else if( handles.length === 1 ) {
                                const handle = handles[ 0 ];
                                closest.vertex = ( handle.is === 'vertex' ) ? handle : null;
                                closest.edge = ( handle.is === 'edge' ) ? handle : null;
                                closest.face = ( handle.is === 'face' ) ? handle : null;
                            }
                            else {
                                for( const handle of handles ) {
                                    if( handle.is === 'vertex' && handle.d < closest.vertex.d )
                                        closest.vertex = handle;
                                    else if( handle.is === 'edge' && handle.d < closest.edge.d )
                                        closest.edge = handle;
                                    else if( handle.is === 'face' && handle.d < closest.face.d )
                                        closest.face = handle;
                                }
                            }

                            if( closest.vertex && closest.vertex.d === Infinity ) closest.vertex = null;
                            if( closest.edge && closest.edge.d === Infinity ) closest.edge = null;
                            if( closest.face && closest.face.d === Infinity ) closest.face = null;
    
                            return closest;
                        },
                        crawlDependency: ( handle ) => {
                            const mesh = edit.pipelines.mesh;

                            const dependentVertices = new Set();
                            const dependentFaces = new Set();

                            //All faces depending on a vertex in the dependent set are in the dependent set
                            //All vertices not depending on a face not in the dependent set are in the dependent set
                            //That's just how it is. :-|

                            const crawlVertex = vertex => {

                                const sourceVertex = mesh.vertices[ vertex.i ];

                                if( sourceVertex.deleted === true ) return;

                                if( ! dependentVertices.has( sourceVertex ) )
                                    dependentVertices.add( sourceVertex );

                                for( const id in mesh.faces ) {
                                    const face = mesh.faces[ id ];
                                    if( face.deleted === true ) continue;
                                    if( dependentFaces.has( face ) ) continue;
                                    if( face.a === vertex.i || face.b === vertex.i || face.c === vertex.i )
                                        crawlFace( face );
                                }

                            }

                            const crawlFace = face => {

                                const sourceFace = mesh.faces[ face.i ];

                                if( sourceFace.deleted === true ) return false;

                                if( ! dependentFaces.has( sourceFace ) )
                                    dependentFaces.add( sourceFace );

                                for( const id in mesh.vertices ) {
                                    const vertex = mesh.vertices[ id ];
                                    if( vertex.deleted === true ) continue;
                                    if( dependentVertices.has( vertex ) ) continue;

                                    let vertexIsDependent = true;

                                    crawlDependence:
                                    for( const id in mesh.faces ) {
                                        const face = mesh.faces[ id ];
                                        if( face.deleted === true ) continue;
                                        if( dependentFaces.has( face ) ) continue;
                                        if( face.a === vertex.i || face.b === vertex.i || face.c === vertex.i ) {
                                            vertexIsDependent = false;
                                            break crawlDependence;
                                        }
                                    }

                                    if( vertexIsDependent === true ) crawlVertex( vertex );
                                }

                            }


                            if( handle.is === 'vertex' ) crawlVertex( handle );
                            if( handle.is === 'edge' ) {
                                crawlVertex( handle.a );
                                crawlVertex( handle.b );
                            }
                            if( handle.is === 'face' ) crawlFace( handle )

                            const handles = [];

                            for( const face of dependentFaces ) {
                                handles.push( {
                                    x: face.triangle.center.x,
                                    y: face.triangle.center.y,
                                    z: face.triangle.center.z,
                                    i: face.i,
                                    a: { i: face.a },
                                    b: { i: face.b },
                                    c: { i: face.c },
                                    is: 'face'
                                } );
                            }

                            for( const vertex of dependentVertices ) {
                                handles.push( {
                                    x: vertex.x,
                                    y: vertex.y,
                                    z: vertex.z,
                                    i: vertex.i,
                                    is: 'vertex'
                                } );
                            }

                            const { scale, add, lenSq, sub } = edit.math.vector;

                            const edgeIds = new Set();
                            for( const face of dependentFaces ) {
                                const { p0, p1, p2 } = face.triangle;

                                for( const edge of [ [p0,p1] , [p1,p2] , [p2,p0] ] ) {
                                    const [ a , b ] = edge;

                                    if( ! dependentVertices.has( a ) && ! dependentVertices.has( b ) ) continue;

                                    const id = Math.min( a.i, b.i ) + '-' + Math.max( a.i, b.i );
                                    if( edgeIds.has( id ) ) continue;
                                    
                                    edgeIds.add( id );
    
                                    const middle = scale( add( a , b ) , 0.5 );
                                    handles.push( {
                                        x: middle.x,
                                        y: middle.y,
                                        z: middle.z,
                                        i: id,
                                        a: { i: a.i },
                                        b: { i: b.i },
                                        is: 'edge',
                                    } );
                                }
                            }

                            return handles;

                        }
                    },
                    faces: {
                        all: ( xyz , layer , radius = 0 ) => {
                            const mesh = edit.pipelines.mesh;
                            const { sub , lenSq } = edit.math.vector;
    
                            const picked = [];
    
                            const radiusSquared = radius**2;
                            
                            for( const id in mesh.faces ) {
                                const face = mesh.faces[ id ];
    
                                if( face.deleted === true ) continue;

                                if( face.layer !== layer ) continue;
    
                                const triangle = face.triangle;
    
                                const d = lenSq( sub( triangle.center , xyz ) );
    
                                if( d < ( triangle.radiusSquared + radiusSquared ) ) {
                                    const referenceFace = { 
                                        d , 
                                        ...face ,
                                        texture: (face.texture === null) ? null : { ...face.texture },
                                        color: { ...face.color }
                                        //triangle is frozen, no need to clone
                                    };
    
                                    //internal properties
                                    delete referenceFace.deleted;
                                    delete referenceFace.triangleNeedsUpdate;
    
                                    picked.push( referenceFace );
                                }
                            }
    
                            return picked;
                        },
                        closest: ( xyz , layer , radius = 0, from ) => {
                            const mesh = edit.pipelines.mesh;
    
                            const picked = from || mesh.pick.faces.all( xyz , layer , radius );
    
                            if( picked.length === 0 ) return null;
    
                            if( picked.length === 1 ) return picked[ 0 ];
                            
                            let closest = picked[ 0 ];
                            for( const face of picked )
                                if( face.d < closest.d )
                                    closest = face;
    
                            return closest;
                        },
                        withVertices: vertices => {
                            const mesh = edit.pipelines.mesh;
    
                            const picked = [];
    
                            for( const vertex of vertices ) {
                                const i = vertex.i;

                                if( vertex.deleted ) continue;

                                for( const id in mesh.faces ) {
                                    const face = mesh.faces[ id ];

                                    if( face.deleted ) continue;

                                    if( face.a === i || face.b === i || face.c === i ) {
                                        const referenceFace = {
                                            ...face ,
                                            texture: (face.texture === null) ? null : { ...face.texture },
                                            color: { ...face.color },
                                            //triangle is frozen, no need to clone
                                        };
    
                                        //internal properties
                                        delete referenceFace.deleted;
                                        delete referenceFace.triangleNeedsUpdate;
    
                                        picked.push( referenceFace );
                                    }

                                }
                            }
    
                            return picked;
                        },
                    },
                    vertices: { 
                        all: ( xyz , layer , radius = 0 ) => {
                            const mesh = edit.pipelines.mesh;
                            const { sub , lenSq } = edit.math.vector;
    
                            const vertexRadiusSquared = mesh.config.vertexSize ** 2;
                            const radiusSquared = radius ** 2;
    
                            const picked = [];
    
                            for( const id in mesh.vertices ) {

                                const vertex = mesh.vertices[ id ];

                                if( vertex.deleted === true ) continue;

                                if( vertex.layer !== layer ) continue;

                                const d = lenSq( sub( vertex , xyz ) );

                                if( d < ( vertexRadiusSquared + radiusSquared ) ) {

                                    const vertexReference = {
                                        d ,
                                        i: vertex.i , 
                                        x: vertex.x,
                                        y: vertex.y,
                                        z: vertex.z,
                                        layer:vertex.layer ,
                                    }

                                    picked.push( vertexReference );

                                }

                            }
    
                            return picked;
                        }, 
                        closest: ( xyz , layer , radius = 0, from ) => {
                            const mesh = edit.pipelines.mesh;
    
                            const picked = from || mesh.pick.vertices.all( xyz , layer , radius );
    
                            if( picked.length === 0 ) return null;
    
                            if( picked.length === 1 ) return picked[ 0 ];
    
                            let closest = picked[ 0 ];
                            for( const vertex of picked )
                                if( vertex.d < closest.d )
                                    closest = vertex;
    
                            return closest;
                        }, 
                    },
                    edges: {
                        all: ( xyz , layer , radius = 0 ) => {
                            const mesh = edit.pipelines.mesh;
                            const { sub , lenSq , dot , add , scale } = edit.math.vector;
    
                            const pickedFaces = mesh.pick.faces.all( xyz , layer , radius );
    
                            const edgeRadiusSquared = mesh.config.vertexSize ** 2;
                            const radiusSquared = radius ** 2;
    
                            if( pickedFaces.length === 0 ) return [];
    
                            const picked = [];
    
                            for( const face of pickedFaces ) {
                                const a = mesh.vertices[ face.a ];
                                const b = mesh.vertices[ face.b ];
                                const c = mesh.vertices[ face.c ];
                                const edges = [
                                    { a: a , b: b },
                                    { a: b , b: c },
                                    { a: c , b: a },
                                ];
                                
                                for( const edge of edges ) {
    
                                    const vector = sub( edge.b , edge.a );
                                    const lengthSquared = lenSq( vector );
    
                                    const xyzProjectionClamped = 
                                        Math.max( 0 , Math.min( 1 ,
                                            dot( 
                                                sub( xyz , edge.a ) , 
                                                vector 
                                            ) / lengthSquared
                                        ) );
    
                                    const closestPoint = add(
                                        edge.a ,
                                        scale( vector , xyzProjectionClamped )
                                    );
    
                                    //distance from xyz to closest point on edge
                                    const d = lenSq( sub( xyz , closestPoint ) );
    
                                    if( d < ( edgeRadiusSquared + radiusSquared ) ) {
                                        const edgeReference = {
                                            a: { i: edge.a.i , x:edge.a.x, y:edge.a.y, z:edge.a.z, layer: edge.a.layer },
                                            b: { i: edge.b.i , x:edge.b.x, y:edge.b.y, z:edge.b.z, layer: edge.b.layer },
                                            d: d,
                                        }
    
                                        picked.push( edgeReference );
                                    }
                                }
                            }
    
                            return picked;
                        },
                        closest: ( xyz , layer , radius = 0 ) => {
                            const mesh = edit.pipelines.mesh;
    
                            const edges = mesh.pick.edges.all( xyz , layer , radius );
    
                            let closest = edges[ 0 ]
                            for( const edge of edges )
                                if( edge.d < closest.d )
                                    closest = edge;
    
                            return closest;
                        },
                    },
                    color: {
                        all: () => { console.warn( "edit.pipelines.mesh.pick.color.all() unimplemented" ); },
                        closest: ( xyz , layer , radius ) => {
                            const mesh = edit.pipelines.mesh;
    
                            const { add , scale , lenSq , sub , dot } = edit.math.vector;
    
                            const picked = mesh.pick.faces.all( xyz , layer , radius );
    
                            if( picked.length === 0 ) return null;
    
                            let closest = { d:Infinity , r:0, g:0, b:0 }
    
                            const texture = mesh.textureArray;
                            const r2 = radius**2;
    
                            for( const face of picked ) {
                                const triangle = face.triangle;
    
                                const p = sub( xyz , triangle.corner );
    
                                const ufy = dot( p , triangle.height ) / triangle.height.lengthSquared;
    
                                const fy = Math.max( 0 , Math.min( 1 , ufy ) );
    
                                const row = triangle.rows[ Math.min( triangle.rows.length-1, parseInt( fy * triangle.rows.length ) ) ];
                                const px = sub( xyz , row.start );
                                const ufx = dot( px , row.vector ) / row.vector.lengthSquared;
                                const fx = Math.max( 0 , Math.min( 1 , ufx ) );
    
                                const tp = add( row.start , scale( row.vector , fx ) );
                                const d = lenSq( sub( xyz , tp ) );
    
                                if( d < r2 && d < closest.d ) {
                                    closest.d = d;
    
                                    if( face.texture === null ) {
                                        closest.r = face.color.r;
                                        closest.g = face.color.g;
                                        closest.b = face.color.b;
                                    }
                                    else {
                                        const offset = face.texture.offset;
                                        const i = ( offset + ( row.i + parseInt( fx * row.length ) ) ) * 3;
                                        closest.r = texture[ i + 0 ] / 255;
                                        closest.g = texture[ i + 1 ] / 255;
                                        closest.b = texture[ i + 2 ] / 255;
                                    }
                                }
                            }
    
                            if( closest.d === Infinity ) return null;
    
                            return closest;
                        },
                    }
                },
    
                paint: {
                    //cuboid with 3-axis threshhold cutoff
                    'hard-cuboid': ( xyz , face, brush ) => {
                        const mesh = edit.pipelines.mesh;
                        const triangle = face.triangle;
                        const { sub , dot , scale , add , len } = edit.math.vector;
    
                        const p = sub( xyz , triangle.corner );
    
                        //project point to triangle's plain
                        const p0x = dot( p , triangle.long ) / triangle.long.lengthSquared;
                        const p0y = dot( p , triangle.height ) / triangle.height.lengthSquared;
    
                        //compute xyz of p0 (relative to triangle corner)
                        const p0 = add( scale( triangle.long , p0x ), scale( triangle.height , p0y ) );
    
                        //compute distance from point to plane
                        const depth = len( sub( p , p0 ) );
    
                        //compute row start and end at this height
                        const rowStart = p0y * triangle.median;
                        const rowEnd = 1 - ( p0y * ( 1 - triangle.median ) );
    
                        const isInTriangle = ( p0y >= 0 && p0y <= 1 ) && ( p0x >= rowStart && p0x <= rowEnd );
    
                        //Note!: looping every pixel; could instead compute start / end of row
                        const texture = mesh.textureArray;
                        const { xAxis , yAxis , zAxis } = brush;
                        const { xEdge , yEdge , zEdge } = brush;
                        const r = parseInt( brush.r * 255 );
                        const g = parseInt( brush.g * 255 );
                        const b = parseInt( brush.b * 255 );
                        const ba = brush.opacity;
                        const { smear, blend } = brush;
    
    
                        const uface = mesh.faces[ face.i ];
    
                        if( uface.texture === null ) mesh.allocateTexture( uface );
    
                        mesh.addPaintUndoFace( face.i );
    
                        const offset = uface.texture.offset;
    
                        const { 
                            headData, //Uint8ClampedArray brush head data
                            blendData, //Uint8ClampedArray brush blend data
                            fw, fh, //size of brush head data in brush coordinates
                            hw, hh, //size of brush head data in pixels
                        } = brush.data;
    
                        for( const row of triangle.rows ) {
                            for( let column=0; column<row.length; column++ ) {
                                const p = add( row.start , scale( row.step , column ) );
                                const bp = sub( p , xyz );
                                const bx = dot( bp , xAxis );
                                const by = dot( bp , yAxis );
                                const bz = dot( bp , zAxis );
                                if( bx > -xEdge && bx < xEdge &&
                                    by > -yEdge && by < yEdge &&
                                    bz > -zEdge && bz < zEdge ) {
                                    const i = ( offset + row.i + column ) * 3;
                                    
                                    //get head alpha at xy
                                    const hx = parseInt( ( ( bx + ( fw / 2 ) ) / fw ) * hw );
                                    const hy = parseInt( ( ( by + ( fh / 2 ) ) / fh ) * hh );
                                    const hi = ( hx + ( hy * hw ) ) * 4;
    
                                    //existing texture color
                                    const tr = texture[ i + 0 ];
                                    const tg = texture[ i + 1 ];
                                    const tb = texture[ i + 2 ];
    
                                    //blend color
                                    const blai = blendData[ hi + 3 ];
                                    const bla = blai / 255;
    
                                    const blr = ( blai ) ? blendData[ hi + 0 ] : tr;
                                    const blg = ( blai ) ? blendData[ hi + 1 ] : tg;
                                    const blb = ( blai ) ? blendData[ hi + 2 ] : tb;
    
                                    const ibla = 1.0 - bla;
    
                                    //pick up blend color
                                    const pf = smear;
                                    blendData[ hi + 0 ] = Math.sqrt( (bla * (blr**2)) + (ibla * (tr**2)) );
                                    blendData[ hi + 1 ] = Math.sqrt( (bla * (blg**2)) + (ibla * (tg**2)) );
                                    blendData[ hi + 2 ] = Math.sqrt( (bla * (blb**2)) + (ibla * (tb**2)) );
                                    blendData[ hi + 3 ] = pf * 255;
    
                                    //brush head color; todo: what for?
                                    //const hr = head[ hi + 0 ];
                                    //const hg = head[ hi + 1 ];
                                    //const hb = head[ hi + 2 ];
                                    const ha = headData[ hi + 3 ] / 255;
                                    
                                    //paint alpha
                                    const a = ba * ha;
                                    const ia = 1.0 - a;
    
                                    //paint = mix( blend, color )
                                    const blf = blend;
                                    const iblf = 1.0 - blf;
                                    const pr = Math.sqrt( (iblf * (r**2)) + (blf * (blr**2)) );
                                    const pg = Math.sqrt( (iblf * (g**2)) + (blf * (blg**2)) );
                                    const pb = Math.sqrt( (iblf * (b**2)) + (blf * (blb**2)) );
    
                                    texture[ i + 0 ] = Math.sqrt( (a * (pr**2)) + (ia * (tr**2)) );
                                    texture[ i + 1 ] = Math.sqrt( (a * (pg**2)) + (ia * (tg**2)) );
                                    texture[ i + 2 ] = Math.sqrt( (a * (pb**2)) + (ia * (tb**2)) );
                                }
                            }
                        }
    
                        edit.pipelines.mesh.requestTextureUpdate();
                    },
                    //sphere brush with threshhold radius cutoff
                    'hard-sphere': ( xyz , triangle , brush ) => {
                        const { sub , dot , scale , div , add , len , lenSq } = edit.math.vector;
    
                        const p = sub( xyz , triangle.corner );
    
                        //project point to triangle's plain
                        const p0x = dot( p , triangle.long ) / triangle.long.lengthSquared;
                        const p0y = dot( p , triangle.height ) / triangle.height.lengthSquared;
    
                        //compute xyz of p0 (relative to triangle corner)
                        const p0 = add( scale( triangle.long , p0x ), scale( triangle.height , p0y ) );
    
                        //compute distance from point to plane
                        const depth = len( sub( p , p0 ) );
    
                        //compute row start and end at this height
                        const rowStart = p0y * triangle.median;
                        const rowEnd = 1 - ( p0y * ( 1 - triangle.median ) );
    
                        const isInTriangle = ( p0y >= 0 && p0y <= 1 ) && ( p0x >= rowStart && p0x <= rowEnd );
    
                        //Next, loop over rows, project xyz onto row,
                        //  get start / end of influence on row based on brush radius
                        //  cast each pixel in influence onto brush space
                        //  use that to casting to decide whether to paint / what to paint that pixel
    
                        //for now, loop every pixel; could instead compute start / end of loop
                        const texture = edit.pipelines.mesh.textureArray;
                        const radiusSquared = brush.radius**2;
                        const r = parseInt( brush.r * 255 );
                        const g = parseInt( brush.g * 255 );
                        const b = parseInt( brush.b * 255 );
                        const a = brush.opacity;
                        const ia = 1.0 - a;
                        for( const row of triangle.rows ) {
                            for( let column=0; column<row.length; column++ ) {
                                const p = add( row.start , scale( row.step , column ) );
                                const d = lenSq( sub( xyz , p ) );
                                if( d < radiusSquared ) {
                                    const i = ( row.i + column ) * 3;
                                    texture[ i + 0 ] = Math.sqrt( (a * (r**2)) + (ia * (texture[ i + 0 ]**2)) );
                                    texture[ i + 1 ] = Math.sqrt( (a * (g**2)) + (ia * (texture[ i + 1 ]**2)) );
                                    texture[ i + 2 ] = Math.sqrt( (a * (b**2)) + (ia * (texture[ i + 2 ]**2)) );
                                }
                            }
                        }
    
                        edit.pipelines.mesh.requestTextureUpdate();
                    },
                    //sphere brush with soft gradient to center
                    'soft-sphere': ( xyz , triangle , brush ) => {
                        const { sub , dot , scale , div , add , len , lenSq } = edit.math.vector;
    
                        const p = sub( xyz , triangle.corner );
    
                        //project point to triangle's plain
                        const p0x = dot( p , triangle.long ) / triangle.long.lengthSquared;
                        const p0y = dot( p , triangle.height ) / triangle.height.lengthSquared;
    
                        //compute xyz of p0 (relative to triangle corner)
                        const p0 = add( scale( triangle.long , p0x ), scale( triangle.height , p0y ) );
    
                        //compute distance from point to plane
                        const depth = len( sub( p , p0 ) );
    
                        //compute row start and end at this height
                        const rowStart = p0y * triangle.median;
                        const rowEnd = 1 - ( p0y * ( 1 - triangle.median ) );
    
                        const isInTriangle = ( p0y >= 0 && p0y <= 1 ) && ( p0x >= rowStart && p0x <= rowEnd );
    
                        //Next, loop over rows, project xyz onto row,
                        //  get start / end of influence on row based on brush radius
                        //  cast each pixel in influence onto brush space
                        //  use that to casting to decide whether to paint / what to paint that pixel
    
                        //for now, loop every pixel; could instead compute start / end of loop
                        const texture = edit.pipelines.mesh.textureArray;
                        const radiusSquared = brush.radius**2;
                        const r = parseInt( brush.r * 255 );
                        const g = parseInt( brush.g * 255 );
                        const b = parseInt( brush.b * 255 );
                        const opacity = brush.opacity;
                        for( const row of triangle.rows ) {
                            for( let column=0; column<row.length; column++ ) {
                                const p = add( row.start , scale( row.step , column ) );
                                const d = lenSq( sub( xyz , p ) );
                                if( d < radiusSquared ) {
                                    const i = ( row.i + column ) * 3;
                                    const a = (1.0 - ( d / radiusSquared )) * opacity;
                                    const ia = 1.0 - a;
                                    texture[ i + 0 ] = Math.sqrt( (a * (r**2)) + (ia * (texture[ i + 0 ]**2)) );
                                    texture[ i + 1 ] = Math.sqrt( (a * (g**2)) + (ia * (texture[ i + 1 ]**2)) );
                                    texture[ i + 2 ] = Math.sqrt( (a * (b**2)) + (ia * (texture[ i + 2 ]**2)) );
                                }
                            }
                        }
    
                        edit.pipelines.mesh.requestTextureUpdate();
                    },
                },
                copyTextureToTexture: ( src , srcArray , dst , dstArray ) => {
                    //see notebook, way too much for comment. :-/
                    const h = 0.8660254037844386;
                    const b = -0.43301270189221935;
                    const maps = [
                        {"k":{"x":0,"y":0},"vx":{"x":1,"y":0,"lenSq":1},"vy":{"x":0,"y":h,"lenSq":0.75}},
                        {"k":{"x":0,"y":0},"vx":{"x":0.5,"y":h,"lenSq":1},"vy":{"x":0.75,"y":b,"lenSq":0.75}},
                        {"k":{"x":1,"y":0},"vx":{"x":-1,"y":0,"lenSq":1},"vy":{"x":0,"y":h,"lenSq":0.75}},
                        {"k":{"x":1,"y":0},"vx":{"x":-0.5,"y":h,"lenSq":1},"vy":{"x":-0.75,"y":b,"lenSq":0.75}},
                        {"k":{"x":0.5,"y":h},"vx":{"x":-0.5,"y":-h,"lenSq":1},"vy":{"x":0.75,"y":b,"lenSq":0.75}},
                        {"k":{"x":0.5,"y":h},"vx":{"x":0.5,"y":-h,"lenSq":1},"vy":{"x":-0.75,"y":b,"lenSq":0.75}}
                    ];
                    let mapIndex;
    
                    if( dst.corner.i === src.corner.i && dst.shortEnd.i === src.shortEnd.i ) mapIndex = 0; //good
                    else if( dst.corner.i === src.corner.i && dst.shortEnd.i === src.longEnd.i ) mapIndex = 1; //good
                    else if( dst.corner.i === src.longEnd.i && dst.shortEnd.i === src.shortEnd.i ) mapIndex = 2; //good
                    else if( dst.corner.i === src.shortEnd.i && dst.shortEnd.i === src.longEnd.i ) mapIndex = 3; //good
                    else if( dst.corner.i === src.longEnd.i && dst.shortEnd.i === src.corner.i ) mapIndex = 4; //good
                    else if( dst.corner.i === src.shortEnd.i && dst.shortEnd.i === src.corner.i ) mapIndex = 5; //good
                    
                    const t = maps[ mapIndex ];
                    
                    const rcToXY = ( rf,cf ) => {
                        const fy = rf;
                        const rowLength = 1.0 - fy;
                        const rowStart = (1.0-rowLength) / 2.0;
                        const fx = rowStart + rowLength*cf;
                        return {
                            x: fx,
                            y: fy * h
                        }
                    }
                    
                    //NOT an inverse of above function, assumes fy = 0->1, above fy = 0->h
                    const xyToRC = ( fx,fy ) => {
                        //const rf = fy / h;
                        const rf = fy; //xy from dots, not from RC
                        const rowLength = 1.0 - rf;
                        const rowStart = ( 1.0-rowLength ) / 2.0;
                        const cf = ( fx - rowStart ) / rowLength;
                        return {
                            r: rf,
                            c: cf
                        }
                    }
    
                    const { add , sub , dot , scale } = edit.math.vector2;
    
                    for( let y=0; y<dst.rows.length; y++ ) {
    
                        let rf = y / dst.rows.length;
    
                        const row = dst.rows[ y ];
    
                        for( let x=0; x<row.length; x++ ) {
    
                            let cf = x / row.length;
    
                            const xy = rcToXY( rf,cf );
    
                            let r , g , b;
    
                            {
    
                                const dxy = sub( xy , t.k );
                                const dx = dot( dxy , t.vx ) / t.vx.lenSq;
                                const dy = dot( dxy , t.vy ) / t.vy.lenSq;
    
                                const { r: R , c: C } = xyToRC( dx , dy );
    
                                //clamp floating point errors (these are geometric dots after all, might be slightly out of triangle)
    
                                const row = src.rows[ parseInt( Math.max( 0 , Math.min( R * src.rows.length , src.rows.length-1 ) ) ) ];
    
                                const column = parseInt( Math.max( 0 , Math.min( row.length * C , row.length-1 ) ) )
    
                                const i = ( row.i + column ) * 3;
    
                                r = srcArray[ i + 0 ];
                                g = srcArray[ i + 1 ];
                                b = srcArray[ i + 2 ];
    
                            }
    
                            const i = ( row.i + x ) * 3;
    
                            dstArray[ i + 0 ] = r;
                            dstArray[ i + 1 ] = g;
                            dstArray[ i + 2 ] = b;
                        }
                    }
    
                },
    
                triangle: {
                    getTriangleColorAtFloat: ( cr , triangle , textureArray ) => {
                        const { columnRowFloatToInt , columnRowIntToI } = 
                            edit.pipelines.mesh.triangle;
                        const crInt = columnRowFloatToInt( cr, triangle );
                        const i = columnRowIntToI( crInt , triangle ) * 3;
                        return { 
                            r: textureArray[ i+0 ],
                            g: textureArray[ i+1 ],
                            b: textureArray[ i+2 ],
                        }
                    },
                    setTriangleColorAtFloat: ( cr , triangle , textureArray , color ) => {
                        //This has no undo function!
                        const { columnRowFloatToInt , columnRowIntToI } = 
                            edit.pipelines.mesh.triangle;
                        const crInt = columnRowFloatToInt( cr, triangle );
                        const i = columnRowIntToI( crInt , triangle ) * 3;
                        const formerColor = { 
                            r: textureArray[ i+0 ] / 255,
                            g: textureArray[ i+1 ] / 255,
                            b: textureArray[ i+2 ] / 255,
                        }
                        textureArray[ i+0 ] = color.r * 255;
                        textureArray[ i+1 ] = color.g * 255;
                        textureArray[ i+2 ] = color.b * 255;
                        edit.pipelines.mesh.textureNeedsUpdate = true;
                        return formerColor;
                    },
    
                    iToRectangleIntXY: ( i , width ) => {
                        //convert an array index into an x,y coordinate
                        //  in a rectangular array of width
                        // (not used at the moment, here as reference for shader code)
                        const x = i % width;
                        const y = ( i - x ) / width;
                        return { x , y };
                    },
                    columnRowIntToI: ( cr , triangle ) => {
                        const { r , c } = cr;
                        const { widthInt , decayInt } = triangle;
    
                        const decayCount = Math.max( 0 , r - 1 );
    
                        const offset = c + 
                            ( ( widthInt * r ) -
                            ( decayInt * decayCount * ( decayCount + 1 ) / 2 ) );
    
                        //Note: how is x/2 above guaranteed to be an integer?
    
                        //  (r+1)/2    is a fraction only when r is even
    
                        //  (x/2) * [any even number]   will always be an integer
                        
                        return offset;
                    },
                    columnRowFloatToInt: ( cr , triangle ) => {
                        //where row is 0->1 the texture's rows,
                        //and where column is a float 0->1 on that particular row
                        const unclampedRowInt = parseInt( cr.r * triangle.rowsInt );
                        const clampedRowInt = Math.max( 0 , Math.min( (triangle.rowsInt-1) , unclampedRowInt ) );
                        const rowLengthInt = triangle.widthInt - ( triangle.decayInt * clampedRowInt );
                        const unclampedColumnInt = parseInt( cr.c * rowLengthInt );
                        const clampedColumnInt = Math.max( 0 , Math.min( (rowLengthInt-1) , unclampedColumnInt ) );
                        
                        return {
                            c: clampedColumnInt,
                            r: clampedRowInt,
                        }
                    },
                    buildRows: ( rowsInt, widthInt, decayInt ) => {
                        const rows = [];
    
                        for( let y=0; y<rowsInt; y++ ) {
    
                            const length = widthInt - ( y * decayInt );
    
                            const decayCount = Math.max( 0 , y - 1 );
                            const i = ( ( widthInt * y ) - ( decayInt * decayCount * ( decayCount + 1 ) / 2 ) );
    
                            const row = { length , i }
    
                            rows.push( row );
                        }
    
                        return rows;
                    },
                    updateFace: face => {
                        const mesh = edit.pipelines.mesh;
    
                        const { resolutionPixelsPerUnitDistance } = settings;
    
                        //live references
                        const p0 = mesh.vertices[ face.a ];
                        const p1 = mesh.vertices[ face.b ];
                        const p2 = mesh.vertices[ face.c ];
        
                        const { cross,sub,lenSq,len,dot,norm,scale,add } = edit.math.vector;
    
                        const leftSide = sub( p2 , p0 );
                        leftSide.lengthSquared = lenSq( leftSide );
                        leftSide.length = len( leftSide );
                        Object.freeze( leftSide );
    
                        const topSide = sub( p1 , p0 );
                        topSide.lengthSquared = lenSq( topSide );
                        topSide.length = len( topSide );
                        Object.freeze( topSide );
    
                        //true face normal (for hit depth detection)
                        const faceNormal = cross( leftSide , topSide );
                        faceNormal.lengthSquared = lenSq( faceNormal );
                        faceNormal.length = len( faceNormal );
                        Object.freeze( faceNormal );
    
    
                        //given 3 xyz points
                        //find longest, shortest, remaining edges
                        const edges = [
                            { a:p0 , b:p1 , lengthSquared: lenSq( sub( p0 , p1 ) ) },
                            { a:p1 , b:p2 , lengthSquared: lenSq( sub( p1 , p2 ) ) },
                            { a:p2 , b:p0 , lengthSquared: lenSq( sub( p2 , p0 ) ) },
                        ]
                        edges.sort( (a,b) => b.lengthSquared-a.lengthSquared );
                        const [ longest , , shortest ] = edges;
                    
                        //point: corner: shared vertex of longest and shortest edges
                        let corner = null; //Do Not Freeze: live reference
                        let shortEnd = null; //Do Not Freeze: live reference
                        if( longest.a === shortest.a ) {
                            corner = longest.a;
                            shortEnd = shortest.b;
                        }
                        else if( longest.b === shortest.a ) {
                            corner = longest.b;
                            shortEnd = shortest.b;
                        }
                        else if( longest.a === shortest.b ) {
                            corner = longest.a;
                            shortEnd = shortest.a;
                        }
                        else if( longest.b === shortest.b ) {
                            corner = longest.b;
                            shortEnd = shortest.a;
                        }
                        let longEnd; //Do Not Freeze: live reference
                        if( corner !== p0 && shortEnd !== p0 ) longEnd = p0;
                        else if( corner !== p1 && shortEnd !== p1 ) longEnd = p1;
                        else if( corner !== p2 && shortEnd !== p2 ) longEnd = p2;
    
                        //corner, shortEnd, and longEnd are aliases to live vertex references
    
                        //vectors: long, height, short, remaining
                        //  - long: from corner, longest edge
                        const vLong = { a: corner , b: ( longest.a === corner ) ? longest.b : longest.a };
                        { 
                            const { x,y,z } = sub( vLong.b,vLong.a ); 
                            vLong.x = x; vLong.y = y; vLong.z = z; 
                            vLong.lengthSquared = lenSq( vLong );
                            vLong.length = len( vLong );
                            Object.freeze( vLong );
                        }
                        //  - short: from corner, shortest edge
                        const vShort = { a: corner , b: ( shortest.a === corner ) ? shortest.b : shortest.a };
                        { const { x,y,z } = sub( vShort.b,vShort.a ); 
                            vShort.x = x; vShort.y = y; vShort.z = z; 
                            vShort.lengthSquared = lenSq( vShort );
                            vShort.length = len( vShort );
                            Object.freeze( vLong );
                        }
                        //  - remaining: from opposite end of long to opposite end of short
                        const vRemaining = { a: vLong.b , b: vShort.b }
                        { const { x,y,z } = sub( vRemaining.b,vRemaining.a ); 
                            vRemaining.x = x; vRemaining.y = y; vRemaining.z = z; 
                            vRemaining.lengthSquared = lenSq( vRemaining );
                            vRemaining.length = len( vRemaining );
                            Object.freeze( vLong );
                        }
    
                        //  - absoluteNormal: long*short (not to be confused with face outside-normal)
    
                        const vaNormal = norm( cross( vLong , vShort ) );
                        Object.freeze( vaNormal );
    
                        //  - height: long*normal, scaled to length of short projected onto it
                        const vHeightNorm = norm( cross( vaNormal , vLong ) );
                        const vHeight = scale( vHeightNorm , dot( vShort , vHeightNorm ) );
                        vHeight.lengthSquared = lenSq( vHeight );
                        Object.freeze( vHeight );
    
                        //  - median: range 0->1 how far the triangle's middle is along its long edge
                        const median = dot( vShort , vLong ) / vLong.lengthSquared;
                   
    
                        const widthInt = parseInt( len( vLong ) * resolutionPixelsPerUnitDistance );
    
                        const idealHeightPixels = len( vHeight ) * resolutionPixelsPerUnitDistance;
    
                        const decayInt = parseInt( widthInt / idealHeightPixels );
    
                        const unclampedRowsInt = parseInt( widthInt / decayInt ) + 1;
    
                        //avoid the last row containing 0 pixels:
                        const clampedRowsInt =
                            ( ( unclampedRowsInt * decayInt ) === widthInt ) ?
                            ( unclampedRowsInt - 1 ) : unclampedRowsInt;
                            
                        //clampedRowsInt is our actual texture height in pixels
                        
                        //const lengthInt = ( widthInt - 0*decayInt ) + ( widthInt - 1*decayInt ) + ... + ( widthInt - clampedRowsInt*decayInt );
                        const decayCount = clampedRowsInt - 1;
                        const lengthInt = ( ( widthInt * clampedRowsInt ) - 
                            ( decayInt * decayCount * ( decayCount + 1 ) / 2 ) );
                    
                        //center of triangle
                        const center = {
                            x: ( p0.x + p1.x + p2.x ) / 3,
                            y: ( p0.y + p1.y + p2.y ) / 3,
                            z: ( p0.z + p1.z + p2.z ) / 3,
                        }
                        Object.freeze( center );
    
                        //radius of triangle bounding sphere:
                        const radius0 = len( sub( p0 , center ) );
                        const radius1 = len( sub( p1 , center ) );
                        const radius2 = len( sub( p2 , center ) );
    
                        const radius = Math.max( radius0 , radius1 , radius2 );
                        const radiusSquared = radius ** 2;
    
                        //world space texture row start and end coordinates
                        const rows = [];
                        for( let y=0; y<clampedRowsInt; y++ ) {
                            const fy = y / clampedRowsInt;
    
                            const xStart = add( corner , scale( vShort , fy ) );
                            Object.freeze( xStart );
                            const xEnd = add( vLong.b , scale( vRemaining , fy ) );
                            Object.freeze( xEnd );
    
                            const vector = sub( xEnd , xStart );
                            vector.lengthSquared = lenSq( vector );
                            Object.freeze( vector );
    
    
                            const rowLengthInt = widthInt - ( y * decayInt );
    
                            const xStep = scale( vector , 1 / rowLengthInt );
                            Object.freeze( xStep );
    
                            //compute texture i
                            const decayCount = Math.max( 0 , y - 1 );
                            const i = ( ( widthInt * y ) - ( decayInt * decayCount * ( decayCount + 1 ) / 2 ) );
    
                            const row = { 
                                length: rowLengthInt , //int( frozen on row)
    
                                start: xStart , //frozen point
                                step: xStep , //frozen vector
    
                                end: xEnd , //frozen point
                                vector: vector , //frozen vector
    
                                i: i , //int (frozen on row)
                            };
                            Object.freeze( row );
    
                            rows[ y ] = row;
                        }
                        Object.freeze( rows );
    
                        const triangle = {
                            p0,p1,p2, //live references
    
                            //faceNormal, //frozen vector
                            //leftSide,  //frozen vector
                            //topSide, //frozen vector
    
                            corner,  //live reference
                            shortEnd,  //live reference
                            longEnd,  //live reference
                    
                            long: vLong, //frozen vector
                            short: vShort, //frozen vector
                            //remaining: vRemaining, //frozen vector
    
                            //aNormal: vaNormal, //frozen vector
    
                            height: vHeight, //frozen vector
                            median: median, //float (frozen on triangle)
                    
                            widthInt, //int (frozen on triangle)
                            decayInt,  //int (frozen on triangle)
                            rowsInt: clampedRowsInt, //int (frozen on triangle)
                    
                            center , //frozen point
                            radius , //float (frozen on triangle)
                            radiusSquared , //float (frozen on triangle)
                            rows , //frozen array of frozen objects
    
                            textureLength: lengthInt, //int (frozen on triangle)
    
                        };
    
                        Object.freeze( triangle );
        
                        face.triangle = triangle;
                        face.triangleNeedsUpdate = false;
                    }
                },
    
                vertexInstancer: null,
                faceMesh: null,
                faceIndicesArray: null,
                
                config: {
                    vertexColor: { r:1.0,g:1.0,b:1.0 },
                    _vertexSize: 0.01,
                    get vertexSize() { return edit.pipelines.mesh.config._vertexSize },
                    set vertexSize( s ) {
                        edit.pipelines.mesh.config._vertexSize = s;
                        edit.pipelines.mesh.vertexInstancer.material.uniforms.vertexSize.value = s;
                    },
                    _wireThickness: 0.01,
                    get wireThickness() { return edit.pipelines.mesh.config._wireThickness },
                    set wireThickness( t ) {
                        edit.pipelines.mesh.config._wireThickness = t;
                        edit.pipelines.mesh.materials[ 'wireframe' ].uniforms.wireThickness.value = t;
                    },
                    _wireContrast: 0.25,
                    get wireContrast() { return edit.pipelines.mesh.config._wireContrast },
                    set wireContrast( t ) {
                        edit.pipelines.mesh.config._wireContrast = t;
                        edit.pipelines.mesh.materials[ 'wireframe' ].uniforms.textureColorLevel.value = 1.0 - t;
                    },
                },
    
                buildMeshes: () => {
                    const mesh = edit.pipelines.mesh;
                    mesh.buildVertexInstancer();
                    mesh.buildFaceMesh();
                },
                buildVertexInstancer: ()=>{
                    const mesh = edit.pipelines.mesh;
    
                    const geometry = new THREE.SphereGeometry( 1, 7 , 7 );
    
                    const vertexShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform mat4 modelViewMatrix;
                        uniform mat4 projectionMatrix;
                        uniform float vertexSize;
    
                        in vec3 position;
                        in mat4 instanceMatrix;
    
                        void main() {
                            gl_Position = projectionMatrix *
                                modelViewMatrix *
                                instanceMatrix *
                                vec4( position * vertexSize , 1.0 );
                        }
                    `;
    
                    const fragmentShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform vec3 rgb;
    
                        out vec4 finalColor;
                        
                        void main() {
                            finalColor = vec4( 1.0 , 1.0 , 1.0 , 1.0 );
                        }`;
    
                    const { r, g, b } = mesh.config.vertexColor;
    
                    const uniforms = {
                        vertexSize: { value: mesh.config.vertexSize },
                        rgb: { value: [ r, g, b ] },
                    };
    
                    const material = new THREE.RawShaderMaterial( { 
                        uniforms,
                        vertexShader,
                        fragmentShader,
                        side: THREE.DoubleSide,
                    } );
    
                    const vertexInstancer = new THREE.InstancedMesh( geometry , material , mesh.maxVertices );
                    vertexInstancer.count = 0;
    
                    mesh.vertexInstancer = vertexInstancer;
    
                    mesh.config.vertexSize = mesh.config.vertexSize; //update scale
    
                    edit.world.scene.add( vertexInstancer );
                },
                buildFaceMesh: () => {
                    const mesh = edit.pipelines.mesh;
    
                    const positions = new Float32Array( mesh.maxFaces * 3 * 3 );
                    const uvs = new Float32Array( mesh.maxFaces * 2 * 3 );
                    const triangles = new Int32Array( mesh.maxFaces * 4 * 3 );
                    const triangleColors = new Float32Array( mesh.maxFaces * 3 * 3 );
    
                    const indexArray = new Array( mesh.maxFaces );
                    mesh.faceIndicesArray = indexArray;
    
                    const geometry = new THREE.BufferGeometry();
                    geometry.setIndex( indexArray );
                    geometry.setAttribute( 'position' , 
                        new THREE.Float32BufferAttribute( positions , 3 ) );
                    geometry.setAttribute( 'uv' , 
                        new THREE.Float32BufferAttribute( uvs , 2 ) );
                    geometry.setAttribute( 'triangle' , 
                        new THREE.Int32BufferAttribute( triangles , 4 ) );
                    geometry.setAttribute( 'triangleColor' , 
                        new THREE.Float32BufferAttribute( triangleColors , 3 ) );
    
                    const dataTexture = new THREE.DataTexture( 
                        mesh.textureArray , 
                        mesh.textureWidth , 
                        mesh.textureWidth, 
                        THREE.RGBFormat 
                    );
    
                    const uniforms = {
                        'dataTexture': { type:'t' , value: dataTexture },
                        'textureWidth': { type:'i' , value: mesh.textureWidth },
                        'wireThickness': { value: mesh.config.wireThickness },
                        'textureColorLevel': { value: 1.0 - mesh.config.wireContrast },
                    }
    
                    const vertexShader = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform mat4 projectionMatrix;
                        uniform mat4 modelViewMatrix;
    
                        in vec3 position;
                        in vec2 uv;
                        in ivec4 triangle;
                        in vec3 triangleColor;
                        
                        flat out highp int widthInt;
                        flat out highp int rowsInt;
                        flat out highp int decayInt;
                        flat out highp int offsetInt;
    
                        out highp vec2 vUV;
                        out highp vec3 faceColor;
    
                        void main() {
                            vUV = uv;
                            faceColor = triangleColor;
    
                            widthInt = triangle.x;
                            rowsInt = triangle.y;
                            decayInt = triangle.z;
                            offsetInt = triangle.w;
    
                            gl_Position = projectionMatrix *
                                modelViewMatrix *
                                vec4( position , 1.0 );
                        }
                        `;
                    const fragmentShaderTexture = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform sampler2D dataTexture;
                        uniform int textureWidth;
    
                        in highp vec2 vUV;
                        in highp vec3 faceColor;
                        
                        flat in highp int widthInt;
                        flat in highp int rowsInt;
                        flat in highp int decayInt;
                        flat in highp int offsetInt;
    
                        out vec4 finalColor;
    
                        void main() {
                            /* UV to Column Row Floats */
                            highp float columnFloat = vUV.x / max( vUV.y , 0.00001 );
                            highp float rowFloat = 1.0 - vUV.y;
    
                            /* Column Row Floats to Ints */
                            highp float rowsFloat = float( rowsInt );
    
                            highp int rowInt = int( floor( rowFloat * rowsFloat ) );
                            rowInt = clamp( rowInt , 0 , rowsInt-1 );
                    
                            highp int rowLenInt = widthInt - ( decayInt * rowInt );
                            highp float rowLenFloat = float( rowLenInt );
                            
                            highp int columnInt = int( floor( columnFloat * rowLenFloat ) );
                            columnInt = clamp( columnInt , 0 , rowLenInt-1 );
                    
                            /* Column Row Ints to I */
                            highp int decayCount = max( 0 , rowInt-1 );
                            highp int dataI = offsetInt + columnInt +
                                ( ( widthInt * rowInt ) -
                                ( decayInt * decayCount * ( decayCount + 1 ) / 2 ) );
    
                            /* I to Texture Coordinates */
                            highp int dataX = dataI % textureWidth;
                            highp int dataY = ( dataI - dataX ) / textureWidth;
    
                            lowp vec4 dataColor = texelFetch( 
                                dataTexture , ivec2( dataX , dataY ) , 0 );
    
                            highp float offsetFloat = float( offsetInt );
                            highp float textureScale = step( -0.1 , offsetFloat );
                            highp float faceColorScale = 1.0 - textureScale;
    
                            finalColor = vec4( 
                                (dataColor.rgb * textureScale) +
                                (faceColor * faceColorScale), 
                            1.0 );
                        }`;
    
                    const fragmentShaderWireframe = 
                        `#version 300 es
                        precision highp float;
                        precision highp int;
    
                        uniform sampler2D dataTexture;
                        uniform int textureWidth;
                        uniform float wireThickness;
                        uniform float textureColorLevel;
    
                        in highp vec2 vUV;
                        in highp vec3 faceColor;
                        
                        flat in highp int widthInt;
                        flat in highp int rowsInt;
                        flat in highp int decayInt;
                        flat in highp int offsetInt;
    
                        out vec4 finalColor;
    
                        void main() {
                            /* UV to Column Row Floats */
                            highp float columnFloat = vUV.x / max( vUV.y , 0.00001 );
                            highp float rowFloat = 1.0 - vUV.y;
    
                            highp float wireThreshold = (1.0 - wireThickness);
                            highp float wireLight = step( wireThreshold , vUV.y );
                            wireLight = max( wireLight , step( wireThreshold , columnFloat ) );
                            wireLight = max( wireLight , step( wireThreshold , ( 1.0 - columnFloat ) ) );
    
    
                            /* Column Row Floats to Ints */
                            highp float rowsFloat = float( rowsInt );
    
                            highp int rowInt = int( floor( rowFloat * rowsFloat ) );
                            rowInt = clamp( rowInt , 0 , rowsInt-1 );
                    
                            highp int rowLenInt = widthInt - ( decayInt * rowInt );
                            highp float rowLenFloat = float( rowLenInt );
                            
                            highp int columnInt = int( floor( columnFloat * rowLenFloat ) );
                            columnInt = clamp( columnInt , 0 , rowLenInt-1 );
                    
                            /* Column Row Ints to I */
                            highp int decayCount = max( 0 , rowInt-1 );
                            highp int dataI = offsetInt + columnInt +
                                ( ( widthInt * rowInt ) -
                                ( decayInt * decayCount * ( decayCount + 1 ) / 2 ) );
    
                            /* I to Texture Coordinates */
                            highp int dataX = dataI % textureWidth;
                            highp int dataY = ( dataI - dataX ) / textureWidth;
    
                            lowp vec4 dataColor = texelFetch( 
                                dataTexture , ivec2( dataX , dataY ) , 0 );
    
                            highp float offsetFloat = float( offsetInt );
                            highp float textureScale = step( -0.5 , offsetFloat );
                            highp float faceColorScale = 1.0 - textureScale;
    
                            highp vec3 wireWhite = vec3( 1.0,1.0,1.0 ) * wireLight;
    
                            finalColor = vec4( 
                                (dataColor.rgb * textureScale * textureColorLevel) + 
                                (faceColor * faceColorScale * textureColorLevel) +
                                wireWhite, 
                            1.0 );
                        }`;
    
                    const materialTexture = new THREE.RawShaderMaterial( { 
                        uniforms,
                        vertexShader,
                        fragmentShader: fragmentShaderTexture,
                        side:THREE.DoubleSide 
                    } );
    
                    const materialWireframe = new THREE.RawShaderMaterial( { 
                        uniforms,
                        vertexShader,
                        fragmentShader: fragmentShaderWireframe,
                        side:THREE.DoubleSide 
                    } );
    
                    const faceMesh = new THREE.Mesh( geometry , materialWireframe );
    
                    //for meshes with mutating bounds, we must either call computeBoundingSphere() on update, or disable frustum culling
                    faceMesh.frustumCulled = false;
    
                    mesh.faceMesh = faceMesh;
                    mesh.materials = { 
                        'texture': materialTexture , 
                        'wireframe': materialWireframe ,
                    };
                    edit.world.scene.add( faceMesh );
                },
            },
            empty: {
                reset: () => {},
                setup: () => {},
                serializeSave: () => ( { json:'', buffers:{} } ),
                load: () => {},
                render: () => {},

                undoHistory: [],
                redoHistory: [],
                redo: () => {},
                undo: () => {},
                clearUndo: () => {},
                clearRedo: () => {},                
            },
        },
        math: {
            //quaternion to matrix, see: https://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToMatrix/index.htm
            vector: {
                cross: (a,b) => ({
                    x: a.y*b.z - a.z*b.y,
                    y: a.z*b.x - a.x*b.z,
                    z: a.x*b.y - a.y*b.x
                } ),
                add: (a,b) => ({
                    x: b.x+a.x,
                    y: b.y+a.y,
                    z: b.z+a.z,
                } ),
                sub: (a,b) => ({
                    x: a.x-b.x,
                    y: a.y-b.y,
                    z: a.z-b.z,
                } ),
                lenSq: a => a.x**2 + a.y**2 + a.z**2,
                len: a => Math.sqrt(a.x**2 + a.y**2 + a.z**2),
                dot: (a,b) => a.x*b.x + a.y*b.y + a.z*b.z,
                norm: a => {
                    const l = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
                    return { x: a.x/l, y:a.y/l, z:a.z/l }
                },
                scale: (v,s) => ({ x:v.x*s, y:v.y*s, z:v.z*s }),
                set: (d,s) => { d.x=s.x; d.y=s.y; d.z=s.z; },
                mat: ({x,y,z,w},[m0,m1,m2,m3,m4,m5,m6,m7,m8,m9,m10,m11,m12,m13,m14,m15]) => ({
                    x: x*m0 + y*m4 + z*m8 + w*m12,
                    y: x*m1 + y*m5 + z*m9 + w*m13,
                    z: x*m2 + y*m6 + z*m10 + w*m14,
                    w: x*m3 + y*m7 + z*m11 + w*m15,
                }),
            },
            vector2: {
                add: (a,b) => ({
                    x: b.x+a.x,
                    y: b.y+a.y,
                } ),
                sub: (a,b) => ({
                    x: a.x-b.x,
                    y: a.y-b.y,
                } ),
                lenSq: a => a.x**2 + a.y**2,
                len: a => Math.sqrt(a.x**2 + a.y**2),
                dot: (a,b) => a.x*b.x + a.y*b.y,
                norm: a => {
                    const l = Math.sqrt(a.x**2 + a.y**2);
                    return { x: a.x/l, y:a.y/l }
                },
                scale: (v,s) => ({ x:v.x*s, y:v.y*s }),
                set: (d,s) => { d.x=s.x; d.y=s.y; },
            },
            color: {
                rgb2hsl: ( r,g,b ) => {
                    const max = Math.max( r , g , b );
                    const min = Math.min( r , g , b );
                    const l = (max + min) / 2;
                    if( max === min ) return { h:0 , s:0 , l }
                    const d = max - min;
                    let s = d / ( ( l > 0.5 ) ? ( ( 2 - max ) - min ) : ( max + min ) );
                    let h;
                    if( r === max ) h = ( ( g - b ) / d ) + ( 6 * ( g < b ) );
                    if( g === max ) h = ( ( b - r ) / d ) + 2;
                    if( b === max ) h = ( ( r - g ) / d ) + 4;
                    h /= 6;
                    return { h, s, l }
                },
                hsl2rgb: (h,s,l) => {
                    let r, g, b;
        
                    if (s == 0) r = g = b = l; // achromatic
                    else {
                        const hue2rgb = (p, q, t) => {
                            if (t < 0) t += 1;
                            if (t > 1) t -= 1;
                            if (t < 1/6) return p + (q - p) * 6 * t;
                            if (t < 1/2) return q;
                            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                            return p;
                        }
        
                        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                        const p = 2 * l - q;
        
                        r = hue2rgb(p, q, h + 1/3);
                        g = hue2rgb(p, q, h);
                        b = hue2rgb(p, q, h - 1/3);
                    }
                    return {r,g,b};
                },
            }
        }
    }
    
    edit.threejs.setup();
    edit.threejs.start();
    
    window.settings = settings;
    window.edit = edit;

} )();
