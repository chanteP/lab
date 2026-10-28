<script setup lang="ts">
import { NButton, NIcon, NInput, NPopover, NSelect, NTooltip } from 'naive-ui';
import { ArrowRedoOutline, ArrowUndoOutline, ChevronDownOutline, CubeOutline, DocumentOutline, DownloadOutline, HelpCircleOutline } from '@vicons/ionicons5';
import { EXPORT_QUALITIES } from '../../config/configs';
import type { GeometryQuality } from '../../types';

defineProps<{ projectName: string; saving: boolean; canUndo: boolean; canRedo: boolean; exporting: boolean; exportQuality: GeometryQuality }>();
const emit = defineEmits<{
    name: [name: string];
    undo: [];
    redo: [];
    help: [];
    quality: [quality: GeometryQuality];
    export: [type: 'stl' | 'glb' | 'project'];
}>();
</script>

<template>
    <header class="topbar">
        <div class="brand"><div class="brand-mark"><NIcon :size="23"><CubeOutline /></NIcon></div><div><strong>FORM</strong><span>3D STUDIO</span></div></div>
        <div class="topbar-project">
            <span class="local-badge"><i></i> 本地</span>
            <NInput :value="projectName" class="project-name" size="small" :bordered="false" aria-label="项目名称" @update:value="emit('name', $event)" />
            <span v-if="saving" class="project-saving" title="保存中" aria-live="polite"><i></i></span>
        </div>
        <div class="topbar-actions">
            <NTooltip><template #trigger><button class="icon-button" aria-label="撤销" :disabled="!canUndo" @click="emit('undo')"><NIcon><ArrowUndoOutline /></NIcon></button></template>撤销 ⌘Z</NTooltip>
            <NTooltip><template #trigger><button class="icon-button" aria-label="重做" :disabled="!canRedo" @click="emit('redo')"><NIcon><ArrowRedoOutline /></NIcon></button></template>重做 ⇧⌘Z</NTooltip>
            <button class="icon-button" aria-label="帮助" @click="emit('help')"><NIcon><HelpCircleOutline /></NIcon></button>
            <NPopover trigger="click" placement="bottom-end" :show-arrow="false" content-class="export-popover">
                <template #trigger><NButton type="primary" :loading="exporting"><template #icon><NIcon><DownloadOutline /></NIcon></template>导出<NIcon class="chevron"><ChevronDownOutline /></NIcon></NButton></template>
                <div class="export-panel">
                    <div class="popover-title">导出</div><label>精度</label>
                    <NSelect :value="exportQuality" size="small" :options="EXPORT_QUALITIES" @update:value="emit('quality', $event)" />
                    <p>由参数重新生成。</p>
                    <NButton block secondary @click="emit('export', 'stl')">STL <span>用于 3D 打印</span></NButton>
                    <NButton block secondary @click="emit('export', 'glb')">GLB <span>包含材质</span></NButton>
                    <div class="popover-divider"></div><button class="text-action" @click="emit('export', 'project')"><NIcon><DocumentOutline /></NIcon>项目 JSON</button>
                </div>
            </NPopover>
        </div>
    </header>
</template>

<style lang="scss" scoped>
.topbar { height: 50px; flex: 0 0 50px; display: flex; align-items: center; gap: 24px; padding: 0 20px; background: var(--model3d-ui-fcfdfc); border-bottom: 1px solid var(--model3d-ui-dfe5e1); z-index: 20; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 196px; }
.brand-mark { width: 32px; height: 32px; display: grid; place-items: center; color: var(--model3d-ui-white); background: var(--model3d-ui-147d70); border-radius: 9px; }
.brand > div:last-child { display: flex; align-items: baseline; gap: 7px; }
.brand strong { font-size: 17px; letter-spacing: 2.4px; }
.brand span { font-size: 9px; color: var(--model3d-ui-89938e); letter-spacing: 1.5px; }
.topbar-project { display: flex; align-items: center; gap: 10px; flex: 1; max-width: 430px; }
.local-badge { white-space: nowrap; color: var(--model3d-ui-6d7873); font-size: 11px; padding: 5px 8px; border: 1px solid var(--model3d-ui-e2e7e4); border-radius: 5px; }
.local-badge i { display: inline-block; width: 5px; height: 5px; margin-right: 4px; background: var(--model3d-ui-54a184); border-radius: 50%; }
.project-name { flex: 1; min-width: 80px; font-size: 13px; font-weight: 600; }
.topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 5px; }
.topbar-actions .n-button { margin-left: 10px; background: var(--model3d-ui-147d70); border-radius: 7px; font-weight: 600; }
.icon-button { width: 31px; height: 31px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; font-size: 18px; }
.icon-button:hover { background: var(--model3d-ui-edf1ee); }
.icon-button:disabled { opacity: .25; cursor: default; }
.project-saving { width: 18px; height: 18px; display: inline-grid; place-items: center; }
.project-saving i { width: 13px; height: 13px; border: 2px solid var(--model3d-ui-b8c6bf); border-top-color: var(--model3d-ui-147d70); border-radius: 50%; animation: spin .7s linear infinite; }
.chevron { margin-left: 5px; }
.export-panel { width: 245px; padding: 5px; }
.popover-title { margin-bottom: 15px; font-size: 13px; font-weight: 650; }
.export-panel > label { display: block; margin-bottom: 6px; color: var(--model3d-ui-7e8983); font-size: 10px; }
.export-panel > p { margin: 8px 0 13px; color: var(--model3d-ui-87948c); font-size: 9px; }
.export-panel > .n-button { margin-top: 7px; }
.export-panel > .n-button span { margin-left: auto; color: var(--model3d-ui-87948c); font-size: 9px; }
.popover-divider { height: 1px; margin: 12px 0 8px; background: var(--model3d-ui-e6eae7); }
.text-action { width: 100%; display: flex; align-items: center; gap: 6px; padding: 5px; border: 0; background: transparent; color: var(--model3d-ui-64736a); font-size: 10px; cursor: pointer; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
