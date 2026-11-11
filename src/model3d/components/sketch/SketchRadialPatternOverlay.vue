<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { SketchRadialPattern } from '../../composables/sketch/useSketchRadialPattern';
import { integerStep } from '../../utils/number';
import AppButton from '../ui/AppButton.vue';
import OperationBar from '../ui/OperationBar.vue';

const props = defineProps<{ pattern: SketchRadialPattern }>();
const canvas = ref<HTMLCanvasElement>();
const session = computed(() => props.pattern.session.value);
let frame = 0;
function numberValue(event: Event) { return Number((event.currentTarget as HTMLInputElement).value); }
function wheel(kind: 'count' | 'angle', event: WheelEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!session.value) return;
    const value = integerStep(session.value[kind], event.deltaY < 0 ? 1 : -1);
    if (kind === 'count') props.pattern.updateCount(value);
    else props.pattern.updateAngle(value);
}
function key(kind: 'count' | 'angle', event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (kind === 'count') props.pattern.updateCount(numberValue(event));
    else props.pattern.updateAngle(numberValue(event));
}
onMounted(() => {
    const render = () => { if (canvas.value) props.pattern.render(canvas.value); frame = requestAnimationFrame(render); };
    render();
});
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
    <div v-if="session" class="radial-surface" @click.stop @contextmenu="pattern.contextMenu">
        <canvas ref="canvas" class="radial-canvas" aria-label="旋转阵列中心与角度画布"
            @pointerdown="pattern.pointerDown" @pointermove="pattern.pointerMove" @pointerup="pattern.pointerUp"
            @pointercancel="pattern.pointerUp" @pointerleave="pattern.pointerLeave" @wheel="pattern.wheel" />
        <OperationBar label="旋转阵列操作" close-label="退出旋转阵列" @close="pattern.cancel">
            <strong>旋转阵列</strong>
            <label>复制次数<input type="number" min="1" max="100" step="1" :value="session.count" aria-label="旋转阵列复制次数" @input="pattern.updateCount(numberValue($event))" @wheel="wheel('count', $event)" @keydown="key('count', $event)" /></label>
            <label>总角度<input type="number" min="-360" max="360" step="1" :value="session.angle" aria-label="旋转阵列总角度" @change="pattern.updateAngle(numberValue($event))" @wheel="wheel('angle', $event)" @keydown="key('angle', $event)" /><span>deg</span></label>
            <AppButton type="secondary" size="small" @click="pattern.reverse">反向</AppButton>
            <span class="operation-hint">中心点支持磁吸，拖动圆弧调整方向与角度</span>
            <AppButton type="primary" size="small" @click="pattern.complete">完成</AppButton>
        </OperationBar>
    </div>
</template>

<style lang="scss" scoped>
.radial-surface { position: absolute; z-index: 5; inset: 0; overflow: hidden; }
.radial-canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
:deep(.operation-bar__content) { gap: 12px; white-space: nowrap; }
:deep(.operation-bar__content) strong { font-size: 12px; }
:deep(.operation-bar__content) label { display: flex; align-items: center; gap: 5px; font-size: 11px; }
:deep(.operation-bar__content) input { width: 66px; height: 28px; padding: 3px 6px; color: var(--model3d-ui-4d5e54); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
:deep(.operation-bar__content) label > span { color: var(--model3d-ui-7e8b83); font-size: 10px; }
.operation-hint { max-width: 250px; overflow: hidden; color: var(--model3d-ui-7e8b83); font-size: 11px; text-overflow: ellipsis; }
@media (max-width: 1100px) { .operation-hint { display: none; } }
</style>
