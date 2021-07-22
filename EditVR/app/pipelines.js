import { edit } from './edit.js';
import { install as installBrush } from './pipelines/brush.js';
import { install as installMesh } from './pipelines/mesh.js';

const install = () => {

    edit.pipelines = {};

    installBrush();
    installMesh();

}

export { install }
