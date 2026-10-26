<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ImageAsset } from '../types';
import { RawRenderer } from '../engine/renderer';

const props = withDefaults(defineProps<{ asset?: ImageAsset; compare: number; split: number; zoom: number }>(), { asset: undefined });
const emit = defineEmits<{ histogram: [pixels: Uint8ClampedArray]; 'update:split': [value: number] }>();
const container = ref<HTMLDivElement>(), canvas = ref<HTMLCanvasElement>(), stage = ref<HTMLDivElement>();
let renderer: RawRenderer | undefined, source: ImageBitmap | undefined, frame = 0, resizeObserver: ResizeObserver | undefined, dragging = false;

function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; void render(); }); }
async function render() {
    await nextTick();
    const asset = props.asset, box = container.value, target = canvas.value;
    if (!asset?.bitmap || !box || !target) return;
    try {
        renderer ??= new RawRenderer(target);
        if (source !== asset.bitmap) { renderer.setSource(asset.bitmap); source = asset.bitmap; }
        const availableWidth = Math.max(100, box.clientWidth - 42), availableHeight = Math.max(100, box.clientHeight - 42);
        const ratio = asset.bitmap.width / asset.bitmap.height;
        const width = Math.min(availableWidth, availableHeight * ratio) * props.zoom, height = width / ratio;
        target.style.width = `${width}px`; target.style.height = `${height}px`;
        if (stage.value) { stage.value.style.width = `${width}px`; stage.value.style.height = `${height}px`; }
        renderer.render(asset.adjustments, { width: Math.min(asset.bitmap.width, Math.round(width * Math.min(devicePixelRatio, 2))), compare: props.compare, split: props.split });
        emit('histogram', renderer.readPixels());
    } catch (error) { console.error(error); }
}

function moveSplit(event: PointerEvent) {
    if (!dragging || !stage.value) return;
    const rect = stage.value.getBoundingClientRect();
    emit('update:split', Math.max(.02, Math.min(.98, (event.clientX - rect.left) / rect.width)));
}

watch(() => [props.asset?.id, props.asset?.bitmap], schedule);
watch(() => props.asset?.adjustments, schedule, { deep: true });
watch(() => [props.compare, props.split, props.zoom], schedule);
onMounted(() => { resizeObserver = new ResizeObserver(schedule); if (container.value) resizeObserver.observe(container.value); schedule(); });
onBeforeUnmount(() => { resizeObserver?.disconnect(); if (frame) cancelAnimationFrame(frame); renderer?.dispose(); });
</script>

<template>
    <div ref="container" class="image-viewer" :class="{ comparing: compare === 2 }">
        <template v-if="asset?.bitmap">
            <div ref="stage" class="canvas-stage">
                <canvas ref="canvas" aria-label="当前图片调整预览" />
                <button v-if="compare === 2" class="split-line" type="button" aria-label="拖动原图对比分割线" :style="{ left: `${split * 100}%` }" @pointerdown="dragging = true; ($event.target as Element).setPointerCapture($event.pointerId)" @pointermove="moveSplit" @pointerup="dragging = false"><span>‹ ›</span></button>
            </div>
            <div v-if="compare === 2" class="compare-labels"><span>原图</span><span>调整后</span></div>
        </template>
        <div v-else-if="asset?.loading" class="viewer-status" role="status"><span class="spinner" /><strong>正在解码 RAW</strong><small>LibRaw WASM · 本地处理</small></div>
        <div v-else-if="asset?.error" class="viewer-status error"><strong>无法解码此图片</strong><small>{{ asset.error }}</small></div>
        <slot v-else />
    </div>
</template>

<style lang="scss" scoped>
.image-viewer { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: auto; background-color: #1d1d1d; background-image: linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
.canvas-stage { position: relative; flex: none; box-shadow: 0 2px 16px #0008; canvas { display: block; } }
.split-line { position: absolute; top: 0; bottom: 0; width: 2px; padding: 0; border: 0; background: #fff; cursor: ew-resize; touch-action: none; span { position: absolute; top: 50%; left: 50%; width: 32px; height: 32px; transform: translate(-50%, -50%); border: 1px solid #ddd; border-radius: 50%; background: #222d; color: white; font-size: 16px; line-height: 28px; white-space: nowrap; } }
.compare-labels { position: absolute; inset: 10px 14px auto; display: flex; justify-content: space-between; pointer-events: none; span { padding: 3px 7px; background: #0009; color: #ddd; font-size: 10px; } }
.viewer-status { display: flex; flex-direction: column; align-items: center; gap: 9px; color: #ddd; strong { font-size: 14px; font-weight: 400; } small { color: #888; font-size: 11px; } &.error { color: #e48a8a; } }
.spinner { width: 32px; height: 32px; border: 2px solid #ffffff26; border-top-color: #eee; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
