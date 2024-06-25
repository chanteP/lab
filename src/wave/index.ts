import { createGlContext, ensureCanvas, setBlend, renderFullScreenCanvas } from '../common/gl';
import frag from './frag.glsl';

async function main() {
    document.body.style.background = `linear-gradient(180deg, rgb(255 244 208), rgb(84 203 177))`;

    const { gl, play } = renderFullScreenCanvas({
        frag,
        autoPlay: true,
    });
}

main();
