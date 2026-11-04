<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { onClickOutside, useEventListener } from '@vueuse/core';
import { NCheckbox, NIcon, NTooltip } from 'naive-ui';
import { CameraOutline, CloseOutline, GridOutline, ScanOutline } from '@vicons/ionicons5';
import SvgIcon from '../ui/SvgIcon.vue';
import FloatingPanel from '../ui/FloatingPanel.vue';
import { DISPLAY_MODES } from '../../config/configs';
import type { DisplayMode } from '../../types';

defineProps<{
    measureMode: boolean;
    sectionActive: boolean;
    sketchMode: boolean;
    projectionMode: 'perspective' | 'orthographic';
    scaleBar: { width: number; value: number; segments: number; gridSize: number };
    scaleBarLabel: string;
    displayMode: DisplayMode;
    showEdges: boolean;
    shadowVisible: boolean;
    gridVisible: boolean;
}>();
const emit = defineEmits<{
    measure: [];
    section: [];
    fit: [];
    projection: [];
    displayMode: [mode: DisplayMode];
    showEdges: [value: boolean];
    shadowVisible: [value: boolean];
    gridVisible: [value: boolean];
}>();
const settingsOpen = ref(false);
const settingsPanel = ref<InstanceType<typeof FloatingPanel> | null>(null);
const settingsButton = ref<HTMLButtonElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

function closeSettings(returnFocus = false) {
    if (!settingsOpen.value) return;
    settingsOpen.value = false;
    if (returnFocus) nextTick(() => settingsButton.value?.focus());
}

watch(settingsOpen, async (open) => {
    if (open) { await nextTick(); closeButton.value?.focus(); }
});
onClickOutside(settingsPanel, () => closeSettings(), { ignore: [settingsButton] });
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && settingsOpen.value) {
        event.stopImmediatePropagation();
        closeSettings(true);
    }
});
</script>

<template>
    <div class="viewport-utilities">
        <template v-if="!sketchMode">
            <div class="display-mode-actions" role="group" aria-label="显示模式">
                <NTooltip v-for="mode in DISPLAY_MODES" :key="mode.value">
                    <template #trigger><button :aria-label="mode.label" :aria-pressed="displayMode === mode.value" :class="{ active: displayMode === mode.value }" @click.stop="emit('displayMode', mode.value)"><SvgIcon :name="mode.icon" /></button></template>
                    {{ mode.label }}
                </NTooltip>
            </div>
            <div class="utility-divider" role="separator" aria-orientation="vertical"></div>
        </template>
        <div class="measure-actions">
            <NTooltip><template #trigger><button aria-label="测量" :class="{ active: measureMode }" @click.stop="emit('measure')"><SvgIcon name="ruler" /></button></template>测量</NTooltip>
            <NTooltip><template #trigger><button aria-label="剖视图" :aria-pressed="sectionActive && !sketchMode" :disabled="sketchMode" :class="{ active: sectionActive && !sketchMode }" @click.stop="emit('section')"><SvgIcon name="section" /></button></template>剖视图</NTooltip>
            <div class="settings-control">
                <NTooltip><template #trigger><button ref="settingsButton" aria-label="显示与相机设置" :aria-expanded="settingsOpen" :class="{ active: settingsOpen }" @click.stop="settingsOpen = !settingsOpen"><NIcon><component :is="projectionMode === 'perspective' ? CameraOutline : GridOutline" /></NIcon></button></template>显示与相机设置</NTooltip>
                <FloatingPanel v-if="settingsOpen" ref="settingsPanel" class="display-settings" arrow="bottom" label="显示与相机设置" @click.stop>
                    <div class="tool-panel-title"><div><small>视口</small><strong>显示与相机设置</strong></div><button ref="closeButton" aria-label="关闭显示设置" @click="closeSettings(true)"><NIcon><CloseOutline /></NIcon></button></div>
                    <NCheckbox :checked="showEdges" size="small" @update:checked="emit('showEdges', $event)">显示边线</NCheckbox>
                    <NCheckbox :checked="shadowVisible" size="small" @update:checked="emit('shadowVisible', $event)">地面投影</NCheckbox>
                    <NCheckbox :checked="gridVisible" size="small" @update:checked="emit('gridVisible', $event)">网格</NCheckbox>
                    <div class="panel-section-label">相机</div>
                    <p class="panel-note">正交相机保持草图和工程视图比例，透视相机提供空间深度。</p>
                    <div class="display-mode-grid"><button :class="{ active: projectionMode === 'perspective' }" @click="projectionMode !== 'perspective' && emit('projection')">透视</button><button :class="{ active: projectionMode === 'orthographic' }" @click="projectionMode !== 'orthographic' && emit('projection')">正交</button></div>
                </FloatingPanel>
            </div>
            <NTooltip><template #trigger><button aria-label="适配视图" @click.stop="emit('fit')"><NIcon><ScanOutline /></NIcon></button></template>适配视图</NTooltip>
        </div>
        <div class="scale-indicator"><div class="scale-rule" :style="{ width: `${scaleBar.width}px` }"><i v-for="index in scaleBar.segments" :key="index"></i></div><span>{{ scaleBarLabel }}</span></div>
    </div>
</template>

<style lang="scss" scoped>
.display-mode-actions { display: flex; align-items: center; gap: 6px; }
.display-mode-actions button {
    width: 25px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    color: var(--model3d-ui-607168);
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
}
.display-mode-actions button:hover { color: var(--model3d-ui-147d70); }
.display-mode-actions button.active { color: var(--model3d-ui-147d70); background: var(--model3d-ui-147d7018); }
.display-mode-actions .svg-icon { width: 19px; height: 19px; }
.utility-divider { width: 1px; height: 19px; margin: 0 2px; background: var(--model3d-ui-d4dfd8); }
.settings-control { position: relative; width: 24px; height: 28px; display: grid; place-items: center; }
.measure-actions button:disabled, .measure-actions button:disabled:hover { color: var(--model3d-ui-607168); opacity: .3; cursor: not-allowed; }
.display-settings { right: 50%; bottom: 40px; width: 224px; transform: translateX(50%); }
.display-settings :deep(.n-checkbox) { display: flex; margin: 11px 3px; }
.display-settings .display-mode-grid { margin-bottom: 0; }
.display-settings .display-mode-grid > button { background: transparent; border-color: transparent; }
.display-settings .display-mode-grid > button:hover,
.display-settings .display-mode-grid > button.active { color: var(--model3d-ui-147d70); background: transparent; border-color: transparent; }
button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
</style>
