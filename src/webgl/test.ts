import { mat4, vec4 } from 'gl-matrix';

import { Camera, canvas, createDefine, createProgram, gl, render } from './gl';
import {} from 'gl-matrix';

import frag from './frag.glsl';
import vert from './vert.glsl';

const program = createProgram(vert, frag);
const {
    defineVec,
    defineMat,
    defineTexture,
    defineVertexBuffer,
} = createDefine(gl, program);

// 开深度检测，解决遮盖问题（但是解决不了透明问题）
gl.enable(gl.DEPTH_TEST);

/* 光照(改成用片元着色器实现)*/
//    v6----- v5
//   /|      /|
//  v1------v0|
//  | |     | |
//  | |v7---|-|v4
//  |/      |/
//  v2------v3
const color = [1, 1, 1, 1];

const vertices = [
    1, 1, 0,
     1, -1, 0,
      -1, -1, 0,
       -1, 1, 0,

    1, 1, 1,
    1, -1, 1,
     -1, -1, 1,
      -1, 1, 1,
    ];

const bufferData = [];
const len = vertices.length / 3;
let i = 0;
while (i < len) {
    bufferData.push(
        ...vertices.slice(i * 3, (i + 1) * 3),
        ...color,
    );
    i++;
}

console.log(bufferData);

const buffer = defineVertexBuffer(bufferData, [
    ['position', 3],
    ['color', 4],
], [
    // Indices of the vertices
    0,1,
    1,2,
    2,3,
    3,0,
    3,4,
    5,6,
]);

const drawType = gl.LINES;
// const drawType = gl.POINTS;

const scale = 1;
const camera = new Camera({
    top: canvas.height / canvas.width * scale,
    left: -1 * scale,
    right: 1 * scale,
    bottom: -canvas.height / canvas.width * scale,
    near: 1,
    far: 100,

    // fov: 30 / 360 * 2 * Math.PI,
    fov: 30,
    aspect: canvas.width / canvas.height,
    // aspect: 1,
});

// camera.moveTo([0.20, 0.25, 0.25]);
// camera.moveTo([1, 1, 1]);
const cameraDistance = 10;
camera.moveTo([3, 3, cameraDistance]);
camera.lookAt([0, 0, 0]);

render((time) => {
    // 更新坐标
    defineMat('viewMatrix', camera.inverseMatrix);

    // defineMat('clipMatrix', camera.orthographic);
    defineMat('clipMatrix', camera.perspective);

    defineVec('color', color);

    // 绘制索引，从索引找到顶点，再用顶点绘制图形
    gl.drawElements(drawType, buffer.indicesLength, gl.UNSIGNED_BYTE, 0);
});

console.log(canvas, frag, vert)
