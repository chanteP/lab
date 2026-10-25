<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { GuitarSynth } from './GuitarSynth';

const props = defineProps<{ synth: GuitarSynth }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let frame = 0;
let lastFrame = 0;
let resize = () => {};

onMounted(() => {
    const element = canvas.value!;
    const context = element.getContext('2d')!;
    const samples = new Float32Array(2048);
    resize = () => {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.round(window.innerWidth * ratio);
        element.height = Math.round(window.innerHeight * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (time: number) => {
        frame = requestAnimationFrame(draw);
        const interval = 1000 / 60;
        if (time - lastFrame < interval * 0.9) return;
        lastFrame = time - ((time - lastFrame) % interval);
        const width = window.innerWidth;
        const height = window.innerHeight;
        context.clearRect(0, 0, width, height);
        const analyser = props.synth.analyser;
        let energy = 0;
        if (analyser) {
            analyser.getFloatTimeDomainData(samples);
            for (let i = 0; i < samples.length; i += 8) energy += samples[i] * samples[i];
            energy = Math.sqrt(energy / (samples.length / 8));
        } else samples.fill(0);

        // 环境细线始终存在；音频出现时由真实输出驱动两层波形。
        const baseline = height * 0.56;
        const amplitude = Math.min(height * 0.38, 55 + energy * 3200);
        for (let layer = 0; layer < 3; layer++) {
            context.beginPath();
            for (let x = 0; x <= width; x += 3) {
                const index = Math.floor(x / width * (samples.length - 1));
                const ambient = Math.sin(x * 0.008 + time * 0.00012 + layer) * 3;
                const y = baseline + samples[index] * amplitude + ambient + (layer - 1) * 14;
                if (x === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
            context.strokeStyle = `rgba(154, 111, 70, ${energy > 0.001 ? 0.17 - layer * 0.035 : 0.025 - layer * 0.005})`;
            context.lineWidth = layer === 0 ? 1.2 : 0.7;
            context.stroke();
        }
        if (energy > 0.001) {
            const glow = context.createRadialGradient(width * 0.5, baseline, 0, width * 0.5, baseline, width * 0.48);
            glow.addColorStop(0, `rgba(188, 143, 93, ${Math.min(0.055, energy * 0.3)})`);
            glow.addColorStop(1, 'rgba(188, 143, 93, 0)');
            context.fillStyle = glow;
            context.fillRect(0, 0, width, height);
        }
    };
    frame = requestAnimationFrame(draw);
});
onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
});
</script>

<template><canvas ref="canvas" class="audio-landscape" aria-hidden="true"></canvas></template>
<style scoped>.audio-landscape { position: fixed; inset: 0; z-index: 0; width: 100vw; height: 100vh; pointer-events: none; }</style>
