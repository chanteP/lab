<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { simpleInit } from '../common/gl';
import { loadImage } from '../common/image';
// import ImageNoise from '../common/gl/noise.base64';
import ImageMoon from './moon.jpg';

import frag from './frag.glsl';

const $canvas = ref<HTMLCanvasElement>()

onMounted(async () => {
    const { gl, play, injectTexture } = simpleInit($canvas.value!, {
        frag,
    });

    injectTexture('iChannel0', 0, await loadImage(ImageMoon));
    play()
});
</script>

<template>
    <div>
        <canvas ref="$canvas" class="canvas"></canvas>
    </div>
</template>

<style>
body {
    background: linear-gradient(180deg, #060015, rgb(24, 0, 67));
}
</style>

<style scoped>
.canvas {
    width: 100vw;
    height: 100vh;
}
</style>
