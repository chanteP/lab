import { createGlContext, ensureCanvas, setBlend, renderFullScreenCanvas } from '../common/gl';
import frag from './frag.glsl';

async function main() {
    const { gl, play } = renderFullScreenCanvas({
        main: frag,
        autoPlay: true,
        // fps:1,
        clearColor: [1,1,1,0],
        useLastView: true,
    });
}

main();
