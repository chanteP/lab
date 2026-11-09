<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import type { EditPhase, ViewportCallbacks } from '../../engine/Viewport';
import { guideFromRuler, rulerTicks, snapGuideOffsetToRuler, type SketchRulerFrame, type ScreenPoint } from '../../engine/sketchRulers';
import type { SketchReferenceGuide, SketchRulerSide } from '../../types';
import { uid } from '../../utils/id';
import { INTERACTION } from '../../config/const';

const RULER_SIZE = 12;
const RULER_CENTER = RULER_SIZE / 2;
const props = defineProps<{ frame: SketchRulerFrame | null; selectedId: string | null; guideSnapEnabled?: boolean; callbacks: ViewportCallbacks }>();
const root = ref<HTMLElement>();
const drafts = new Map<string, string>();

type PendingDrag = {
    pointerId: number;
    start: ScreenPoint;
    last: ScreenPoint;
    side?: SketchRulerSide;
    guide: SketchReferenceGuide;
    created: boolean;
    started: boolean;
};
let pending: PendingDrag | null = null;

const topTicks = computed(() => props.frame ? rulerTicks(props.frame.origin.x, props.frame.unitsPerPixel, props.frame.width) : []);
const leftTicks = computed(() => props.frame ? rulerTicks(props.frame.origin.y, props.frame.unitsPerPixel, props.frame.height) : []);

function point(event: PointerEvent): ScreenPoint {
    const rect = root.value!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function offsetAt(side: SketchRulerSide, position: ScreenPoint) {
    const frame = props.frame!;
    return guideFromRuler(side, [position.x, position.y], [frame.origin.x, frame.origin.y], frame.unitsPerPixel).offset;
}
function offsetFor(guide: SketchReferenceGuide, position: ScreenPoint) {
    const frame = props.frame!;
    return guide.axis === 'u'
        ? (position.x - frame.origin.x) * frame.unitsPerPixel
        : (frame.origin.y - position.y) * frame.unitsPerPixel;
}
function snappedOffset(guide: SketchReferenceGuide, raw: number) {
    // Reference matching still renders while disabled; the controller returns the raw offset in that state.
    const reference = props.callbacks.onSketchGuideSnap(guide, raw);
    if (props.guideSnapEnabled === false || !props.frame) return raw;
    const tick = snapGuideOffsetToRuler(guide, raw, props.frame, INTERACTION.sketchGuideSnapPx);
    return Math.abs(tick - raw) <= Math.abs(reference - raw) ? tick : reference;
}
function begin(event: PointerEvent, side?: SketchRulerSide, guide?: SketchReferenceGuide) {
    if (event.button !== 0 || !props.frame) return;
    event.preventDefault();
    event.stopPropagation();
    const position = point(event);
    const next = guide ? { ...guide } : { id: uid(), axis: side === 'top' ? 'v' : 'u', offset: 0 } as SketchReferenceGuide;
    pending = { pointerId: event.pointerId, start: position, last: position, side, guide: next, created: false, started: false };
    props.callbacks.onSketchGuideSelect(guide?.id || null);
}
function emit(guide: SketchReferenceGuide, phase: EditPhase) {
    props.callbacks.onSketchGuideChange({ ...guide }, phase);
}
function move(event: PointerEvent) {
    if (!pending || event.pointerId !== pending.pointerId || !props.frame) return;
    const position = point(event);
    pending.last = position;
    const distance = Math.hypot(position.x - pending.start.x, position.y - pending.start.y);
    if (pending.side && !pending.created) {
        const enteredCanvas = pending.side === 'top' ? position.y > RULER_SIZE + 2 : position.x > RULER_SIZE + 2;
        if (!enteredCanvas || distance < 2) return;
        pending.created = true;
        pending.started = true;
        props.callbacks.onSketchGuideSelect(pending.guide.id);
        pending.guide.offset = snappedOffset(pending.guide, offsetAt(pending.side, position));
        emit(pending.guide, 'start');
    } else if (!pending.side && !pending.started) {
        if (distance < 2) return;
        pending.started = true;
        emit(pending.guide, 'start');
    }
    if (!pending.started) return;
    const raw = pending.side ? offsetAt(pending.side, position) : offsetFor(pending.guide, position);
    pending.guide.offset = snappedOffset(pending.guide, raw);
    emit(pending.guide, 'move');
}
function end(event: PointerEvent) {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (pending.started) {
        move(event);
        emit(pending.guide, 'end');
    }
    pending = null;
}
function cancel(event: PointerEvent) {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (pending.started) emit(pending.guide, 'cancel');
    pending = null;
}
function guideValue(guide: SketchReferenceGuide) {
    return drafts.get(guide.id) ?? guide.offset.toFixed(2);
}
function commit(guide: SketchReferenceGuide, input: HTMLInputElement) {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
        drafts.delete(guide.id);
        input.value = guide.offset.toFixed(2);
        return;
    }
    drafts.set(guide.id, input.value);
    props.callbacks.onSketchGuideInput(guide.id, value);
}
function keydown(guide: SketchReferenceGuide, event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    commit(guide, event.currentTarget as HTMLInputElement);
}
function tickLabel(value: number) {
    return String(Number(value.toFixed(4)));
}

watch(() => props.frame?.guides, (guides) => {
    const ids = new Set((guides || []).map((guide) => guide.id));
    drafts.forEach((_, id) => { if (!ids.has(id)) drafts.delete(id); });
}, { deep: true });
useEventListener(window, 'pointermove', move);
useEventListener(window, 'pointerup', end);
useEventListener(window, 'pointercancel', cancel);
</script>

<template>
    <div v-if="frame" ref="root" class="sketch-rulers" :style="{ width: `${frame.width}px`, height: `${frame.height}px` }">
        <svg class="sketch-guide-lines" :width="frame.width" :height="frame.height">
            <template v-for="guide in frame.guides" :key="guide.id">
                <line
                    :x1="guide.axis === 'u' ? guide.x : 0" :y1="guide.axis === 'u' ? 0 : guide.y"
                    :x2="guide.axis === 'u' ? guide.x : frame.width" :y2="guide.axis === 'u' ? frame.height : guide.y"
                    class="sketch-guide-hit" role="button" tabindex="0" aria-label="选择参考线"
                    @pointerdown="begin($event, undefined, guide)"
                    @keydown.enter.prevent="callbacks.onSketchGuideSelect(guide.id)"
                    @keydown.delete.prevent="callbacks.onSketchGuideDelete(guide.id)"
                />
                <line
                    :x1="guide.axis === 'u' ? guide.x : 0" :y1="guide.axis === 'u' ? 0 : guide.y"
                    :x2="guide.axis === 'u' ? guide.x : frame.width" :y2="guide.axis === 'u' ? frame.height : guide.y"
                    class="sketch-guide-line" :class="{ selected: selectedId === guide.id }"
                />
            </template>
        </svg>

        <svg class="sketch-ruler top" :width="frame.width" :height="RULER_SIZE" @pointerdown="begin($event, 'top')">
            <rect :width="frame.width" :height="RULER_SIZE" />
            <g v-for="tick in topTicks" :key="tick.value">
                <line :x1="tick.position" :x2="tick.position" :y1="RULER_SIZE" y2="0" />
                <text :x="tick.position + 3" y="8">{{ tickLabel(tick.value) }}</text>
            </g>
        </svg>
        <svg class="sketch-ruler left" :width="RULER_SIZE" :height="frame.height" @pointerdown="begin($event, 'left')">
            <rect :width="RULER_SIZE" :height="frame.height" />
            <g v-for="tick in leftTicks" :key="tick.value">
                <line :x1="RULER_SIZE" x2="0" :y1="tick.position" :y2="tick.position" />
                <text :transform="`rotate(-90 9 ${tick.position - 3})`" x="9" :y="tick.position - 3">{{ tickLabel(tick.value) }}</text>
            </g>
        </svg>
        <div class="sketch-ruler-corner" />

        <template v-for="guide in frame.guides" :key="`editor:${guide.id}`">
            <div
                v-if="selectedId === guide.id"
                class="sketch-guide-input" :class="guide.axis === 'u' ? 'on-top' : 'on-left'"
                :style="guide.axis === 'u' ? { left: `${guide.rulerPosition + 40}px`, top: `${RULER_CENTER}px` } : { left: `${RULER_CENTER}px`, top: `${guide.rulerPosition + 40}px` }"
                @pointerdown.stop
            >
                <input
                    type="number" step="1" :value="guideValue(guide)" aria-label="参考线位置"
                    @input="drafts.set(guide.id, ($event.currentTarget as HTMLInputElement).value)"
                    @blur="commit(guide, $event.currentTarget as HTMLInputElement)"
                    @keydown="keydown(guide, $event)"
                />
                <span>{{ frame.unit }}</span>
            </div>
            <button
                v-if="selectedId === guide.id"
                class="sketch-guide-delete" :style="guide.axis === 'u' ? { left: `${guide.rulerPosition}px`, top: `${RULER_CENTER}px` } : { left: `${RULER_CENTER}px`, top: `${guide.rulerPosition}px` }"
                aria-label="删除参考线" @pointerdown.stop @click.stop="callbacks.onSketchGuideDelete(guide.id)"
            >×</button>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.sketch-rulers {
    position: absolute;
    inset: 0;
    z-index: 8;
    pointer-events: none;
    overflow: hidden;
}
.sketch-guide-lines {
    position: absolute;
    inset: 0;
    overflow: visible;
}
.sketch-guide-hit {
    stroke: transparent;
    stroke-width: 12;
    pointer-events: stroke;
    cursor: move;
}
.sketch-guide-line {
    stroke: #78a6c4;
    stroke-width: 1;
    stroke-dasharray: 6 4;
    pointer-events: none;
    &.selected { stroke: var(--primary-color, #18a058); stroke-width: 1.5; }
}
.sketch-ruler {
    position: absolute;
    pointer-events: auto;
    cursor: crosshair;
    user-select: none;
    color: #5d6570;
    rect { fill: rgb(250 250 250 / 94%); stroke: #d9dde3; stroke-width: 1; }
    line { stroke: #a5acb5; stroke-width: 1; }
    text { fill: currentcolor; font-size: 7px; }
    &.top { left: 0; top: 0; }
    &.left { left: 0; top: 0; }
}
.sketch-ruler-corner {
    position: absolute;
    left: 0;
    top: 0;
    width: 12px;
    height: 12px;
    background: #fafafa;
    border-right: 1px solid #d9dde3;
    border-bottom: 1px solid #d9dde3;
    pointer-events: auto;
}
.sketch-guide-input {
    position: absolute;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 1px 3px;
    background: white;
    border: 1px solid #b8bec7;
    border-radius: 3px;
    pointer-events: auto;
    transform: translate(-50%, -50%);
    input { width: 48px; height: 16px; padding: 0; border: 0; outline: 0; font-size: 10px; text-align: right; }
    span { font-size: 9px; }
    &.on-left { transform: translate(-50%, -50%) rotate(90deg); }
}
.sketch-guide-delete {
    position: absolute;
    z-index: 4;
    width: 10px;
    height: 10px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #d03050;
    color: white;
    font: 9px/9px sans-serif;
    pointer-events: auto;
    transform: translate(-50%, -50%);
    cursor: pointer;
}
</style>
