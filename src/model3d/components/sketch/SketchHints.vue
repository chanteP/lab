<script setup lang="ts">
import { computed } from 'vue';
import type { ProfileType } from '../../engine/profiles';
import ViewportHints from '../viewport/ViewportHints.vue';

const props = defineProps<{ profileType: ProfileType; selectionTool: boolean }>();
const items = computed(() => {
    const result = [
        'Space / 空格：拖动画布。',
        'Alt / Option：删除边。',
        '普通点击选择形状，Ctrl / Command 多选。',
    ];
    if (['polygon', 'line'].includes(props.profileType)) result.push('Line：超过 2 个点时，Shift + 点击连接首尾。');
    result.push('双击 border：选择整个形状。');
    if (props.selectionTool) result.push('点、边、形状不混选，后选类型优先。');
    else if (props.profileType === 'arc') result.push('Arc：第 3 点确定圆弧，开放弧可独立存在。');
    else if (props.profileType === 'circle') result.push('圆形：拖动半径；扇形点控制角度，双击恢复。');
    else if (props.profileType === 'ellipse') result.push('椭圆：拖动双半径；扇形点控制角度，双击恢复。');
    else if (props.profileType === 'rectangle') result.push('矩形：角点调整长宽，中心点整体移动。');
    else if (props.profileType === 'regular') result.push('正多边形：拖动任一角调整半径和方向。');
    return result;
});
</script>

<template>
    <ViewportHints eyebrow="草图" :items="items" avoid-selector=".constraints-panel" />
</template>
