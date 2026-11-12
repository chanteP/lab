<script setup lang="ts">
import { NSelect } from 'naive-ui';
import OperationBar from '../ui/OperationBar.vue';
import IntegerInputNumber from '../ui/IntegerInputNumber.vue';
import AppButton from '../ui/AppButton.vue';
import type { LengthUnit } from '../../types';

defineProps<{
    profileName: string;
    axisLabel: string;
    hasAxis: boolean;
    gridAxis: 'x' | 'y' | 'z' | null;
    gridAxes: { label: string; value: 'x' | 'y' | 'z' }[];
    angle: number;
    offset: number;
    unit: LengthUnit;
}>();
const emit = defineEmits<{ close: []; done: []; update: [value: { axis?: 'x' | 'y' | 'z'; angle?: number; offset?: number }] }>();
</script>

<template>
    <OperationBar label="车削" close-label="取消车削" @close="emit('close')">
        <div class="context-title"><strong>车削</strong><span>截面绕轴旋转扫掠形成实体</span></div>
        <div class="context-fields">
            <span class="profile">截面 <strong>{{ profileName }}</strong></span>
            <label>网格轴<NSelect size="small" :value="gridAxis" :options="gridAxes" placeholder="选择" @update:value="emit('update', { axis: $event })" /></label>
            <span class="axis-hint" :class="{ selected: hasAxis }">{{ axisLabel }}</span>
            <label>角度<IntegerInputNumber :precision="2" :value="angle" :step="5" size="small" @update:value="emit('update', { angle: $event })" /></label>
            <label>轴向位移<IntegerInputNumber :precision="2" :value="offset" size="small" @update:value="emit('update', { offset: $event })" /><span class="unit">{{ unit }}</span></label>
            <AppButton type="primary" size="small" :disabled="!hasAxis" @click="emit('done')">完成</AppButton>
        </div>
    </OperationBar>
</template>

<style lang="scss" scoped>
.context-title { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.context-title strong { font-size: 11px; }
.context-title span { padding-left: 6px; color: var(--model3d-ui-7e8b83); border-left: 1px solid var(--model3d-ui-e0e6e2); font-size: 9px; }
.context-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.context-fields label { display: flex; align-items: center; gap: 4px; color: var(--model3d-ui-748078); font-size: 9px; white-space: nowrap; }
.context-fields .n-input-number { width: 88px; }
.context-fields .n-select { width: 76px; }
.profile { color: var(--model3d-ui-748078); font-size: 9px; }
.profile strong { margin-left: 4px; color: var(--model3d-ui-26302c); }
.axis-hint { max-width: 180px; overflow: hidden; color: var(--model3d-ui-147d70); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.axis-hint.selected { color: var(--model3d-ui-527067); }
.unit { color: var(--model3d-ui-748078); font-size: 10px; }
@media (max-width: 1100px) { .context-title span { display: none; } }
</style>
