<script setup lang="ts">
import { ref } from 'vue';
import OperationBar from '../ui/OperationBar.vue';
import IntegerInputNumber from '../ui/IntegerInputNumber.vue';
import AppButton from '../ui/AppButton.vue';
import type { LengthUnit } from '../../types';

const props = defineProps<{ mode: '3d' | 'sketch'; tool: 'translate' | 'rotate' | 'scale'; values: Record<string, number>; unit: LengthUnit }>();
const emit = defineEmits<{ update: [key: string, value: number]; done: [] }>();
const internalAction = ref(false);
const labels = { translate: '位移', rotate: '旋转', scale: '缩放' };
function fields() {
    if (props.tool === 'translate') return ['x', 'y', 'z'];
    if (props.tool === 'rotate') return props.mode === 'sketch' ? ['centerX', 'centerY', 'angle'] : ['x', 'y', 'z'];
    return props.mode === 'sketch' ? ['centerX', 'centerY', 'scale'] : ['x', 'y', 'z'];
}
function label(key: string) {
    return ({ centerX: '中心X', centerY: '中心Y', angle: '角度', scale: '比例', x: 'X', y: 'Y', z: 'Z' } as Record<string, string>)[key];
}
function value(key: string) { return props.values[key] ?? 0; }
function confirmBlur() { if (!internalAction.value) emit('done'); }
</script>

<template>
    <OperationBar :label="`${labels[tool]}参数`" close-label="完成当前变换" @close="emit('done')" @pointerdown.capture="internalAction = true" @pointerup.capture="internalAction = false" @pointercancel.capture="internalAction = false">
        <div class="context-title"><strong>{{ labels[tool] }}</strong><span>{{ mode === 'sketch' ? '草图' : '3D' }}</span></div>
        <div class="context-fields">
            <label v-for="key in fields()" :key="key">{{ label(key) }}<IntegerInputNumber :precision="4" :value="value(key)" :min="key === 'scale' || tool === 'scale' && key !== 'centerX' && key !== 'centerY' ? 0.01 : undefined" size="small" @update:value="emit('update', key, $event)" @blur="confirmBlur" @keydown.enter.prevent="emit('done')" /></label>
            <span v-if="tool === 'translate'" class="unit">{{ unit }}</span><span v-else-if="tool === 'rotate'" class="unit">°</span><span v-else class="unit">×</span>
            <AppButton type="primary" size="small" @click="emit('done')">完成</AppButton>
        </div>
    </OperationBar>
</template>

<style lang="scss" scoped>
.context-title { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.context-title strong { font-size: 11px; }
.context-title span { color: var(--model3d-ui-7e8b83); font-size: 9px; }
.context-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.context-fields label { display: flex; align-items: center; gap: 4px; color: var(--model3d-ui-748078); font-size: 9px; white-space: nowrap; }
.context-fields .n-input-number { width: 88px; }
.unit { color: var(--model3d-ui-748078); font-size: 10px; }
</style>
