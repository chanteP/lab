<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Curves, CurveChannel, Point } from '../types';
import { evaluateCurve, normalizePoints } from '../engine/curve';

const props = defineProps<{ modelValue: Curves }>();
const channel = ref<CurveChannel>('rgb');
const active = ref(-1);
const svg = ref<SVGSVGElement>();
const channels: { id: CurveChannel; label: string }[] = [{ id: 'rgb', label: 'RGB' }, { id: 'r', label: 'R' }, { id: 'g', label: 'G' }, { id: 'b', label: 'B' }];
const points = computed(() => props.modelValue[channel.value]);
const path = computed(() => Array.from({ length: 129 }, (_, i) => {
    const x = i / 128; return `${i ? 'L' : 'M'}${(x * 256).toFixed(2)},${((1 - evaluateCurve(points.value, x)) * 256).toFixed(2)}`;
}).join(' '));

function position(event: PointerEvent): Point {
    const rect = svg.value!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)) };
}
function addPoint(event: PointerEvent) {
    if ((event.target as Element).closest('.curve-point')) return;
    const p = position(event); points.value.push(p); props.modelValue[channel.value] = normalizePoints(points.value);
    active.value = points.value.findIndex((item) => item.x === p.x && item.y === p.y);
}
function movePoint(event: PointerEvent) {
    if (active.value < 0) return;
    const p = position(event), list = points.value, index = active.value;
    if (index === 0 || index === list.length - 1) p.x = index === 0 ? 0 : 1;
    else p.x = Math.max(list[index - 1].x + .005, Math.min(list[index + 1].x - .005, p.x));
    list[index] = p;
}
function remove(index: number) {
    if (index > 0 && index < points.value.length - 1) points.value.splice(index, 1);
}
function keyMove(event: KeyboardEvent, index: number) {
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(index); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const p = { ...points.value[index] }, delta = event.shiftKey ? .05 : .01;
    if (event.key === 'ArrowLeft') p.x -= delta; if (event.key === 'ArrowRight') p.x += delta;
    if (event.key === 'ArrowUp') p.y += delta; if (event.key === 'ArrowDown') p.y -= delta;
    points.value[index] = p; props.modelValue[channel.value] = normalizePoints(points.value);
}
</script>

<template>
    <div class="curve-editor">
        <div class="curve-channels" role="tablist" aria-label="曲线通道">
            <button v-for="item in channels" :key="item.id" type="button" role="tab" :aria-selected="channel === item.id" :class="{ active: channel === item.id }" @click="channel = item.id; active = -1">{{ item.label }}</button>
        </div>
        <svg ref="svg" class="curve-grid" viewBox="0 0 256 256" @pointerdown="addPoint" @pointermove="movePoint" @pointerup="active = -1" @pointerleave="active = -1">
            <defs><pattern id="smallGrid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M 64 0 L 0 0 0 64" fill="none" stroke="#4a4a4a" stroke-width="1" /></pattern></defs>
            <rect width="256" height="256" fill="#252525" /><rect width="256" height="256" fill="url(#smallGrid)" />
            <path d="M0 256L256 0" stroke="#555" stroke-width="1" /><path :d="path" fill="none" stroke="#eee" stroke-width="2" />
            <circle v-for="(point, index) in points" :key="index" class="curve-point" :cx="point.x * 256" :cy="(1 - point.y) * 256" r="5" tabindex="0" role="slider" :aria-label="`曲线点 ${index + 1}`" :aria-valuenow="Math.round(point.y * 255)" @pointerdown.stop="active = index; ($event.target as Element).setPointerCapture($event.pointerId)" @dblclick.stop="remove(index)" @keydown="keyMove($event, index)" />
        </svg>
        <div class="curve-axis"><span>0</span><span>64</span><span>128</span><span>192</span><span>255</span></div>
        <p>单击添加控制点 · 双击删除 · 方向键微调</p>
    </div>
</template>

<style lang="scss" scoped>
.curve-channels { display: flex; margin-bottom: 9px; border-bottom: 1px solid #4a4a4a; button { flex: 1; height: 27px; border: 0; background: transparent; color: #aaa; cursor: pointer; &.active { color: #fff; box-shadow: inset 0 -2px #64b9e8; } } }
.curve-grid { display: block; width: 100%; aspect-ratio: 1; touch-action: none; user-select: none; }
.curve-point { fill: #222; stroke: #fff; stroke-width: 2; cursor: move; &:focus { fill: #5eb8e7; outline: none; } }
.curve-axis { display: flex; justify-content: space-between; color: #888; font-size: 9px; }
p { margin: 10px 0 0; color: #888; font-size: 10px; text-align: center; }
</style>
