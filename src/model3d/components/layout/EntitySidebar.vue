<script setup lang="ts">
import { computed } from 'vue';
import { NIcon, NPopconfirm, NSelect } from 'naive-ui';
import { AddOutline, CopyOutline, FolderOpenOutline, FolderOutline, TrashOutline } from '@vicons/ionicons5';
import EntityTree, { type OutlinerNode } from '../entity/EntityTree.vue';
import type { ProjectRecord } from '../../types';

const props = defineProps<{ visible: boolean; projects: ProjectRecord[]; projectId: string; nodes: OutlinerNode[]; selectedIds: string[]; entityCount: number }>();
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
}>();
const options = computed(() => props.projects.map((item) => ({ label: item.name, value: item.id })));
</script>

<template>
    <aside v-show="visible" class="left-panel panel" aria-label="项目与实体树">
        <section class="objects-section">
            <div class="section-label">实体 <span class="section-actions"><button title="新建文件夹" aria-label="新建文件夹" @click="emit('folder')"><NIcon><FolderOutline /></NIcon> +</button><i>{{ entityCount }}</i></span></div>
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
.panel { background: #fafbfa; }
.left-panel { width: 218px; flex: 0 0 218px; display: flex; flex-direction: column; border-right: 1px solid #dfe5e1; z-index: 5; }
.objects-section { display: flex; flex-direction: column; flex: 1; min-height: 160px; padding: 18px 10px 10px; }
.section-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding: 0 6px; color: #707d76; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; }
.section-actions { display: flex; align-items: center; gap: 7px; }
.section-actions button { display: flex; align-items: center; gap: 2px; padding: 2px 5px; border: 1px solid #dce4df; border-radius: 4px; background: #fff; color: #527067; font-size: 9px; cursor: pointer; }
.section-actions i { min-width: 18px; padding: 1px 5px; text-align: center; background: #e9edea; border-radius: 8px; font-size: 9px; font-style: normal; }
.object-list { flex: 1; overflow-y: auto; }
.empty-objects { padding: 28px 10px; color: #8c9891; text-align: center; font-size: 11px; line-height: 1.7; }
.project-section { padding: 16px; border-top: 1px solid #e4e8e5; }
.project-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 10px; }
.project-actions button { height: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 1px solid #e1e6e3; background: white; border-radius: 5px; cursor: pointer; color: #64716a; font-size: 9px; }
.project-actions button:hover { color: #147d70; border-color: #a9c9c2; }
.project-actions .danger-hover:hover { color: #c45757; border-color: #e2bcbc; }
@media (max-width: 1050px) { .left-panel { width: 194px; flex-basis: 194px; } }
</style>
