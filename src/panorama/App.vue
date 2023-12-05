<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { simpleInit } from '../common/gl';
import frag from './frag.glsl'
import { loadImage } from '../common/image';
import { canvas } from '../webgl/gl';
import { useDragUtils } from '../common/dragUtils';
import IconCompass from '@vicons/ionicons5/Compass'
import IconImage from '@vicons/ionicons5/Image'

const ImageDemo = '/public/assets/panorama_demo.png';

const $canvas = ref<HTMLCanvasElement>();
let width = 0;
let height = 0;
let instance: ReturnType<typeof simpleInit> = undefined;

const hasTouch = 'ontouchstart' in window;
const touchMoveXY = [0, 0];
const enableOrientation = ref(true);
const { bindTouchEnd, bindTouchMove, bindTouchStart } = useDragUtils({
    enable: () => hasTouch,
    onMove: (x, y) => {
        enableOrientation.value = false;
        changeEuler((touchMoveXY[0] - x) / width, (touchMoveXY[1] - y) / height)
    },
    onEnd: (x, y) => {
        touchMoveXY[0] -= x;
        touchMoveXY[1] -= y;
    },
});

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

function changeEuler(y: number, x: number) {
    instance.inject('u_rotation', 'uniformMatrix3fv', false, calcRotateMat([
        radOfPercent(x),
        radOfPercent(y),
        0,
    ]));
}

function changeByMouse(e: MouseEvent) {
    if (hasTouch) {
        return;
    }
    changeEuler((e.pageX - width / 2) / (width), (e.pageY - height / 2) / (height))
}

function resetCompass() {
    enableOrientation.value = true;
    touchMoveXY[0] = 0;
    touchMoveXY[1] = 0;
}

function bindDeviceOrientation() {
    window.addEventListener("deviceorientation", function (event) {
        if (!enableOrientation.value) {
            return;
        }

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
    window.DeviceMotionEvent?.requestPermission?.().then(permissionState => {
        // if (permissionState === 'granted') {
        bindDeviceOrientation();
        // }
    })
}


onMounted(async () => {
    await initCanvas();
    setImage(getImageByURL() ?? ImageDemo);
});

</script>

<template>
    <div class="container" @click="checkPermission" @dragover.prevent @drop.prevent="dropImage">
        <canvas ref="$canvas" class="canvas" @mousemove="changeByMouse" @touchend="bindTouchEnd" @touchmove="bindTouchMove"
            @touchstart="bindTouchStart"></canvas>

        <div class="tools">
            <label>
                <IconImage class="icon" />
                <input type="file" accept="image/*" @change="chooseImageFile" hidden />
            </label>
            <IconCompass class="icon" :class="{ enable: enableOrientation }" @click="resetCompass" />
        </div>
    </div>
</template>

<style scoped>
.container {
    position: fixed;
    width: 100vw;
    height: 100vh;
    font-family: fot-klee-pro;
    user-select: none;
}

.canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
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

.tools {
    position: fixed;
    bottom: 0;
    right: 0;
    width: 80px;
    font-size: 80px;
    color: #fff;
}

.icon {
    padding: 16px;
    opacity: .3;
}

.icon.enable{
    opacity: .6;
}
</style>
