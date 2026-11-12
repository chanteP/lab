<script setup lang="ts">
import { NSelect } from 'naive-ui';
import OperationBar from '../ui/OperationBar.vue';
import IntegerInputNumber from '../ui/IntegerInputNumber.vue';
import AppButton from '../ui/AppButton.vue';
import type { LengthUnit } from '../../types';

defineProps<{ mode: 'rotate' | 'revolve'; axis: 'x' | 'y' | 'z'; angle: number; offset: number; unit: LengthUnit }>();
const emit = defineEmits<{ close: []; done: []; update: [value: { axis?: 'x' | 'y' | 'z'; angle?: number; offset?: number }] }>();
</script>

<template>
    <OperationBar :label="mode === 'rotate' ? '绕轴旋转' : '车削'" :close-label="mode === 'rotate' ? '取消绕轴旋转' : '取消车削'" @close="emit('close')">
        <div class="context-title"><strong>{{ mode === 'rotate' ? '绕轴' : '车削' }}</strong><span>{{ mode === 'rotate' ? '轮廓绕轴生成新实体' : '封闭轮廓绕轴生成实体或螺旋' }}</span></div>
        <div class="context-fields">
            <label>轴<NSelect size="small" :value="axis" :options="(mode === 'rotate' ? ['x', 'y', 'z'] : ['x', 'y']).map((value) => ({ label: value.toUpperCase(), value }))" @update:value="emit('update', { axis: $event })" /></label>
            <label>角度<IntegerInputNumber :precision="2" :value="angle" :min="mode === 'rotate' ? -360 : undefined" :max="mode === 'rotate' ? 360 : undefined" :step="5" size="small" @update:value="emit('update', { angle: $event })" /></label>
            <template v-if="mode === 'rotate' || mode === 'revolve'"><label>Elevation<IntegerInputNumber :precision="2" :value="offset" size="small" @update:value="emit('update', { offset: $event })" /></label><span class="unit">{{ unit }}</span></template>
            <AppButton type="primary" size="small" @click="emit('done')">完成</AppButton>
        </div>
    </OperationBar>
</template>

<style lang="scss" scoped>
.context-title { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.context-title strong { font-size: 11px; }
.context-title span { padding-left: 6px; color: var(--model3d-ui-7e8b83); border-left: 1px solid var(--model3d-ui-e0e6e2); font-size: 9px; }
.context-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.context-fields label { display: flex; align-items: center; gap: 4px; color: var(--model3d-ui-748078); font-size: 9px; white-space: nowrap; }
.context-fields .n-input-number { width: 100px; }
.context-fields .n-select { width: 64px; }
.unit { color: var(--model3d-ui-748078); font-size: 10px; }
@media (max-width: 1100px) { .context-title span { display: none; } }
</style>
