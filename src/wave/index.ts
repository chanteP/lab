import { createGlContext, ensureCanvas, setBlend, simpleInit } from './gl';
import frag from './frag.glsl';

const ratio = 2;

const canvas = setupCanvas();

const { gl, play } = simpleInit(canvas, {
    frag,
});

// setBlend(gl, 'add');

play();

function setupCanvas() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = ['display:block', 'width: 100vw', 'height: 100vh'].join(';');

    // document.body.style.background = `linear-gradient(135deg, #66d8ff, #80e6b3)`;
    document.body.style.background = `linear-gradient(0deg, rgb(255 244 208), rgb(84 203 177))`;
    // document.body.style.background = `#fff`;
    // `background:linear-gradient(135deg, #00bfff, #00ff7f)`
    document.getElementById('app').appendChild(canvas);

    ensureCanvas(canvas, ratio);

    return canvas;
}
