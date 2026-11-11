<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { SketchLinearPattern } from '../../composables/sketch/useSketchLinearPattern';
import { integerStep } from '../../utils/number';
import AppButton from '../ui/AppButton.vue';
import OperationBar from '../ui/OperationBar.vue';

const props = defineProps<{ pattern: SketchLinearPattern }>();
const canvas = ref<HTMLCanvasElement>();
const session = computed(() => props.pattern.session.value);
const position = computed(() => props.pattern.inputPosition.value);
const lengthUnit = computed(() => props.pattern.lengthUnit.value);
let frame = 0;

function numberValue(event: Event) { return Number((event.currentTarget as HTMLInputElement).value); }
function countWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (session.value) props.pattern.updateCount(integerStep(session.value.count, event.deltaY < 0 ? 1 : -1));
}
function spacingWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (session.value) props.pattern.updateSpacing(integerStep(session.value.spacing, event.deltaY < 0 ? 1 : -1));
}
function spacingKey(event: KeyboardEvent) {
    if (!['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key) || !session.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = event.currentTarget as HTMLInputElement;
    if (event.key !== 'Enter') input.value = String(integerStep(Number(input.value), event.key === 'ArrowUp' ? 1 : -1));
    props.pattern.updateSpacing(Number(input.value));
}
function countKey(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    props.pattern.updateCount(numberValue(event));
}

onMounted(() => {
    const render = () => {
        if (canvas.value) props.pattern.render(canvas.value);
        frame = requestAnimationFrame(render);
    };
    render();
});
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
    <div v-if="session" class="pattern-surface" @click.stop @contextmenu="pattern.contextMenu">
        <canvas
            ref="canvas" class="pattern-canvas" aria-label="线性阵列方向画布"
            @pointerdown="pattern.pointerDown" @pointermove="pattern.pointerMove"
            @pointerup="pattern.pointerUp" @pointercancel="pattern.pointerUp"
            @pointerleave="pattern.pointerLeave" @wheel="pattern.wheel"
        />
        <OperationBar label="线性阵列操作" close-label="退出线性阵列" @close="pattern.cancel">
            <strong>线性阵列</strong>
            <label>复制次数<input type="number" min="1" max="100" step="1" :value="session.count" aria-label="阵列复制次数" @input="pattern.updateCount(numberValue($event))" @wheel="countWheel" @keydown="countKey" /></label>
            <label>间距<input type="number" min="0.01" step="1" :value="session.spacing.toFixed(2)" aria-label="阵列间距" @change="pattern.updateSpacing(numberValue($event))" @wheel="spacingWheel" @keydown="spacingKey" />
                <select :value="lengthUnit" aria-label="阵列长度单位" @change="pattern.changeLengthUnit(($event.currentTarget as HTMLSelectElement).value as 'mm' | 'cm' | 'm')"><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select>
            </label>
            <span class="operation-hint">拖动箭头确定方向，靠近轴线或草图边自动吸附</span>
            <AppButton type="primary" size="small" @click="pattern.complete">完成</AppButton>
        </OperationBar>
        <div v-if="position" class="gizmo-input pattern-distance" :style="{ left: `${position.x}px`, top: `${position.y}px` }" @pointerdown.stop>
            <input type="number" min="0.01" step="1" :value="session.spacing.toFixed(2)" aria-label="阵列方向间距" @change="pattern.updateSpacing(numberValue($event))" @wheel="spacingWheel" @keydown="spacingKey" />
            <span>{{ lengthUnit }}</span>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.pattern-surface { position: absolute; z-index: 5; inset: 0; overflow: hidden; }
.pattern-canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
:deep(.operation-bar__content) { gap: 12px; white-space: nowrap; }
:deep(.operation-bar__content) strong { font-size: 12px; }
:deep(.operation-bar__content) label { display: flex; align-items: center; gap: 5px; font-size: 11px; }
:deep(.operation-bar__content) input { width: 66px; height: 28px; padding: 3px 6px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
:deep(.operation-bar__content) select { height: 28px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
.operation-hint { max-width: 250px; overflow: hidden; color: var(--model3d-ui-7e8b83); font-size: 11px; text-overflow: ellipsis; }
.pattern-distance { position: absolute; z-index: 2; display: flex; align-items: center; gap: 4px; transform: translate(-50%, -50%); }
.pattern-distance input { width: 78px; }
.pattern-distance span { color: var(--model3d-ui-76501f); font-size: 10px; }
.pattern-distance input:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
@media (max-width: 1100px) { .operation-hint { display: none; } }
</style>
