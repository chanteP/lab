<script setup lang="ts">
import type { ProfileType } from '../../engine/profiles';

defineProps<{ profileType: ProfileType; selectionTool: boolean }>();
</script>

<template>
    <aside class="hints-panel tool-panel" aria-label="草图操作提示">
        <div class="tool-panel-title"><div><small>草图</small><strong>操作提示</strong></div></div>
        <p>普通点击选择形状，Ctrl/Command 多选。</p>
        <p v-if="selectionTool">点、边、形状不混选，后选类型优先。</p>
        <p v-if="profileType === 'polygon'">Line：超过 2 个点时，Shift + 点击连接首尾。</p>
        <p v-else-if="profileType === 'arc'">Arc：第 3 点确定圆弧，开放弧可独立存在。</p>
        <p v-else-if="profileType === 'circle'">圆形：拖动半径；扇形点控制角度，双击恢复。</p>
        <p v-else-if="profileType === 'ellipse'">椭圆：拖动双半径；扇形点控制角度，双击恢复。</p>
        <p v-else-if="profileType === 'rectangle'">矩形：角点调整长宽，中心点整体移动。</p>
        <p v-else-if="profileType === 'regular'">正多边形：拖动任一角调整半径和方向。</p>
    </aside>
</template>

<style lang="scss" scoped>
.hints-panel { position: absolute; z-index: 7; top: 330px; right: 12px; width: 174px; padding: 12px; }
.tool-panel-title { margin-bottom: 10px; padding-bottom: 9px; border-bottom: 1px solid var(--model3d-ui-e3e9e5); }
.tool-panel-title > div { display: flex; flex-direction: column; gap: 2px; }
.tool-panel-title small { color: var(--model3d-ui-87938c); font-size: 8px; }
.tool-panel-title strong { font-size: 12px; }
p { margin: 7px 0 0; color: var(--model3d-ui-7e8b83); font-size: 10px; line-height: 1.6; }
</style>
