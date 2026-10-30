<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ProfileType } from '../../engine/profiles';

const props = defineProps<{ profileType: ProfileType; selectionTool: boolean }>();
const panel = ref<HTMLElement>();
const top = ref(12);
let observer: ResizeObserver;

function updatePosition() {
    const parent = panel.value?.parentElement;
    if (!parent || !panel.value) return;
    const constraint = parent.querySelector<HTMLElement>('.constraints-panel');
    const centered = (parent.clientHeight - panel.value.offsetHeight) / 2;
    const belowConstraints = constraint ? constraint.offsetTop + constraint.offsetHeight + 12 : 12;
    top.value = Math.max(12, centered, belowConstraints);
}

onMounted(() => {
    const parent = panel.value?.parentElement;
    observer = new ResizeObserver(updatePosition);
    if (parent) observer.observe(parent);
    if (panel.value) observer.observe(panel.value);
    const constraint = parent?.querySelector<HTMLElement>('.constraints-panel');
    if (constraint) observer.observe(constraint);
    updatePosition();
});
watch(() => [props.profileType, props.selectionTool], () => nextTick(updatePosition));
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
    <aside ref="panel" class="hints-panel" aria-label="草图操作提示" :style="{ top: `${top}px` }">
        <div class="tool-panel-title"><div><small>草图</small><strong>操作提示</strong></div></div>
        <ul>
            <li>Space / 空格：拖动画布。</li>
            <li>Alt / Option：删除边。</li>
            <li>普通点击选择形状，Ctrl/Command 多选。</li>
            <li v-if="['polygon', 'line'].includes(profileType)">Line：超过 2 个点时，Shift + 点击连接首尾。</li>
            <li>双击 border：选择整个形状。</li>
            <li v-if="selectionTool">点、边、形状不混选，后选类型优先。</li>
            <li v-else-if="profileType === 'arc'">Arc：第 3 点确定圆弧，开放弧可独立存在。</li>
            <li v-else-if="profileType === 'circle'">圆形：拖动半径；扇形点控制角度，双击恢复。</li>
            <li v-else-if="profileType === 'ellipse'">椭圆：拖动双半径；扇形点控制角度，双击恢复。</li>
            <li v-else-if="profileType === 'rectangle'">矩形：角点调整长宽，中心点整体移动。</li>
            <li v-else-if="profileType === 'regular'">正多边形：拖动任一角调整半径和方向。</li>
        </ul>
    </aside>
</template>

<style lang="scss" scoped>
.hints-panel { position: absolute; z-index: 7; right: 12px; width: 174px; padding: 12px; background: transparent; border: 0; border-radius: 8px; box-shadow: none; transition: background .16s ease; }
.hints-panel:hover { background: var(--model3d-ui-0000000a); }
.tool-panel-title { margin-bottom: 10px; padding-bottom: 9px; border-bottom: 1px solid var(--model3d-ui-e3e9e5); }
.tool-panel-title > div { display: flex; flex-direction: column; gap: 2px; }
.tool-panel-title small { color: var(--model3d-ui-87938c); font-size: 8px; }
.tool-panel-title strong { font-size: 12px; }
ul { margin: 0; padding-left: 16px; list-style: disc; }
li { margin: 7px 0 0; color: var(--model3d-ui-7e8b83); font-size: 10px; line-height: 1.6; }
</style>
