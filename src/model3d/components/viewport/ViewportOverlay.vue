<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import type { ProjectedViewportOverlay } from '../../engine/viewport/OverlayController';
import type { ViewportCallbacks } from '../../engine/Viewport';
import { integerStep } from '../../utils/number';

const props = defineProps<{ items: ProjectedViewportOverlay[]; callbacks: ViewportCallbacks }>();
const wheelTimers = new Map<string, ReturnType<typeof setTimeout>>();

type DimensionOverlay = Extract<ProjectedViewportOverlay, { kind: 'dimension' }>;

function positionStyle(item: ProjectedViewportOverlay) {
    return { left: `${item.x}px`, top: `${item.y}px` };
}

function commitDimension(item: DimensionOverlay, input: HTMLInputElement) {
    const timer = wheelTimers.get(item.id);
    if (timer) clearTimeout(timer);
    wheelTimers.delete(item.id);
    const next = Number(input.value);
    if (Number.isFinite(next) && next > 0) {
        window.setTimeout(() => props.callbacks.onSketchDimension(item.target, next), 0);
    } else input.value = item.value.toFixed(2);
}

function onDimensionWheel(item: DimensionOverlay, event: WheelEvent) {
    const input = event.currentTarget as HTMLInputElement;
    input.value = String(integerStep(Number(input.value), event.deltaY < 0 ? 1 : -1));
    const previous = wheelTimers.get(item.id);
    if (previous) clearTimeout(previous);
    wheelTimers.set(item.id, window.setTimeout(() => commitDimension(item, input), 90));
}

function onDimensionKey(item: DimensionOverlay, event: KeyboardEvent) {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        commitDimension(item, input);
        return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = String(integerStep(Number(input.value), event.key === 'ArrowUp' ? 1 : -1));
    commitDimension(item, input);
}

function changeUnit(unit: 'mm' | 'cm' | 'm') {
    window.setTimeout(() => props.callbacks.onLengthUnitChange(unit), 0);
}

onBeforeUnmount(() => wheelTimers.forEach(clearTimeout));
</script>

<template>
    <div class="measure-label-layer viewport-overlay">
        <template v-for="item in items" :key="item.id">
            <div
                v-if="item.kind === 'dimension'"
                class="viewport-overlay-item sketch-length-input"
                :style="positionStyle(item)"
                @pointerdown.stop
            >
                <input
                    type="number"
                    step="1"
                    :value="item.value.toFixed(2)"
                    :aria-label="item.target.kind === 'angle' ? '角度' : '尺寸'"
                    @blur="commitDimension(item, $event.currentTarget as HTMLInputElement)"
                    @wheel.prevent.stop="onDimensionWheel(item, $event)"
                    @keydown="onDimensionKey(item, $event)"
                />
                <span v-if="item.target.kind === 'angle'">deg</span>
                <select
                    v-else
                    :value="item.unit"
                    aria-label="长度单位"
                    @pointerdown.stop
                    @change="changeUnit(($event.currentTarget as HTMLSelectElement).value as 'mm' | 'cm' | 'm')"
                >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                </select>
            </div>

            <div v-else-if="item.kind === 'lock'" class="viewport-overlay-item" :style="positionStyle(item)">
                <button
                    class="sketch-lock-badge"
                    :class="{ 'is-edge': item.edge, active: item.active, linked: item.linked }"
                    :style="{ color: item.color, marginLeft: item.edge ? `${item.order * 16}px` : '4px', marginTop: item.edge ? '0' : '-14px' }"
                    :data-rule-id="item.rule?.id"
                    aria-label="固定或约束"
                    @pointerdown.stop
                    @click.stop="item.rule ? callbacks.onSketchConstraintRule(item.entityId, item.index, item.rule.id!) : item.edge ? callbacks.onSketchBorderSelect(item.entityId, item.index, $event.metaKey || $event.ctrlKey) : callbacks.onSketchPointRefSelect(item.entityId, item.index)"
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v6H3V7h1zm2 0h4V5a2 2 0 0 0-4 0v2z" /></svg>
                </button>
            </div>

            <div
                v-else
                class="viewport-overlay-item measure-value"
                :class="item.className"
                :style="positionStyle(item)"
                @click="item.action === 'extrude-dimension' && callbacks.onExtrudeDimension()"
            >{{ item.text }}</div>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.viewport-overlay-item {
    position: absolute;
    transform: translate(-50%, -50%);
}
</style>
