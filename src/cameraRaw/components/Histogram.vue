<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ pixels?: Uint8ClampedArray; mode: 'rgb' | 'luminance' }>();
const canvas = ref<HTMLCanvasElement>();

watch(() => [props.pixels, props.mode], () => {
    const target = canvas.value; if (!target) return;
    const ctx = target.getContext('2d')!; ctx.clearRect(0, 0, target.width, target.height);
    ctx.fillStyle = '#171717'; ctx.fillRect(0, 0, target.width, target.height);
    if (!props.pixels?.length) return;
    const bins = Array.from({ length: 4 }, () => new Uint32Array(256)), data = props.pixels;
    const stride = Math.max(1, Math.floor(data.length / 4 / 250000));
    for (let p = 0; p < data.length / 4; p += stride) {
        const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        bins[0][r]++; bins[1][g]++; bins[2][b]++; bins[3][Math.round(r * .2126 + g * .7152 + b * .0722)]++;
    }
    const channels = props.mode === 'rgb' ? [0, 1, 2] : [3], colors = ['#f06767', '#65d881', '#6499ee', '#e5e5e5'];
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .7;
    for (const channel of channels) {
        const max = Math.max(...bins[channel], 1); ctx.beginPath(); ctx.moveTo(0, target.height);
        for (let i = 0; i < 256; i++) {
            const y = target.height - Math.sqrt(bins[channel][i] / max) * (target.height - 5);
            ctx.lineTo(i / 255 * target.width, y);
        }
        ctx.lineTo(target.width, target.height); ctx.closePath(); ctx.fillStyle = colors[channel]; ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}, { immediate: true });
</script>

<template><canvas ref="canvas" class="histogram" width="300" height="112" aria-label="图片直方图" /></template>
<style lang="scss" scoped>.histogram { display: block; width: 100%; height: 112px; }</style>
