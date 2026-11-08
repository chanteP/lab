<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ImageAsset, Point } from '../types';
import type { DcpProfile } from '../engine/dcp/types';
import type { ImageMask, MaskShape, MaskTool } from '../engine/masks/types';
import { createShape } from '../engine/masks/mask';
import { RawRenderer } from '../engine/renderer';
import { clampSplit, clampZoom, zoomAtPoint } from '../engine/view';

const props = withDefaults(defineProps<{
    asset?: ImageAsset;
    compare: number;
    split: number;
    zoom: number;
    dcpProfile?: DcpProfile;
    maskTool?: MaskTool | '';
    maskMode?: 'add' | 'subtract';
    activeMask?: ImageMask;
}>(), { asset: undefined, dcpProfile: undefined, maskTool: '', maskMode: 'add', activeMask: undefined });
const emit = defineEmits<{
    histogram: [pixels: Uint8ClampedArray];
    'update:split': [value: number];
    'update:zoom': [value: number];
    shape: [shape: MaskShape];
    'update-shape': [shape: MaskShape];
}>();
const container = ref<HTMLDivElement>(), image = ref<HTMLImageElement>(), stage = ref<HTMLDivElement>();
const previewUrl = ref('');
const presentCanvas = document.createElement('canvas');
const pan = ref({ x: 0, y: 0 }), spacePressed = ref(false), panning = ref(false);
const draft = ref<MaskShape>(), editing = ref<{ shape: MaskShape; handle: string }>();
const stageSize = ref({ width: '0px', height: '0px' });
const stageStyle = computed(() => ({ transform: `translate(${pan.value.x}px, ${pan.value.y}px)`, ...stageSize.value }));
let renderer: RawRenderer | undefined, source: ImageBitmap | undefined, frame = 0, resizeObserver: ResizeObserver | undefined, dragging = false, renderVersion = 0;
let pointerStart = { x: 0, y: 0 }, panStart = { x: 0, y: 0 };

function schedule() {
    const version = ++renderVersion;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; void render(version); });
}
async function render(version: number) {
    await nextTick();
    const asset = props.asset, box = container.value, target = image.value;
    if (version !== renderVersion || !asset?.bitmap || !box || !target) return;
    try {
        renderer ??= new RawRenderer();
        if (source !== asset.bitmap) { renderer.setSource(asset.bitmap); source = asset.bitmap; }
        const availableWidth = Math.max(100, box.clientWidth - 42), availableHeight = Math.max(100, box.clientHeight - 42);
        const ratio = asset.bitmap.width / asset.bitmap.height;
        const width = Math.min(availableWidth, availableHeight * ratio) * props.zoom, height = width / ratio;
        target.style.width = `${width}px`; target.style.height = `${height}px`;
        stageSize.value = { width: `${width}px`, height: `${height}px` };
        renderer.render(asset.adjustments, {
            width: Math.min(asset.bitmap.width, Math.round(width * Math.min(devicePixelRatio, 2))),
            compare: props.compare, split: props.split, profile: props.dcpProfile,
            masks: asset.masks, activeMaskId: props.activeMask?.id,
        });
        const pixels = renderer.readPixels();
        presentCanvas.width = renderer.canvas.width; presentCanvas.height = renderer.canvas.height;
        presentCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), presentCanvas.width, presentCanvas.height), 0, 0);
        previewUrl.value = presentCanvas.toDataURL('image/png');
        if (version === renderVersion && props.asset?.id === asset.id) emit('histogram', pixels);
    } catch (error) { console.error(error); }
}

function pointFromEvent(event: PointerEvent): Point {
    const rect = stage.value!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}
function maskStart(event: PointerEvent) {
    if (!props.maskTool || !stage.value || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointFromEvent(event), shape = createShape(props.maskTool, point.x, point.y, props.maskMode);
    if (shape.type === 'radial') { shape.radiusX = 0; shape.radiusY = 0; }
    if (shape.type === 'linear') shape.end = { ...point };
    draft.value = shape;
    container.value?.setPointerCapture(event.pointerId);
}
function maskMove(event: PointerEvent) {
    if (editing.value) {
        const point = pointFromEvent(event), { shape, handle } = editing.value;
        if (shape.type === 'radial') {
            if (handle === 'center') shape.center = point;
            else if (handle === 'x') shape.radiusX = Math.max(.005, Math.abs(point.x - shape.center.x));
            else shape.radiusY = Math.max(.005, Math.abs(point.y - shape.center.y));
        } else if (shape.type === 'linear') {
            if (handle === 'start') shape.start = point; else shape.end = point;
        }
        emit('update-shape', shape); return;
    }
    const shape = draft.value; if (!shape) return;
    const point = pointFromEvent(event);
    if (shape.type === 'brush') shape.points.push(point);
    else if (shape.type === 'linear') shape.end = point;
    else { shape.radiusX = Math.max(.005, Math.abs(point.x - shape.center.x)); shape.radiusY = Math.max(.005, Math.abs(point.y - shape.center.y)); }
}
function maskEnd() {
    if (editing.value) { editing.value = undefined; return; }
    if (draft.value) { emit('shape', draft.value); draft.value = undefined; }
}
function editShape(shape: MaskShape, handle: string, event: PointerEvent) {
    event.preventDefault(); event.stopPropagation();
    editing.value = { shape: JSON.parse(JSON.stringify(shape)), handle };
    container.value?.setPointerCapture(event.pointerId);
}

function maskClick(event: MouseEvent) {
    // Assistive/programmatic clicks may not include pointerdown/up. A normal
    // drag clears the active tool on shape commit, so this fallback cannot duplicate it.
    if (!props.maskTool || draft.value || !stage.value || event.button !== 0) return;
    const rect = stage.value.getBoundingClientRect(), x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    emit('shape', createShape(props.maskTool, x, y, props.maskMode));
}
function maskKeyboard(event: KeyboardEvent) {
    if (!props.maskTool || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    emit('shape', createShape(props.maskTool, .5, .5, props.maskMode));
}

function moveSplit(event: PointerEvent) {
    if (!dragging || !stage.value) return;
    const rect = stage.value.getBoundingClientRect();
    emit('update:split', clampSplit((event.clientX - rect.left) / rect.width));
}
function startSplit(event: PointerEvent) { dragging = true; (event.currentTarget as Element).setPointerCapture(event.pointerId); }
function endSplit() { dragging = false; }
function wheel(event: WheelEvent) {
    if (!props.asset?.bitmap || !container.value) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.value.clientHeight : 1;
    const delta = event.deltaY * unit, nextZoom = clampZoom(props.zoom * Math.exp(-delta * (event.ctrlKey ? .006 : .0015)));
    if (nextZoom === props.zoom) return;
    const rect = container.value.getBoundingClientRect(), pointer = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    pan.value = zoomAtPoint(pointer, pan.value, props.zoom, nextZoom); emit('update:zoom', nextZoom);
}
function keydown(event: KeyboardEvent) {
    if (event.code !== 'Space' || !props.asset?.bitmap || (event.target as Element).matches('input, select, textarea')) return;
    event.preventDefault(); spacePressed.value = true;
}
function keyup(event: KeyboardEvent) { if (event.code === 'Space') { spacePressed.value = false; panning.value = false; } }
function panStartEvent(event: PointerEvent) {
    if ((!spacePressed.value && event.button !== 1 && event.pointerType !== 'touch' && props.zoom <= 1) || !props.asset?.bitmap) return;
    event.preventDefault(); panning.value = true; pointerStart = { x: event.clientX, y: event.clientY }; panStart = { ...pan.value };
    container.value?.setPointerCapture(event.pointerId);
}
function panMove(event: PointerEvent) { if (panning.value) pan.value = { x: panStart.x + event.clientX - pointerStart.x, y: panStart.y + event.clientY - pointerStart.y }; }
function panEnd() { panning.value = false; }
function resetView() { pan.value = { x: 0, y: 0 }; panning.value = false; }

watch(() => props.asset?.id, () => {
    resetView(); draft.value = undefined;
    // A canvas is a GPU resource, not just a view of the current bitmap. Drop
    // the old context on asset changes so its first frame cannot retain an empty texture.
    renderer?.dispose(); renderer = undefined; source = undefined;
    schedule();
});
watch(() => props.asset?.bitmap, schedule);
watch(() => props.asset?.adjustments, schedule, { deep: true });
watch(() => props.asset?.masks, schedule, { deep: true });
watch(() => props.activeMask, schedule, { deep: true });
watch(() => props.dcpProfile, schedule);
watch(() => [props.compare, props.split], schedule);
watch(() => props.zoom, (value) => { if (value === 1) resetView(); schedule(); });
onMounted(() => {
    resizeObserver = new ResizeObserver(schedule); if (container.value) resizeObserver.observe(container.value); schedule();
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', resetView);
});
onBeforeUnmount(() => {
    renderVersion++; resizeObserver?.disconnect(); if (frame) cancelAnimationFrame(frame); renderer?.dispose();
    window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', resetView);
});
</script>

<template>
    <div ref="container" class="image-viewer" :class="{ comparing: compare === 2, 'can-pan': spacePressed, panning, 'mask-drawing': maskTool }" @wheel.prevent="wheel" @pointerdown="panStartEvent" @pointermove="panMove" @pointerup="panEnd" @pointercancel="panEnd">
        <template v-if="asset?.bitmap">
            <div ref="stage" class="canvas-stage" :style="stageStyle" @pointerdown="maskStart" @pointermove="maskMove" @pointerup="maskEnd" @pointercancel="maskEnd" @click="maskClick">
                <img ref="image" class="preview-image" :src="previewUrl" tabindex="0" aria-label="当前图片调整预览，选择蒙版工具后可按回车创建" @keyup="maskKeyboard" />
                <svg v-if="activeMask || draft" class="mask-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                    <template v-for="shape in activeMask?.shapes ?? []" :key="shape.id">
                        <g v-if="shape.type === 'linear'">
                            <line :x1="shape.start.x" :y1="shape.start.y" :x2="shape.end.x" :y2="shape.end.y" class="mask-guide" />
                            <circle :cx="shape.start.x" :cy="shape.start.y" r=".009" class="mask-handle" @pointerdown="editShape(shape, 'start', $event)" />
                            <circle :cx="shape.end.x" :cy="shape.end.y" r=".009" class="mask-handle" @pointerdown="editShape(shape, 'end', $event)" />
                        </g>
                        <g v-else-if="shape.type === 'radial'">
                            <ellipse :cx="shape.center.x" :cy="shape.center.y" :rx="shape.radiusX" :ry="shape.radiusY" class="mask-guide" />
                            <circle :cx="shape.center.x" :cy="shape.center.y" r=".009" class="mask-handle" @pointerdown="editShape(shape, 'center', $event)" />
                            <circle :cx="shape.center.x + shape.radiusX" :cy="shape.center.y" r=".008" class="mask-handle" @pointerdown="editShape(shape, 'x', $event)" />
                            <circle :cx="shape.center.x" :cy="shape.center.y + shape.radiusY" r=".008" class="mask-handle" @pointerdown="editShape(shape, 'y', $event)" />
                        </g>
                        <polyline v-else :points="shape.points.map((point) => `${point.x},${point.y}`).join(' ')" class="mask-brush-guide" />
                    </template>
                    <template v-if="draft">
                        <line v-if="draft.type === 'linear'" :x1="draft.start.x" :y1="draft.start.y" :x2="draft.end.x" :y2="draft.end.y" class="mask-guide draft" />
                        <ellipse v-else-if="draft.type === 'radial'" :cx="draft.center.x" :cy="draft.center.y" :rx="draft.radiusX" :ry="draft.radiusY" class="mask-guide draft" />
                        <polyline v-else :points="draft.points.map((point) => `${point.x},${point.y}`).join(' ')" class="mask-brush-guide draft" />
                    </template>
                </svg>
                <button v-if="compare === 2" class="split-line" type="button" aria-label="拖动原图对比分割线" :style="{ left: `${split * 100}%` }" @pointerdown.stop="startSplit" @pointermove="moveSplit" @pointerup="endSplit" @pointercancel="endSplit" />
            </div>
            <div v-if="compare === 2" class="compare-labels"><span>原图</span><span>调整后</span></div>
        </template>
        <div v-else-if="asset?.loading" class="viewer-status" role="status"><span class="spinner" /><strong>正在解码 RAW</strong><small>LibRaw WASM · 本地处理</small></div>
        <div v-else-if="asset?.error" class="viewer-status error"><strong>无法解码此图片</strong><small>{{ asset.error }}</small></div>
        <slot v-else />
    </div>
</template>

<style lang="scss" scoped>
.image-viewer { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; touch-action: none; background-color: #1d1d1d; background-image: linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; &.can-pan { cursor: grab; } &.panning { cursor: grabbing; } &.mask-drawing .canvas-stage { cursor: crosshair; } }
.canvas-stage { position: relative; flex: none; box-shadow: 0 2px 16px #0008; .preview-image { display: block; width: 100%; height: 100%; } }
.mask-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.mask-guide { fill: #ff554422; stroke: #fff; stroke-width: 1.5; vector-effect: non-scaling-stroke; pointer-events: none; &.draft { stroke: #ffb0a0; } }
.mask-handle { fill: #fff; stroke: #333; stroke-width: 1; pointer-events: all; cursor: move; vector-effect: non-scaling-stroke; }
.mask-brush-guide { fill: none; stroke: #ff7766; stroke-width: 2; pointer-events: none; vector-effect: non-scaling-stroke; }
.split-line { position: absolute; top: 0; bottom: 0; width: 12px; padding: 0; transform: translateX(-50%); border: 0; background: transparent; cursor: ew-resize; touch-action: none; &::after { content: ''; position: absolute; top: 0; bottom: 0; left: 5px; width: 2px; background: #fff; box-shadow: 0 0 2px #000; } }
.compare-labels { position: absolute; inset: 10px 14px auto; display: flex; justify-content: space-between; pointer-events: none; span { padding: 3px 7px; background: #0009; color: #ddd; font-size: 10px; } }
.viewer-status { display: flex; flex-direction: column; align-items: center; gap: 9px; color: #ddd; strong { font-size: 14px; font-weight: 400; } small { color: #888; font-size: 11px; } &.error { color: #e48a8a; } }
.spinner { width: 32px; height: 32px; border: 2px solid #ffffff26; border-top-color: #eee; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
