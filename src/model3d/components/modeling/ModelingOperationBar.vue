<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NCheckbox, NIcon, NSelect } from 'naive-ui';
import { CreateOutline } from '@vicons/ionicons5';
import OperationBar from '../ui/OperationBar.vue';
import IntegerInputNumber from '../ui/IntegerInputNumber.vue';
import { ENTITY_NAMES, type BooleanOperation, type ModelDocument, type ModelEntity, type OperationState, type Point2 } from '../../types';
import type { ViewTool } from '../../engine/Viewport';

const props = defineProps<{
    operation: OperationState | null;
    extrudeBody: ModelEntity | null;
    booleanDraft: Extract<OperationState, { type: 'boolean' }> | null;
    historyEditId: string | null;
    operationTargets: { label: string; value: string }[];
    document: ModelDocument;
    sketchMode: boolean;
    editingSketchId: string | null;
    activePlaneId: string | null;
    planeOptions: { label: string; value: string }[];
    sketchDepth: number;
    selectedSketchPoint: number;
    sketchPoints: Point2[];
    selected: ModelEntity | null;
    selectedEntities: ModelEntity[];
    activeTool: ViewTool;
    displayLength: (value: number) => number;
    inputLength: (value: number | null) => number | null;
}>();
const emit = defineEmits<{
    close: [];
    done: [];
    cancel: [];
    updateExtrudeLength: [value: number | null];
    updateExtrude: [key: 'depth' | 'direction' | 'sideMode' | 'draftAngle', value: unknown];
    updateExtrudeResult: [result: 'new' | BooleanOperation];
    updateExtrudeTarget: [id: string | null];
    updateBooleanOperation: [operation: BooleanOperation];
    updateBooleanKeep: [key: 'keepTarget' | 'keepTool', value: boolean];
    swapBooleanRoles: [];
    changePlane: [id: string];
    updateSketchDepth: [value: number | null];
    updateSketchCoordinate: [axis: number, value: number | null];
    normalToSketch: [];
    finishSketch: [];
    updateName: [name: string];
    updateVector: [key: 'position' | 'rotation' | 'scale', axis: number, value: number | null];
    updateFaceOffset: [value: number | null];
    updateDimension: [key: keyof ModelEntity, value: number | null];
    updateColor: [value: string];
    editProfile: [];
    boolean: [type: BooleanOperation];
}>();
const dimensionFields = computed(() => {
    const item = props.selected;
    if (!item) return [];
    if (item.kind === 'box') return [{ key: 'width' as const, label: '宽', value: item.width! }, { key: 'height' as const, label: '高', value: item.height! }, { key: 'depth' as const, label: '深', value: item.depth! }];
    if (item.kind === 'cylinder') return [{ key: 'radius' as const, label: '半径', value: item.radius! }, { key: 'height' as const, label: '高', value: item.height! }];
    if (item.kind === 'sphere') return [{ key: 'radius' as const, label: '半径', value: item.radius! }];
    if (item.kind === 'extrude') return [{ key: 'depth' as const, label: '厚度', value: item.depth! }];
    return [];
});
const activeVector = computed(() => {
    if (!props.selected) return null;
    if (props.activeTool === 'translate') return { key: 'position' as const, label: '位置', value: props.selected.position, step: props.displayLength(1) };
    if (props.activeTool === 'rotate') return { key: 'rotation' as const, label: '旋转', value: props.selected.rotation, step: 15 };
    if (props.activeTool === 'scale') return { key: 'scale' as const, label: '缩放', value: props.selected.scale, step: 0.1 };
    return null;
});
const booleanOperation = computed(() => props.booleanDraft ? props.document.entities.find((item) => item.id === props.booleanDraft!.resultId)?.operation : null);
</script>

<template>
    <OperationBar label="建模操作" close-label="关闭操作条" @close="emit('close')">
        <template v-if="operation?.type === 'extrude' && extrudeBody">
            <div class="context-title"><strong>拉伸</strong><span>{{ historyEditId ? '历史记录编辑' : '拖动画布箭头或输入距离' }}</span></div>
            <div class="context-fields operation-fields">
                <label>距离<IntegerInputNumber class="extrude-distance-input" :precision="4" :value="displayLength(extrudeBody.depth)" :min="displayLength(0.1)" size="small" @update:value="emit('updateExtrudeLength', $event)" /></label>
                <label>方向<NSelect :value="extrudeBody.direction" size="small" :options="[{ label: '正向', value: 1 }, { label: '反向', value: -1 }]" @update:value="emit('updateExtrude', 'direction', $event)" /></label>
                <label>侧面<NSelect :value="extrudeBody.sideMode" size="small" :options="[{ label: '单侧', value: 'one' }, { label: '对称', value: 'symmetric' }]" @update:value="emit('updateExtrude', 'sideMode', $event)" /></label>
                <label>拔模°<IntegerInputNumber :precision="4" :value="extrudeBody.draftAngle || 0" :min="-45" :max="45" size="small" @update:value="emit('updateExtrude', 'draftAngle', $event)" /></label>
                <label>结果<NSelect :value="operation.result" size="small" :options="[{ label: '新实体', value: 'new' }, { label: '并集', value: 'union' }, { label: '差集', value: 'subtract' }, { label: '交集', value: 'intersect' }]" @update:value="emit('updateExtrudeResult', $event)" /></label>
                <NSelect v-if="operation.result !== 'new'" :value="operation.targetId" :options="operationTargets" placeholder="目标实体" size="small" @update:value="emit('updateExtrudeTarget', $event)" />
                <NButton size="small" type="primary" @click="emit('done')">完成</NButton>
            </div>
        </template>
        <template v-else-if="operation?.type === 'boolean' && booleanDraft">
            <div class="context-title"><strong>布尔运算</strong><span>紫色目标 / 蓝色工具</span></div>
            <div class="context-fields operation-fields">
                <NSelect :value="booleanOperation" size="small" :options="[{ label: '并集', value: 'union' }, { label: '差集', value: 'subtract' }, { label: '交集', value: 'intersect' }]" @update:value="emit('updateBooleanOperation', $event)" />
                <NButton size="small" secondary @click="emit('swapBooleanRoles')">交换 目标 / 工具</NButton>
                <NCheckbox :checked="booleanDraft.keepTarget" size="small" @update:checked="emit('updateBooleanKeep', 'keepTarget', $event)">保留目标</NCheckbox>
                <NCheckbox :checked="booleanDraft.keepTool" size="small" @update:checked="emit('updateBooleanKeep', 'keepTool', $event)">保留工具</NCheckbox>
                <NButton size="small" type="primary" @click="emit('done')">完成</NButton>
            </div>
        </template>
        <template v-else-if="sketchMode">
            <div class="context-title"><NIcon><CreateOutline /></NIcon><strong>{{ editingSketchId ? '编辑草图' : '绘制草图' }}</strong><span>单击添加点，拖动顶点调整</span></div>
            <div class="context-fields sketch-fields">
                <NSelect v-if="!editingSketchId" :value="activePlaneId" :options="planeOptions" size="small" class="plane-select" @update:value="emit('changePlane', $event)" />
                <label>厚度<IntegerInputNumber :precision="4" :value="displayLength(sketchDepth)" :min="displayLength(0.1)" size="small" @update:value="emit('updateSketchDepth', inputLength($event))" /></label>
                <template v-if="selectedSketchPoint >= 0 && sketchPoints[selectedSketchPoint]">
                    <label>X<IntegerInputNumber :precision="4" :value="sketchPoints[selectedSketchPoint][0]" size="small" :show-button="false" @update:value="emit('updateSketchCoordinate', 0, $event)" /></label>
                    <label>Z<IntegerInputNumber :precision="4" :value="sketchPoints[selectedSketchPoint][1]" size="small" :show-button="false" @update:value="emit('updateSketchCoordinate', 1, $event)" /></label>
                </template>
                <NButton size="small" secondary @click="emit('normalToSketch')">正视草图</NButton>
                <NButton size="small" type="primary" @click="emit('finishSketch')">退出草图</NButton>
            </div>
        </template>
        <template v-else-if="selectedEntities.length > 1">
            <div class="context-title"><strong>{{ selectedEntities.length }} 个实体</strong><span>按选择顺序执行布尔运算</span></div>
            <div class="context-fields"><NButton size="small" secondary @click="emit('boolean', 'union')">并集</NButton><NButton size="small" secondary @click="emit('boolean', 'subtract')">差集</NButton><NButton size="small" secondary @click="emit('boolean', 'intersect')">交集</NButton></div>
        </template>
        <template v-else-if="selected">
            <div class="context-title"><input :value="selected.name" aria-label="实体名称" @change="emit('updateName', ($event.target as HTMLInputElement).value)" /><span v-if="activeTool === 'offsetFace'">拖动箭头或输入厚度</span><span v-else>{{ ENTITY_NAMES[selected.kind] }}</span></div>
            <div v-if="activeVector" class="context-fields vector-fields">
                <label v-for="axis in ['X', 'Y', 'Z']" :key="axis">{{ axis }}<IntegerInputNumber :precision="4" :value="activeVector.key === 'position' ? displayLength(activeVector.value[['X','Y','Z'].indexOf(axis)]) : activeVector.value[['X','Y','Z'].indexOf(axis)]" size="small" :show-button="false" :step="activeVector.step" :min="activeVector.key === 'scale' ? 0.01 : undefined" @update:value="emit('updateVector', activeVector.key, ['X','Y','Z'].indexOf(axis), $event)" /></label>
            </div>
            <div v-else-if="activeTool === 'offsetFace'" class="context-fields">
                <label>面偏移<IntegerInputNumber class="direct-distance-input" :precision="2" :value="displayLength(selected.faceOffset?.distance || 0)" size="small" @update:value="emit('updateFaceOffset', inputLength($event))" /></label>
                <button class="text-button" @click="emit('updateFaceOffset', 0)">清除面拉伸</button>
            </div>
            <div v-else class="context-fields">
                <label v-for="field in dimensionFields" :key="field.key">{{ field.label }}<IntegerInputNumber :precision="4" :value="displayLength(field.value)" :min="displayLength(0.1)" size="small" :show-button="false" @update:value="emit('updateDimension', field.key, $event)" /></label>
                <label v-if="selected.kind === 'extrude'" class="context-action"><NButton size="small" secondary @click="emit('editProfile')">编辑轮廓</NButton></label>
                <input class="context-color" type="color" :value="selected.color" title="实体颜色" aria-label="实体颜色" @input="emit('updateColor', ($event.target as HTMLInputElement).value)" />
            </div>
        </template>
        <template v-else><div class="context-title"><strong>推拉</strong><span>在画布中按住模型并拖动</span></div></template>
    </OperationBar>
</template>

<style lang="scss" scoped>
.context-title { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.context-title strong { font-size: 11px; }
.context-title span { color: var(--model3d-ui-7e8b83); font-size: 9px; }
.context-title input { width: 90px; padding: 0; border: 0; outline: 0; background: transparent; }
.context-title span { padding-left: 6px; border-left: 1px solid var(--model3d-ui-e0e6e2); }
.context-fields { display: flex; align-items: center; gap: 6px; }
:deep(.operation-bar__content) .sketch-fields { flex-wrap: nowrap; }
.context-fields label { display: flex; align-items: center; gap: 4px; color: var(--model3d-ui-748078); font-size: 9px; white-space: nowrap; }
.context-fields .n-input-number { width: 69px; }
.text-button { color: var(--model3d-ui-147d70); background: transparent; border: 0; cursor: pointer; }
@media (max-width: 1100px) { .context-title span { display: none; } }
</style>
