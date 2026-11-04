<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import type { ProjectedViewportOverlay } from '../../engine/viewport/OverlayController';
import type { ViewportCallbacks } from '../../engine/Viewport';
import { integerStep } from '../../utils/number';

const props = defineProps<{ items: ProjectedViewportOverlay[]; callbacks: ViewportCallbacks }>();
const wheelTimers = new Map<string, ReturnType<typeof setTimeout>>();

type DimensionOverlay = Extract<ProjectedViewportOverlay, { kind: 'dimension' }>;

function positionStyle(item: ProjectedViewportOverlay) {
    return { left: `${item.x}px`, top: `${item.y}px`, '--dimension-angle': `${item.kind === 'dimension' ? item.angle || 0 : 0}deg` };
}

function commitDimension(item: DimensionOverlay, input: HTMLInputElement) {
    const timer = wheelTimers.get(item.id);
    if (timer) clearTimeout(timer);
    wheelTimers.delete(item.id);
    const next = Number(input.value);
    if (Number.isFinite(next) && (item.signed || next > 0)) {
        window.setTimeout(() => {
            if (item.target.kind === 'directFace' || item.target.kind === 'edgeTreatment') props.callbacks.onDirectDistance(next);
            else if (item.target.kind === 'extrudeDepth') props.callbacks.onExtrudeDistance(next);
            else props.callbacks.onSketchDimension(item.target, next);
        }, 0);
        // A direct-face value is relative to the current gesture; reset it so Enter followed by blur cannot apply it twice.
        if (item.target.kind === 'directFace') input.value = '0.00';
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
                :class="{ 'dimension-oriented': item.angle !== undefined }"
                :style="positionStyle(item)"
                @pointerdown.stop
            >
                <input
                    type="number"
                    step="1"
                    :value="item.value.toFixed(2)"
                    :aria-label="item.target.kind === 'angle' ? '角度' : item.target.kind === 'directFace' || item.target.kind === 'edgeTreatment' ? item.target.kind === 'edgeTreatment' ? '圆角或倒角距离' : '推拉距离' : item.target.kind === 'extrudeDepth' ? '拉伸距离' : '尺寸'"
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

            <button
                v-else-if="item.kind === 'booleanButton'"
                class="viewport-overlay-item boolean-mini-button"
                :class="{ negative: item.sign === -1 }"
                :style="positionStyle(item)"
                :aria-label="item.sign === 1 ? '切换为去除模型' : '切换为保留模型'"
                @pointerdown.stop
                @pointerenter="callbacks.onBooleanHover(item.entityId)"
                @pointerleave="callbacks.onBooleanHover(null)"
                @click.stop="callbacks.onBooleanToggle(item.entityId)"
            >{{ item.sign === 1 ? '+' : '−' }}</button>

            <div
                v-else
                class="viewport-overlay-item measure-value"
                :class="item.className"
                :style="positionStyle(item)"
            >{{ item.text }}</div>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.viewport-overlay-item {
    position: absolute;
    transform: translate(-50%, -50%);
}
.viewport-overlay-item.dimension-oriented { transform: translate(-50%, -50%) rotate(var(--dimension-angle)) translateY(-9px); }
.boolean-mini-button { width: 23px; height: 23px; display: grid; place-items: center; padding: 0 0 1px; color: var(--model3d-ui-fff); background: #7c3aed; border: 1px solid var(--model3d-ui-ffffff80); border-radius: 6px; box-shadow: 0 2px 7px var(--model3d-ui-1d332b2b); font-size: 17px; font-weight: 650; line-height: 1; cursor: pointer; pointer-events: auto; }
.boolean-mini-button.negative { background: #a92f3d; }
.boolean-mini-button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
</style>
