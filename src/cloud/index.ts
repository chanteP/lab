import { renderFullScreenCanvas } from '../common/gl';
import { getNoiseImg } from '../common/gl/getNoise';
import frag from './frag.glsl';

const { gl, play, injectTexture } = renderFullScreenCanvas({
    main: frag,
    autoPlay: true,
});

// document.body.style.background = 'linear-gradient(33deg, #00000038 0%,#261715F5 51%,#ccfcffff 100%), repeating-linear-gradient(216deg, #000 0%,#000000FF 0.8298%,#FF0000FF 1.0003%)';
document.body.style.background = 'linear-gradient(33deg, #000000FF 0%,#261715f5 51%,#6FB7BBFF 100%)';

async function injectNoise() {
    const noise = await getNoiseImg();

    injectTexture('uNoise', 0, noise, {
        texParameteri:{
            [gl.TEXTURE_WRAP_S]: gl.MIRRORED_REPEAT,
            [gl.TEXTURE_WRAP_T]: gl.MIRRORED_REPEAT,
        }
    });
}

injectNoise();
