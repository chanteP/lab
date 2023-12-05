<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { simpleInit } from '../common/gl';
import frag from './frag.glsl'
import { loadImage } from '../common/image';
import { canvas } from '../webgl/gl';

const ImageDemo = '/public/assets/panorama_demo.png';

const $canvas = ref<HTMLCanvasElement>();
let width = 0;
let height = 0;
let instance: ReturnType<typeof simpleInit> = undefined;

const hasTouch = 'ontouchstart' in window;

function rad(value: number) {
    return value * Math.PI / 180;
}
function radOfPercent(value: number) {
    return value * (2 * Math.PI);
}

function calcRotateMat(angles: [number, number, number]) {
    const s1 = Math.sin(angles[0]);
    const s2 = Math.sin(angles[1]);
    const s3 = Math.sin(angles[2]);
    const c1 = Math.cos(angles[0]);
    const c2 = Math.cos(angles[1]);
    const c3 = Math.cos(angles[2]);

    return [
        c2 * c3, -c2 * s3, s2,
        s1 * s2 * c3 + c1 * s3, -s1 * s2 * s3 + c1 * c3, -s1 * c2,
        -c1 * s2 * c3 + s1 * s3, c1 * s2 * s3 + s1 * c3, c1 * c2
    ];
}

function changeEuler(pageX: number, pageY: number) {
    instance.inject('u_rotation', 'uniformMatrix3fv', false, calcRotateMat([
        radOfPercent((pageY - height / 2) / (height)),
        radOfPercent((pageX - width / 2) / (width)),
        0,
    ]));
}

function changeByMouse(e: MouseEvent) {
    if (hasTouch) {
        return;
    }
    changeEuler(e.pageX, e.pageY)
}

function changeByTouch(e: TouchEvent) {
    if (!hasTouch) {
        return;
    }
    changeEuler(e.touches[0].pageX, e.touches[0].pageY)
}

function bindDeviceOrientation() {
    window.addEventListener("deviceorientation", function (event) {
        instance.inject('u_rotation', 'uniformMatrix3fv', false, calcRotateMat([
            rad(event.beta),
            rad(event.alpha),
            rad(event.gamma),
        ])
        );
    }, true);
}

async function setImage(url: string) {
    const image = await loadImage(url);
    instance.injectTexture('u_image', 0, image);
    instance.inject('u_rotation', 'uniformMatrix3fv', false, calcRotateMat([0, 0, 0]));
    instance.inject('u_imageResolution', 'uniform2f', image.naturalWidth, image.naturalHeight);
}

async function initCanvas() {
    const canvasNode = $canvas.value;
    if (!canvasNode) {
        return;
    }

    width = canvasNode.clientWidth;
    height = canvasNode.clientHeight;
    instance = simpleInit(canvasNode, { frag });
    instance.play()
}

function getImageByURL() {
    try {
        return new URLSearchParams(location.search).get('image');
    } catch (e) {
        console.error(e)
    }
}

function setImageByFile(file?: File) {
    if (!file) {
        return;
    }
    const url = URL.createObjectURL(file);
    setImage(url);
}

function dropImage(e: DragEvent) {
    setImageByFile(e.dataTransfer.files[0]);
}
function chooseImageFile(e: InputEvent) {
    setImageByFile(e.dataTransfer.files[0]);
}

function checkPermission() {
    console.log(123)
    window.DeviceMotionEvent?.requestPermission?.()
}


onMounted(async () => {
    await initCanvas();
    setImage(getImageByURL() ?? ImageDemo);
    bindDeviceOrientation();
});

</script>

<template>
    <div class="container" @click="checkPermission" @dragover.prevent @drop="dropImage">
        <canvas ref="$canvas" class="canvas" @mousemove="changeByMouse" @touchmove="changeByTouch"></canvas>
        <label class="choose">
            CHOOSE IMAGE
            <input type="file" accept="image/*" @change="chooseImageFile" hidden />
        </label>
    </div>
</template>

<style scoped>
.container {
    position: fixed;
    width: 100vw;
    height: 100vh;
    font-family: fot-klee-pro;
}

.canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.choose {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    box-sizing: border-box;
    border: 8px dashed rgba(0, 0, 0, .12);
    border-radius: 8px;
    color: rgba(0, 0, 0, .12);
    text-align: center;
    font-size: 60px;
    font-weight: 700;
    opacity: .2;
    transition: opacity 300ms ease 0s;
    cursor: pointer;
}

.choose:hover {
    opacity: 1;
}
</style>
