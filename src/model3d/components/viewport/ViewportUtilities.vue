<script setup lang="ts">
import { ref } from 'vue';
import { NCheckbox, NIcon, NTooltip } from 'naive-ui';
import { CameraOutline, CloseOutline, GridOutline, ScanOutline } from '@vicons/ionicons5';
import SvgIcon from '../ui/SvgIcon.vue';

defineProps<{
    measureMode: boolean;
    projectionMode: 'perspective' | 'orthographic';
    scaleBar: { width: number; value: number };
    scaleBarLabel: string;
    displayMode: 'shaded' | 'wireframe' | 'xray';
    showEdges: boolean;
    shadowVisible: boolean;
    gridVisible: boolean;
}>();
const emit = defineEmits<{
    measure: [];
    fit: [];
    projection: [];
    displayMode: [mode: 'shaded' | 'wireframe' | 'xray'];
    showEdges: [value: boolean];
    shadowVisible: [value: boolean];
    gridVisible: [value: boolean];
}>();
const settingsOpen = ref(false);
</script>

<template>
    <div class="viewport-utilities">
        <div class="measure-actions">
            <NTooltip><template #trigger><button aria-label="测量" :class="{ active: measureMode }" @click.stop="emit('measure')"><SvgIcon name="ruler" /></button></template>测量</NTooltip>
            <NTooltip><template #trigger><button aria-label="显示与相机设置" :class="{ active: settingsOpen }" @click.stop="settingsOpen = !settingsOpen"><NIcon><component :is="projectionMode === 'perspective' ? CameraOutline : GridOutline" /></NIcon></button></template>显示与相机设置</NTooltip>
            <NTooltip><template #trigger><button aria-label="适配视图" @click.stop="emit('fit')"><NIcon><ScanOutline /></NIcon></button></template>适配视图</NTooltip>
        </div>
        <div class="scale-indicator"><div class="scale-rule" :style="{ width: `${scaleBar.width}px` }"><i></i><i></i><i></i></div><span>{{ scaleBarLabel }}</span></div>

        <aside v-if="settingsOpen" class="tool-panel display-settings" @click.stop>
            <div class="tool-panel-title"><div><small>视口</small><strong>显示与相机设置</strong></div><button aria-label="关闭显示设置" @click="settingsOpen = false"><NIcon><CloseOutline /></NIcon></button></div>
            <div class="panel-section-label">显示模式</div>
            <div class="display-mode-grid"><button :class="{ active: displayMode === 'shaded' }" @click="emit('displayMode', 'shaded')">实体着色</button><button :class="{ active: displayMode === 'wireframe' }" @click="emit('displayMode', 'wireframe')">线框</button><button :class="{ active: displayMode === 'xray' }" @click="emit('displayMode', 'xray')">透视</button></div>
            <NCheckbox :checked="showEdges" size="small" @update:checked="emit('showEdges', $event)">显示边线</NCheckbox>
            <NCheckbox :checked="shadowVisible" size="small" @update:checked="emit('shadowVisible', $event)">地面投影</NCheckbox>
            <NCheckbox :checked="gridVisible" size="small" @update:checked="emit('gridVisible', $event)">网格</NCheckbox>
            <div class="panel-section-label">相机</div>
            <p class="panel-note">正交相机保持草图和工程视图比例，透视相机提供空间深度。</p>
            <div class="display-mode-grid"><button :class="{ active: projectionMode === 'perspective' }" @click="projectionMode !== 'perspective' && emit('projection')">透视</button><button :class="{ active: projectionMode === 'orthographic' }" @click="projectionMode !== 'orthographic' && emit('projection')">正交</button></div>
        </aside>
    </div>
</template>

<style lang="scss" scoped>
.display-settings.tool-panel { top: auto; right: 0; bottom: 46px; left: auto; width: 224px; max-height: none; overflow: visible; }
</style>
