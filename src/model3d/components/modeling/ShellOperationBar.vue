<script setup lang="ts">
import OperationBar from '../ui/OperationBar.vue';
import IntegerInputNumber from '../ui/IntegerInputNumber.vue';
import AppButton from '../ui/AppButton.vue';
import type { LengthUnit } from '../../types';

defineProps<{ value: number; unit: LengthUnit }>();
const emit = defineEmits<{ close: []; done: []; update: [value: number] }>();
</script>

<template>
    <OperationBar label="抽壳操作" close-label="取消抽壳" @close="emit('close')">
        <div class="context-title"><strong>抽壳</strong><span>调整厚度实时预览</span></div>
        <div class="context-fields">
            <label>厚度<IntegerInputNumber :precision="2" :value="value" :min="0.01" size="small" @update:value="emit('update', $event)" /></label>
            <span class="unit">{{ unit }}</span>
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
.context-fields .n-input-number { width: 76px; }
.unit { color: var(--model3d-ui-748078); font-size: 10px; }
@media (max-width: 1100px) { .context-title span { display: none; } }
</style>
