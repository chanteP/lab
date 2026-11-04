<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NCheckbox, NSelect } from 'naive-ui';
import OperationBar from '../ui/OperationBar.vue';
import IntegerInputNumber from '../ui/IntegerInputNumber.vue';
import type { BooleanOperation, ModelDocument, ModelEntity, OperationState } from '../../types';

const props = defineProps<{
    operation: OperationState;
    extrudeBody: ModelEntity | null;
    booleanDraft: Extract<OperationState, { type: 'boolean' }> | null;
    historyEditId: string | null;
    operationTargets: { label: string; value: string }[];
    document: ModelDocument;
}>();
const emit = defineEmits<{
    close: [];
    done: [];
    updateExtrude: [key: 'depth' | 'direction' | 'sideMode' | 'draftAngle', value: unknown];
    updateExtrudeResult: [result: 'new' | BooleanOperation];
    updateExtrudeTarget: [id: string | null];
    updateBooleanOperation: [operation: BooleanOperation];
    updateBooleanKeep: [key: 'keepTarget' | 'keepTool', value: boolean];
    swapBooleanRoles: [];
}>();
const booleanOperation = computed(() => props.booleanDraft ? props.document.entities.find((item) => item.id === props.booleanDraft!.resultId)?.operation : null);
</script>

<template>
    <OperationBar label="建模操作" close-label="取消当前操作" @close="emit('close')">
        <template v-if="operation.type === 'extrude' && extrudeBody">
            <div class="context-title"><strong>拉伸</strong><span>{{ historyEditId ? '历史记录编辑' : '拖动箭头或在箭头旁输入距离' }}</span></div>
            <div class="context-fields operation-fields">
                <label>方向<NSelect :value="extrudeBody.direction" size="small" :options="[{ label: '正向', value: 1 }, { label: '反向', value: -1 }]" @update:value="emit('updateExtrude', 'direction', $event)" /></label>
                <label>侧面<NSelect :value="extrudeBody.sideMode" size="small" :options="[{ label: '单侧', value: 'one' }, { label: '对称', value: 'symmetric' }]" @update:value="emit('updateExtrude', 'sideMode', $event)" /></label>
                <label>拔模°<IntegerInputNumber :precision="4" :value="extrudeBody.draftAngle || 0" :min="-45" :max="45" size="small" @update:value="emit('updateExtrude', 'draftAngle', $event)" /></label>
                <label>结果<NSelect :value="operation.result" size="small" :options="[{ label: '新实体', value: 'new' }, { label: '并集', value: 'union' }, { label: '差集', value: 'subtract' }, { label: '交集', value: 'intersect' }]" @update:value="emit('updateExtrudeResult', $event)" /></label>
                <NSelect v-if="operation.result !== 'new'" :value="operation.targetId" :options="operationTargets" placeholder="目标实体" size="small" @update:value="emit('updateExtrudeTarget', $event)" />
                <NButton size="small" type="primary" @click="emit('done')">完成</NButton>
            </div>
        </template>
        <template v-else-if="operation.type === 'boolean' && booleanDraft">
            <div class="context-title"><strong>布尔运算</strong><span>紫色目标 / 蓝色工具</span></div>
            <div class="context-fields operation-fields">
                <NSelect :value="booleanOperation" size="small" :options="[{ label: '并集', value: 'union' }, { label: '差集', value: 'subtract' }, { label: '交集', value: 'intersect' }]" @update:value="emit('updateBooleanOperation', $event)" />
                <NButton size="small" secondary @click="emit('swapBooleanRoles')">交换目标 / 工具</NButton>
                <NCheckbox :checked="booleanDraft.keepTarget" size="small" @update:checked="emit('updateBooleanKeep', 'keepTarget', $event)">保留目标</NCheckbox>
                <NCheckbox :checked="booleanDraft.keepTool" size="small" @update:checked="emit('updateBooleanKeep', 'keepTool', $event)">保留工具</NCheckbox>
                <NButton size="small" type="primary" @click="emit('done')">完成</NButton>
            </div>
        </template>
    </OperationBar>
</template>

<style lang="scss" scoped>
.context-title { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.context-title strong { font-size: 11px; }
.context-title span { padding-left: 6px; color: var(--model3d-ui-7e8b83); border-left: 1px solid var(--model3d-ui-e0e6e2); font-size: 9px; }
.context-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.context-fields label { display: flex; align-items: center; gap: 4px; color: var(--model3d-ui-748078); font-size: 9px; white-space: nowrap; }
.context-fields .n-input-number { width: 69px; }
@media (max-width: 1100px) { .context-title span { display: none; } }
</style>
