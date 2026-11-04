<script setup lang="ts">
import { computed } from 'vue';
import type { OperationState, SelectionKind } from '../../types';
import type { ViewTool } from '../../engine/Viewport';
import ViewportHints from '../viewport/ViewportHints.vue';

const props = defineProps<{
    selectionKind: SelectionKind;
    activeTool: ViewTool;
    selectedCount: number;
    measureMode: boolean;
    operation: OperationState | null;
}>();
const title = computed(() => {
    if (props.measureMode) return '测量';
    if (props.operation?.type === 'extrude') return '拉伸';
    if (props.operation?.type === 'boolean') return '布尔运算';
    if (props.activeTool === 'offsetFace') return '推拉面';
    if (props.activeTool === 'translate') return '移动';
    if (props.activeTool === 'rotate') return '旋转';
    if (props.activeTool === 'scale') return '缩放';
    if (props.selectionKind === 'face') return '面';
    if (props.selectionKind === 'edge') return '边';
    if (props.selectionKind === 'plane') return '构造平面';
    if (props.selectionKind === 'sketch') return '草图轮廓';
    if (props.selectedCount > 1) return '多选';
    if (props.selectedCount === 1) return '实体';
    return '3D 建模';
});
const items = computed(() => {
    if (props.measureMode) return ['依次单击两个位置，读取总距离和轴向距离。', '右键或再次点击测量按钮退出。', '滚轮缩放，Space + 拖动平移。'];
    if (props.operation?.type === 'extrude') return ['拖动粗箭头，或在箭头旁输入距离。', 'E：切换单侧 / 对称拉伸。', 'Enter：完成；Esc：取消。'];
    if (props.operation?.type === 'boolean') return ['顶部可切换运算、目标和保留项。', 'Enter：完成；Esc：取消。'];

    const result: string[] = [];
    if (props.selectionKind === 'face') {
        result.push('拖动粗箭头推拉面，或在箭头旁输入带符号距离。', '正数沿箭头方向；Enter 或失焦提交输入。');
    } else if (props.selectionKind === 'edge') {
        result.push('单击切换面或边，右侧可相切扩选和穿透选择。');
    } else if (props.selectionKind === 'sketch') {
        result.push('拖动上下粗箭头拉伸闭合轮廓。', 'E：启动拉伸；Shift + 单击：加选轮廓。');
    } else if (props.selectionKind === 'plane') {
        result.push('右侧选择“草图”在所选平面绘制。', 'G：移动；R：旋转；Delete：删除平面。');
    } else if (props.selectedCount > 1) {
        result.push('Shift / Ctrl / Command + 单击：调整多选。', '右侧可执行并集、差集或交集。');
    } else if (props.selectedCount === 1) {
        result.push('拖动手柄变换实体，右侧可输入精确参数。');
    } else {
        result.push('单击面或边选择，双击实体选择整体。', 'Ctrl / Command + 拖动：框选。');
    }

    if (props.selectedCount === 1 && !['face', 'edge', 'plane', 'sketch'].includes(props.selectionKind || '')) result.push('G：移动；R：旋转；S：缩放；V：选择。');
    if (props.selectedCount) result.push('Delete：删除；Esc：取消选择或退出工具。');
    result.push('左键 / 右键拖动：环绕；Space + 拖动：平移。', '滚轮缩放；F：适配；右下轴球点击定向、拖动旋转。');
    return result;
});
</script>

<template>
    <ViewportHints eyebrow="3D" :title="title" :items="items" />
</template>
