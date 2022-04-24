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
// 平行光
defineVec('lightColor', [.3, .2, .1]);
defineVec('lightDirection', [0.5, 3.0, 4.0])
// 环境光
defineVec('ambientLightColor', [0, 0, 0.2]);
// 点光
defineVec('pointLightColor', [.7, .7, .7]);
// defineVec('pointLightPosition', [1.1, 1.1, 1.1]);

const vertices = [   // Coordinates
    1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, // v0-v1-v2-v3 front
    1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, // v0-v3-v4-v5 right
    1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, // v0-v5-v6-v1 up
    -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, // v1-v6-v7-v2 left
    -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0, // v7-v4-v3-v2 down
    1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0  // v4-v7-v6-v5 back
];

const normals = [    // Normal
    0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,  // v0-v1-v2-v3 front
    1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,  // v0-v3-v4-v5 right
    0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0,  // v0-v5-v6-v1 up
    -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0,  // v1-v6-v7-v2 left
    0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0,  // v7-v4-v3-v2 down
    0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0   // v4-v7-v6-v5 back
];

const bufferData = [];
const len = vertices.length / 3;
let i = 0;
while (i < len) {
    bufferData.push(
        ...vertices.slice(i * 3, (i + 1) * 3),
        ...normals.slice(i * 3, (i + 1) * 3),
        ...color,
    );
    i++;
}

console.log(bufferData);

const buffer = defineVertexBuffer(bufferData, [
    ['position', 3],
    ['normal', 3],
    ['color', 4],
], [
    // Indices of the vertices
    0, 1, 2, 0, 2, 3,    // front
    4, 5, 6, 4, 6, 7,    // right
    8, 9, 10, 8, 10, 11,    // up
    12, 13, 14, 12, 14, 15,    // left
    16, 17, 18, 16, 18, 19,    // down
    20, 21, 22, 20, 22, 23     // back
]);

const drawType = gl.TRIANGLES;
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
    // 算4s转一圈，转换成弧度角
    const reg = (time % 4000 / 4000) * 2 * Math.PI;
    // 这里变成光源旋转
    defineVec('pointLightPosition', [
        Math.sin(reg) * 2,
        Math.sin(reg) * 2 + .4,
        Math.cos(reg) * 2,
    ]);

    // 更新坐标
    defineMat('viewMatrix', camera.inverseMatrix);

    // defineMat('clipMatrix', camera.orthographic);
    defineMat('clipMatrix', camera.perspective);

    // 绘制索引，从索引找到顶点，再用顶点绘制图形
    gl.drawElements(drawType, buffer.indicesLength, gl.UNSIGNED_BYTE, 0);
});

console.log(canvas, frag, vert)
