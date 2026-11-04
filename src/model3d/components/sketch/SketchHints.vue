<script setup lang="ts">
import { computed } from 'vue';
import type { ProfileType } from '../../engine/profiles';
import ViewportHints from '../viewport/ViewportHints.vue';

const props = withDefaults(defineProps<{
    profileType: ProfileType;
    selectionTool: boolean;
    selectedProfileType?: ProfileType | 'trimmed' | null;
    hasSelection?: boolean;
}>(), { selectedProfileType: null, hasSelection: false });
const activeType = computed(() => props.selectionTool ? props.selectedProfileType : props.profileType);
const items = computed(() => {
    const result = ['Space / 空格：拖动画布。'];
    const type = activeType.value;
    if (!type) {
        result.push('普通点击选择形状，Ctrl / Command 多选。', '双击 border：选择整个形状。', 'Alt / Option：删除边。');
        return result;
    }

    if (type === 'trimmed') result.push('裁剪边：Alt / Option 删除当前边。');
    else if (['polygon', 'line'].includes(type)) {
        result.push(props.hasSelection ? '拖动顶点调整线条。' : '单击添加点，拖动创建线条。', '超过 2 个点时，Shift + 点击连接首尾。');
    } else if (type === 'arc') result.push('Arc：第 3 点确定圆弧，开放弧可独立存在。');
    else if (type === 'circle') result.push('圆形：拖动半径；扇形点控制角度，双击恢复。');
    else if (type === 'ellipse') result.push('椭圆：拖动双半径；扇形点控制角度，双击恢复。');
    else if (type === 'rectangle') result.push('矩形：角点调整长宽，中心点整体移动。');
    else if (type === 'regular') result.push('正多边形：拖动任一角调整半径和方向。');

    if (props.hasSelection) {
        if (type !== 'trimmed') result.push('Alt / Option：删除边。');
        result.push('双击 border：选择整个形状。');
    }
    return result;
});
</script>

<template>
    <ViewportHints eyebrow="草图" :items="items" avoid-selector=".constraints-panel" />
</template>
