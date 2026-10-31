<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { SketchAdvanced } from '../../composables/sketch/useSketchAdvanced';
import { integerStep } from '../../utils/number';

const props = defineProps<{ advanced: SketchAdvanced }>();
const canvas = ref<HTMLCanvasElement>();
const session = computed(() => props.advanced.symmetry.value);
const positions = computed(() => props.advanced.inputPositions.value);
const values = computed(() => props.advanced.transformInput.value);
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
onBeforeUnmount(() => cancelAnimationFrame(frame));
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
            @dblclick="advanced.doubleClick"
        />

        <section v-if="session" class="symmetry-operation-bar" aria-label="对称操作" @pointerdown.stop>
            <span class="step-badge">{{ session.step }}/3</span>
            <strong>{{ session.step === 1 ? '设置对称属性' : session.step === 2 ? '选择素材区域' : '绘制对称' }}</strong>
            <template v-if="session.step === 1">
                <label>数量<input type="number" min="2" max="24" step="1" :value="session.count" aria-label="对称数量" @wheel="advanced.updateSymmetry('count', wheelValue($event, session.count))" @input="advanced.updateSymmetry('count', numberValue($event))" /></label>
                <label>偏移角度<input type="number" min="0" max="360" step="1" :value="session.offset" aria-label="对称偏移角度" @wheel="advanced.updateSymmetry('offset', wheelValue($event, session.offset))" @input="advanced.updateSymmetry('offset', numberValue($event))" /><span>deg</span></label>
            </template>
            <span v-else-if="session.step === 2" class="operation-hint">点击平分线之间的区域，仅保留一个选中区</span>
            <label v-else>对称方式
                <select :value="session.mode" aria-label="对称方式" @change="advanced.updateSymmetry('mode', ($event.target as HTMLSelectElement).value as 'mirror' | 'rotate')">
                    <option value="mirror" :disabled="session.count % 2 !== 0">轴对称</option>
                    <option value="rotate">旋转对称</option>
                </select>
            </label>
            <button type="button" class="next-command" @click="advanced.nextSymmetryStep">{{ session.step === 3 ? '完成' : '下一步' }}</button>
            <button type="button" class="exit-command" aria-label="退出对称" @click="advanced.cancelSymmetry">×</button>
        </section>

        <label v-if="positions.x" class="gizmo-input" :style="positionStyle('x')"><span>X</span><input type="number" step="1" :value="values.x.toFixed(2)" aria-label="平移 X 坐标" @wheel="advanced.setTransformInput('x', wheelValue($event, values.x))" @input="advanced.setTransformInput('x', numberValue($event))" /></label>
        <label v-if="positions.y" class="gizmo-input" :style="positionStyle('y')"><span>Y</span><input type="number" step="1" :value="values.y.toFixed(2)" aria-label="平移 Y 坐标" @wheel="advanced.setTransformInput('y', wheelValue($event, values.y))" @input="advanced.setTransformInput('y', numberValue($event))" /></label>
        <label v-if="positions.angle" class="gizmo-input" :style="positionStyle('angle')"><span>角度</span><input type="number" step="1" :value="values.angle.toFixed(2)" aria-label="旋转角度" @wheel="advanced.setTransformInput('angle', wheelValue($event, values.angle))" @input="advanced.setTransformInput('angle', numberValue($event))" /></label>
        <label v-if="positions.scale" class="gizmo-input" :style="positionStyle('scale')"><span>缩放</span><input type="number" min="0.01" step="0.1" :value="values.scale.toFixed(2)" aria-label="缩放比例" @wheel="advanced.setTransformInput('scale', wheelValue($event, values.scale, 0.1))" @input="advanced.setTransformInput('scale', numberValue($event))" /></label>
    </div>
</template>

<style lang="scss" scoped>
.advanced-surface { position: absolute; z-index: 5; inset: 0; overflow: hidden; }
.advanced-canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
.symmetry-operation-bar { position: absolute; z-index: 3; top: 12px; left: 50%; display: flex; align-items: center; gap: 12px; max-width: calc(100% - 400px); min-height: 46px; padding: 7px 8px 7px 12px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-surface98); border: 1px solid var(--model3d-ui-dfe6e1); border-radius: 12px; box-shadow: 0 6px 24px var(--model3d-ui-24302d14); transform: translateX(-50%); white-space: nowrap; }
.symmetry-operation-bar strong { font-size: 12px; }
.step-badge { display: grid; place-items: center; width: 32px; height: 24px; color: var(--model3d-ui-fff); background: var(--model3d-ui-147d70); border-radius: 12px; font-size: 11px; }
.symmetry-operation-bar label { display: flex; align-items: center; gap: 5px; font-size: 11px; }
.symmetry-operation-bar input { width: 66px; height: 28px; padding: 3px 6px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
.symmetry-operation-bar select { height: 28px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
.operation-hint { max-width: 250px; overflow: hidden; color: var(--model3d-ui-7e8b83); font-size: 11px; text-overflow: ellipsis; }
.next-command { height: 30px; padding: 0 14px; color: var(--model3d-ui-fff); background: var(--model3d-ui-147d70); border: 0; border-radius: 6px; cursor: pointer; }
.exit-command { display: grid; place-items: center; width: 30px; height: 30px; padding: 0 0 2px; color: var(--model3d-ui-fff); background: var(--model3d-ui-c94f4f); border: 0; border-radius: 50%; font-size: 23px; line-height: 1; cursor: pointer; }
.next-command:focus-visible, .exit-command:focus-visible, .gizmo-input input:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
.gizmo-input { position: absolute; z-index: 2; display: flex; align-items: center; gap: 3px; padding: 2px 4px; color: var(--model3d-ui-76501f); background: var(--model3d-ui-fffaf3); border: 1px solid var(--model3d-ui-e7a45c); border-radius: 5px; transform: translate(-50%, -50%); font-size: 10px; }
.gizmo-input input { width: 62px; padding: 2px; color: inherit; background: transparent; border: 0; font-size: 11px; }
@media (max-width: 1000px) {
    .symmetry-operation-bar { left: 196px; right: 12px; max-width: none; transform: none; gap: 7px; }
    .operation-hint { display: none; }
}
</style>
