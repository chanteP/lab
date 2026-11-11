<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { SketchAdvanced } from '../../composables/sketch/useSketchAdvanced';
import { integerStep } from '../../utils/number';
import OperationBar from '../ui/OperationBar.vue';
import AppButton from '../ui/AppButton.vue';

const props = defineProps<{ advanced: SketchAdvanced }>();
const canvas = ref<HTMLCanvasElement>();
const session = computed(() => props.advanced.symmetry.value);
const positions = computed(() => props.advanced.inputPositions.value);
const values = computed(() => props.advanced.transformInput.value);
const lengthUnit = computed(() => props.advanced.lengthUnit.value);
const wheelTimers = new Map<string, ReturnType<typeof setTimeout>>();
type TransformInputKind = 'x' | 'y' | 'angle' | 'scale';
let frame = 0;

function numberValue(event: Event) {
    return Number((event.target as HTMLInputElement).value);
}
function wheelValue(event: WheelEvent, value: number, step = 1) {
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    if (step >= 1) return integerStep(value, direction, step);
    return Math.max(0.01, Math.round((value + direction * step) / step) * step);
}
function commitTransform(kind: TransformInputKind, input: HTMLInputElement) {
    const timer = wheelTimers.get(kind);
    if (timer) clearTimeout(timer);
    wheelTimers.delete(kind);
    const value = Number(input.value);
    if (Number.isFinite(value)) window.setTimeout(() => props.advanced.setTransformInput(kind, value), 0);
}
function onTransformWheel(kind: TransformInputKind, event: WheelEvent, step = 1) {
    event.preventDefault();
    event.stopPropagation();
    const input = event.currentTarget as HTMLInputElement;
    const direction = event.deltaY < 0 ? 1 : -1;
    input.value = String(step >= 1 ? integerStep(Number(input.value), direction, step) : Math.max(0.01, Math.round((Number(input.value) + direction * step) / step) * step));
    const previous = wheelTimers.get(kind);
    if (previous) clearTimeout(previous);
    wheelTimers.set(kind, window.setTimeout(() => commitTransform(kind, input), 90));
}
function onTransformKey(kind: TransformInputKind, event: KeyboardEvent) {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        commitTransform(kind, input);
        return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const step = kind === 'scale' ? 0.1 : 1;
    input.value = String(kind === 'scale' ? Math.max(0.01, Math.round((Number(input.value) + direction * step) / step) * step) : integerStep(Number(input.value), direction));
    commitTransform(kind, input);
}
function positionStyle(key: string) {
    const point = positions.value[key];
    return point ? { left: `${point.x}px`, top: `${point.y}px` } : {};
}

onMounted(() => {
    const render = () => {
        if (canvas.value) props.advanced.render(canvas.value);
        frame = requestAnimationFrame(render);
    };
    render();
});
onBeforeUnmount(() => { cancelAnimationFrame(frame); wheelTimers.forEach(clearTimeout); });
</script>

<template>
    <div class="advanced-surface" @click.stop @contextmenu="advanced.contextMenu">
        <canvas
            ref="canvas"
            class="advanced-canvas"
            aria-label="草图高级编辑画布"
            @pointerdown="advanced.pointerDown"
            @pointermove="advanced.pointerMove"
            @pointerup="advanced.pointerUp"
            @pointercancel="advanced.pointerUp"
            @pointerleave="advanced.pointerLeave"
            @wheel="advanced.wheel"
            @dblclick="advanced.doubleClick"
        />

        <OperationBar v-if="session" label="镜像操作" close-label="退出镜像" @close="advanced.cancelSymmetry">
            <span class="step-badge">{{ session.step }}/3</span>
            <strong>{{ session.step === 1 ? '设置镜像属性' : session.step === 2 ? '选择素材区域' : '绘制镜像' }}</strong>
            <template v-if="session.step === 1">
                <label>数量<input type="number" min="2" max="24" step="1" :value="session.count" aria-label="镜像数量" @wheel="advanced.updateSymmetry('count', wheelValue($event, session.count))" @input="advanced.updateSymmetry('count', numberValue($event))" /></label>
                <label>偏移角度<input type="number" min="0" max="360" step="1" :value="session.offset" aria-label="镜像偏移角度" @wheel="advanced.updateSymmetry('offset', wheelValue($event, session.offset))" @input="advanced.updateSymmetry('offset', numberValue($event))" /><span>deg</span></label>
            </template>
            <span v-else-if="session.step === 2" class="operation-hint">点击平分线之间的区域，仅保留一个选中区</span>
            <label v-else>镜像方式
                <select :value="session.mode" aria-label="镜像方式" @change="advanced.updateSymmetry('mode', ($event.target as HTMLSelectElement).value as 'mirror' | 'rotate')">
                    <option value="mirror" :disabled="session.count % 2 !== 0">轴对称</option>
                    <option value="rotate">旋转对称</option>
                </select>
            </label>
            <AppButton type="primary" size="small" @click="advanced.nextSymmetryStep">{{ session.step === 3 ? '完成' : '下一步' }}</AppButton>
        </OperationBar>

        <div v-if="positions.x" class="gizmo-input sketch-length-input" :style="positionStyle('x')" @pointerdown.stop>
            <input type="number" step="1" :value="values.x.toFixed(2)" aria-label="平移 X 坐标" @blur="commitTransform('x', $event.currentTarget as HTMLInputElement)" @wheel="onTransformWheel('x', $event)" @keydown="onTransformKey('x', $event)" />
            <select :value="lengthUnit" aria-label="长度单位" @pointerdown.stop @change="advanced.changeLengthUnit(($event.currentTarget as HTMLSelectElement).value as 'mm' | 'cm' | 'm')"><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select>
        </div>
        <div v-if="positions.y" class="gizmo-input sketch-length-input" :style="positionStyle('y')" @pointerdown.stop>
            <input type="number" step="1" :value="values.y.toFixed(2)" aria-label="平移 Y 坐标" @blur="commitTransform('y', $event.currentTarget as HTMLInputElement)" @wheel="onTransformWheel('y', $event)" @keydown="onTransformKey('y', $event)" />
            <select :value="lengthUnit" aria-label="长度单位" @pointerdown.stop @change="advanced.changeLengthUnit(($event.currentTarget as HTMLSelectElement).value as 'mm' | 'cm' | 'm')"><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select>
        </div>
        <div v-if="positions.angle" class="gizmo-input sketch-length-input" :style="positionStyle('angle')" @pointerdown.stop>
            <input type="number" step="1" :value="values.angle.toFixed(2)" aria-label="旋转角度" @blur="commitTransform('angle', $event.currentTarget as HTMLInputElement)" @wheel="onTransformWheel('angle', $event)" @keydown="onTransformKey('angle', $event)" /><span>deg</span>
        </div>
        <div v-if="positions.scale" class="gizmo-input sketch-length-input" :style="positionStyle('scale')" @pointerdown.stop>
            <input type="number" min="0.01" step="0.1" :value="values.scale.toFixed(2)" aria-label="缩放比例" @blur="commitTransform('scale', $event.currentTarget as HTMLInputElement)" @wheel="onTransformWheel('scale', $event, 0.1)" @keydown="onTransformKey('scale', $event)" /><span>x</span>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.advanced-surface { position: absolute; z-index: 5; inset: 0; overflow: hidden; }
.advanced-canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
:deep(.operation-bar__content) { gap: 12px; white-space: nowrap; }
:deep(.operation-bar__content) strong { font-size: 12px; }
.step-badge { display: grid; place-items: center; width: 32px; height: 24px; color: var(--model3d-ui-fff); background: var(--model3d-ui-147d70); border-radius: 12px; font-size: 11px; }
:deep(.operation-bar__content) label { display: flex; align-items: center; gap: 5px; font-size: 11px; }
:deep(.operation-bar__content) input { width: 66px; height: 28px; padding: 3px 6px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
:deep(.operation-bar__content) select { height: 28px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
.operation-hint { max-width: 250px; overflow: hidden; color: var(--model3d-ui-7e8b83); font-size: 11px; text-overflow: ellipsis; }
.gizmo-input input:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
.gizmo-input { position: absolute; z-index: 2; transform: translate(-50%, -50%); }
@media (max-width: 1000px) {
    .operation-hint { display: none; }
}
</style>
