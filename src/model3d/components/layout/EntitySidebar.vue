<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NIcon, NInput, NPopconfirm, NPopover, NSelect } from 'naive-ui';
import {
    AddOutline, ArrowRedoOutline, ArrowUndoOutline, ChevronDownOutline, CopyOutline, CubeOutline,
    DocumentOutline, DownloadOutline, FolderOpenOutline, FolderOutline, HelpCircleOutline, TrashOutline,
} from '@vicons/ionicons5';
import EntityTree, { type OutlinerNode } from '../entity/EntityTree.vue';
import { EXPORT_QUALITIES } from '../../config/configs';
import type { GeometryQuality, ProjectRecord } from '../../types';

const props = defineProps<{
    visible: boolean;
    projects: ProjectRecord[];
    projectId: string;
    projectName: string;
    saving: boolean;
    canUndo: boolean;
    canRedo: boolean;
    exporting: boolean;
    exportQuality: GeometryQuality;
    nodes: OutlinerNode[];
    selectedIds: string[];
    entityCount: number;
}>();
const emit = defineEmits<{
    open: [id: string];
    create: [];
    duplicate: [];
    import: [];
    remove: [];
    folder: [];
    select: [id: string, additive: boolean];
    activate: [id: string];
    context: [node: OutlinerNode, event: MouseEvent];
    drop: [ids: string[], targetId: string | null];
    toggle: [id: string];
    name: [name: string];
    undo: [];
    redo: [];
    help: [];
    quality: [quality: GeometryQuality];
    export: [type: 'stl' | 'glb' | 'project'];
}>();
const options = computed(() => props.projects.map((item) => ({ label: item.name, value: item.id })));
</script>

<template>
    <aside v-show="visible" class="left-panel panel" aria-label="项目与实体树">
        <section class="sidebar-header">
            <div class="sidebar-brand-row">
                <div class="sidebar-brand"><span class="sidebar-brand-mark"><NIcon :size="20"><CubeOutline /></NIcon></span><strong>Builder <small>3D</small></strong></div>
                <div class="sidebar-actions">
                    <button aria-label="撤销" title="撤销 ⌘Z" :disabled="!canUndo" @click="emit('undo')"><NIcon><ArrowUndoOutline /></NIcon></button>
                    <button aria-label="重做" title="重做 ⇧⌘Z" :disabled="!canRedo" @click="emit('redo')"><NIcon><ArrowRedoOutline /></NIcon></button>
                    <button aria-label="帮助" title="帮助" @click="emit('help')"><NIcon><HelpCircleOutline /></NIcon></button>
                </div>
            </div>
            <div class="sidebar-project">
                <span class="sidebar-local" title="本地项目"><i></i></span>
                <NInput :value="projectName" size="small" :bordered="false" aria-label="项目名称" @update:value="emit('name', $event)" />
                <span v-if="saving" class="project-saving" title="保存中" aria-live="polite"><i></i></span>
            </div>
            <NPopover trigger="click" placement="bottom-start" :show-arrow="false" content-class="export-popover">
                <template #trigger><NButton class="sidebar-export" size="small" type="primary" block :loading="exporting"><template #icon><NIcon><DownloadOutline /></NIcon></template>导出<NIcon><ChevronDownOutline /></NIcon></NButton></template>
                <div class="export-panel">
                    <div class="popover-title">导出</div>
                    <label>精度</label>
                    <NSelect :value="exportQuality" size="small" :options="EXPORT_QUALITIES" @update:value="emit('quality', $event)" />
                    <p>由参数重新生成。</p>
                    <NButton block secondary @click="emit('export', 'stl')">STL <span>用于 3D 打印</span></NButton>
                    <NButton block secondary @click="emit('export', 'glb')">GLB <span>包含材质</span></NButton>
                    <div class="popover-divider"></div>
                    <button class="text-action" @click="emit('export', 'project')"><NIcon><DocumentOutline /></NIcon>项目 JSON</button>
                </div>
            </NPopover>
        </section>

        <section class="objects-section">
            <div class="section-label">实体 <span class="section-actions"><button class="add-folder" title="新建文件夹" aria-label="新建文件夹" @click="emit('folder')"><NIcon><FolderOutline /></NIcon></button><i>{{ entityCount }}</i></span></div>
            <div class="object-list">
                <div v-if="!nodes.length" class="empty-objects">从左侧开始建模</div>
                <EntityTree :nodes="nodes" :selected-ids="selectedIds" @select="(id, additive) => emit('select', id, additive)" @activate="emit('activate', $event)" @context="(node, event) => emit('context', node, event)" @drop="(ids, target) => emit('drop', ids, target)" @toggle="emit('toggle', $event)" />
            </div>
        </section>
        <section class="project-section">
            <div class="section-label">项目</div>
            <NSelect :value="projectId" :options="options" size="small" aria-label="当前项目" @update:value="emit('open', $event)" />
            <div class="project-actions">
                <button @click="emit('create')"><NIcon><AddOutline /></NIcon><span>新建</span></button>
                <button @click="emit('duplicate')"><NIcon><CopyOutline /></NIcon><span>复制</span></button>
                <button @click="emit('import')"><NIcon><FolderOpenOutline /></NIcon><span>导入</span></button>
                <NPopconfirm @positive-click="emit('remove')"><template #trigger><button class="danger-hover"><NIcon><TrashOutline /></NIcon><span>删除</span></button></template>删除当前项目？此操作不可撤销。</NPopconfirm>
            </div>
        </section>
    </aside>
</template>

<style lang="scss" scoped>
.panel { background: linear-gradient(90deg, var(--model3d-ui-fff) 0%, rgba(255,255,255,.98) 78%, rgba(255,255,255,.95) 95%, transparent 100%); }
.left-panel { position: fixed; z-index: 20; inset: 0 auto 0 0; width: 218px; height: 100%; display: flex; flex-direction: column; padding-right: 12px; border: 0; }
.sidebar-header { display: grid; gap: 9px; padding: 14px 10px 12px; border-bottom: 1px solid var(--model3d-ui-e7ebe8); }
.sidebar-brand-row { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
.sidebar-brand { display: flex; align-items: center; gap: 7px; }
.sidebar-brand-mark { width: 29px; height: 29px; display: grid; place-items: center; color: var(--model3d-ui-fff); background: var(--model3d-ui-147d70); border-radius: 8px; }
.sidebar-brand strong { font-size: 14px; letter-spacing: .2px; white-space: nowrap; }
.sidebar-brand small { margin-left: 3px; color: var(--model3d-ui-89938e); font-size: 8px; font-weight: 500; }
.sidebar-actions { display: flex; }
.sidebar-actions button { width: 25px; height: 28px; display: grid; place-items: center; padding: 0; color: var(--model3d-ui-66766d); background: transparent; border: 0; border-radius: 4px; font-size: 15px; cursor: pointer; }
.sidebar-actions button:hover { color: var(--model3d-ui-147d70); background: var(--model3d-ui-edf3ef); }
.sidebar-actions button:disabled { opacity: .25; cursor: default; }
.sidebar-project { display: flex; align-items: center; gap: 5px; min-width: 0; border-bottom: 1px solid var(--model3d-ui-e1e7e3); }
.sidebar-project :deep(.n-input) { min-width: 0; font-size: 12px; font-weight: 600; }
.sidebar-local { display: grid; place-items: center; width: 16px; flex: 0 0 16px; }
.sidebar-local i { width: 5px; height: 5px; background: var(--model3d-ui-54a184); border-radius: 50%; }
.sidebar-export { background: var(--model3d-ui-147d70); border-radius: 5px; }
.project-saving { width: 16px; height: 16px; display: inline-grid; place-items: center; }
.project-saving i { width: 12px; height: 12px; border: 2px solid var(--model3d-ui-b8c6bf); border-top-color: var(--model3d-ui-147d70); border-radius: 50%; animation: spin .7s linear infinite; }
.objects-section { display: flex; flex-direction: column; flex: 1; min-height: 120px; padding: 12px 10px 10px; }
.section-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 6px; color: var(--model3d-ui-707d76); font-size: 10px; font-weight: 700; letter-spacing: 1.2px; }
.section-actions { display: flex; align-items: center; gap: 7px; }
.section-actions button { display: flex; align-items: center; padding: 2px 5px; border: 0; background: transparent; color: var(--model3d-ui-527067); cursor: pointer; }
.section-actions .add-folder { width: 27px; height: 27px; justify-content: center; padding: 0; border-radius: 4px; font-size: 18px; }
.section-actions .add-folder:hover { color: var(--model3d-ui-147d70); background: var(--model3d-ui-e9edea); }
.section-actions i { min-width: 18px; padding: 1px 5px; text-align: center; background: var(--model3d-ui-e9edea); border-radius: 8px; font-size: 9px; font-style: normal; }
.object-list { flex: 1; overflow-y: auto; scrollbar-width: thin; }
.empty-objects { padding: 28px 10px; color: var(--model3d-ui-8c9891); text-align: center; font-size: 11px; line-height: 1.7; }
.project-section { padding: 12px 16px 16px; border-top: 1px solid var(--model3d-ui-e4e8e5); }
.project-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 8px; }
.project-actions button { height: 36px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 1px solid var(--model3d-ui-e1e6e3); background: var(--model3d-ui-white); border-radius: 5px; cursor: pointer; color: var(--model3d-ui-64716a); font-size: 9px; }
.project-actions button:hover { color: var(--model3d-ui-147d70); border-color: var(--model3d-ui-a9c9c2); }
.project-actions .danger-hover:hover { color: var(--model3d-ui-c45757); border-color: var(--model3d-ui-e2bcbc); }
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
