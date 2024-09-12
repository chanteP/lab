import { renderFullScreenCanvas } from '../common/gl';
import { getNoiseImg } from '../common/gl/getNoise';
import frag from './frag.glsl';

document.documentElement.style.background = `linear-gradient(180deg, #060015, rgb(24, 0, 67))`;

async function main() {
    const noise = await getNoiseImg();
    const { gl, injectTexture } = renderFullScreenCanvas({
        main: frag,
        autoPlay: true,
    });

    injectTexture('noise', 0, noise);
}

main();
