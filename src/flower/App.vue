<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, shallowRef } from 'vue';
import { Engine } from './engine';
import { randomPick, random } from './utils/math';

import { BasicFlower } from './shapes/BasicFlower';
import { BezierFlower } from './shapes/BezierFlower';

const $canvas = ref<HTMLCanvasElement>();
const engine = shallowRef<Engine>();

const initialNum = 100;

const flowerStore = [
    BasicFlower,
    BezierFlower,
];


function addFlower(x: number, y: number, color?: string) {
    const flower = new (randomPick(flowerStore))(engine.value.ctx);
    flower.set({
        x,
        y,
    });

    engine.value.add(flower);
}

function click(e: MouseEvent) {
    addFlower(
        e.pageX,
        e.pageY
    )
}

function render() {
    if (!$canvas.value) {
        return;
    }
    engine.value = new Engine($canvas.value)
    engine.value.play();

    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;

    let i = initialNum;
    while (i-- > 0) {
        addFlower(random(w), random(h));
    }
}


onMounted(render);

</script>

<template>
    <div>
        <canvas ref="$canvas" class="canvas" @click="click"></canvas>
    </div>
</template>

<style>
body {
    background: #fffaf3;
}
</style>

<style scoped>
.canvas {
    width: 100vw;
    height: 100vh;
}
</style>
