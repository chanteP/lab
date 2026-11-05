<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { NIcon } from 'naive-ui';
import { ChevronForwardOutline, ChevronDownOutline, CubeOutline, FolderOutline, GridOutline, EyeOutline, EyeOffOutline } from '@vicons/ionicons5';
import type { ModelEntity } from '../../types';

export interface OutlinerNode {
    id: string;
    kind: 'entity' | 'folder' | 'plane';
    name: string;
    parentId?: string | null;
    visible?: boolean;
    children: OutlinerNode[];
    profileType?: ModelEntity['profileType'];
    trimmed?: boolean;
}

type DropTarget = { id: string; mode: 'before' | 'after' | 'inside' } | null;
const props = withDefaults(defineProps<{ nodes: OutlinerNode[]; selectedIds: string[]; depth?: number; parentLast?: boolean[] }>(), { depth: 0, parentLast: () => [] });
const emit = defineEmits<{
    select: [id: string | null, additive: boolean, shiftKey: boolean];
    activate: [id: string];
    rename: [id: string, name: string];
    toggle: [id: string];
    context: [node: OutlinerNode, event: MouseEvent];
    drop: [ids: string[], targetId: string | null];
}>();
const expanded = ref(new Set<string>());
const dropTarget = ref<DropTarget>(null);
const editingId = ref<string | null>(null);
const renameValue = ref('');
const nameInput = ref<HTMLInputElement | HTMLInputElement[]>();
const nameClickTimers = new Map<string, ReturnType<typeof setTimeout>>();

watch(() => props.nodes, (nodes) => {
    nodes.forEach((node) => expanded.value.add(node.id));
}, { immediate: true, deep: true });

function beginRename(node: OutlinerNode) {
    editingId.value = node.id;
    renameValue.value = node.name;
    nextTick(() => {
        const input = Array.isArray(nameInput.value) ? nameInput.value[0] : nameInput.value;
        input?.focus();
        input?.select();
    });
}
function onRowClick(node: OutlinerNode, event: MouseEvent) {
    if (editingId.value === node.id) return;
    emit('select', node.id, event.metaKey || event.ctrlKey, event.shiftKey);
}
function onNameClick(node: OutlinerNode, event: MouseEvent) {
    const renameSelected = props.selectedIds.length === 1 && props.selectedIds[0] === node.id && !event.metaKey && !event.ctrlKey && !event.shiftKey;
    clearTimeout(nameClickTimers.get(node.id));
    if (event.detail >= 2) return;
    nameClickTimers.set(node.id, setTimeout(() => {
        if (editingId.value) return;
        if (renameSelected) beginRename(node);
        else onRowClick(node, event);
    }, 220));
}
function onNameDoubleClick(node: OutlinerNode) {
    clearTimeout(nameClickTimers.get(node.id));
    emit('activate', node.id);
}
function commitRename() {
    if (!editingId.value) return;
    const id = editingId.value;
    const name = renameValue.value.trim();
    editingId.value = null;
    if (name) emit('rename', id, name);
}
function toggleExpanded(id: string) {
    expanded.value.has(id) ? expanded.value.delete(id) : expanded.value.add(id);
}
function dragStart(node: OutlinerNode, event: DragEvent) {
    const ids = props.selectedIds.includes(node.id) ? props.selectedIds : [node.id];
    event.dataTransfer?.setData('application/x-form-nodes', JSON.stringify(ids));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    if (!props.selectedIds.includes(node.id)) emit('select', node.id, false, false);
}
function setDropTarget(node: OutlinerNode, event: DragEvent) {
    if (node.kind === 'folder') dropTarget.value = { id: node.id, mode: 'inside' };
    else {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        dropTarget.value = { id: node.id, mode: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' };
    }
}
function drop(event: DragEvent, node: OutlinerNode | null) {
    event.preventDefault();
    const mode = dropTarget.value?.mode;
    dropTarget.value = null;
    try {
        const ids = JSON.parse(event.dataTransfer?.getData('application/x-form-nodes') || '[]');
        const targetId = node?.kind === 'folder' && mode === 'inside' ? node.id : node?.parentId || null;
        if (Array.isArray(ids) && ids.length) emit('drop', ids, targetId);
    } catch { /* Ignore external drag data. */ }
}

onBeforeUnmount(() => nameClickTimers.forEach(clearTimeout));
</script>

<template>
    <div class="tree-level" @dragover.prevent @drop="drop($event, null)" @click.self="emit('select', null, false, false)">
        <div v-for="(node, index) in nodes" :key="node.id" class="tree-node">
            <div class="object-row" :data-node-id="node.id" :class="{ selected: selectedIds.includes(node.id), muted: node.visible === false, 'drop-target': dropTarget?.id === node.id && dropTarget.mode === 'inside', 'drop-before': dropTarget?.id === node.id && dropTarget.mode === 'before', 'drop-after': dropTarget?.id === node.id && dropTarget.mode === 'after' }"
                draggable="true" @click="onRowClick(node, $event)"
                @contextmenu.prevent.stop="emit('context', node, $event)" @dblclick.stop.prevent="emit('activate', node.id)" @dragstart="dragStart(node, $event)"
                @dragover.prevent.stop="setDropTarget(node, $event)" @dragleave="dropTarget = null" @drop.stop="drop($event, node)">
                <span class="tree-guides" aria-hidden="true">
                    <span v-for="(guideLast, guideIndex) in parentLast" :key="guideIndex" class="tree-guide" :class="{ connected: !guideLast }"></span>
                    <span v-if="depth" class="tree-guide tree-branch" :class="{ last: index === nodes.length - 1 }"></span>
                </span>
                <button v-if="node.children.length" class="tree-disclosure" @click.stop="toggleExpanded(node.id)"><NIcon><component :is="expanded.has(node.id) ? ChevronDownOutline : ChevronForwardOutline" /></NIcon></button>
                <span v-else class="tree-disclosure-spacer"></span>
                <NIcon class="object-type"><component :is="node.kind === 'folder' ? FolderOutline : node.kind === 'plane' ? GridOutline : CubeOutline" /></NIcon>
                <input v-if="editingId === node.id" ref="nameInput" v-model="renameValue" class="object-name object-name-input" :aria-label="`重命名${node.name}`"
                    @click.stop @dblclick.stop @pointerdown.stop @blur="commitRename" @keydown.enter.stop.prevent="commitRename" @keydown.esc.stop.prevent="editingId = null" />
                <span v-else class="object-name" @click.stop="onNameClick(node, $event)" @dblclick.stop.prevent="onNameDoubleClick(node)">{{ node.name }}</span>
                <button class="visibility" @click.stop="emit('toggle', node.id)"><NIcon><component :is="node.visible ? EyeOutline : EyeOffOutline" /></NIcon></button>
            </div>
            <EntityTree v-if="node.children.length && expanded.has(node.id)" class="tree-children" :nodes="node.children" :selected-ids="selectedIds" :depth="depth + 1" :parent-last="depth ? [...parentLast, index === nodes.length - 1] : []"
                @select="(id, additive, shiftKey) => emit('select', id, additive, shiftKey)" @activate="(id) => emit('activate', id)" @toggle="(id) => emit('toggle', id)"
                @context="(child, event) => emit('context', child, event)" @drop="(ids, targetId) => emit('drop', ids, targetId)" @rename="(id, name) => emit('rename', id, name)" />
        </div>
        <div v-if="!depth" class="tree-drop-blank" :class="{ active: dropTarget?.id === 'blank' }" aria-label="移动到根层级"
            @click="emit('select', null, false, false)" @dragover.prevent.stop="dropTarget = { id: 'blank', mode: 'after' }" @dragleave="dropTarget = null" @drop.stop="drop($event, null)"></div>
    </div>
</template>

<style lang="scss" scoped>
.tree-level { min-height: 100%; display: flex; flex-direction: column; }
.tree-children { margin-left: 0; padding-left: 0; }
.tree-guides { display: flex; align-self: stretch; flex: 0 0 auto; }
.tree-guide { position: relative; width: 13px; height: 100%; flex: 0 0 13px; color: var(--model3d-ui-b8c6bf); }
.tree-guide.connected::before, .tree-branch::before { content: ''; position: absolute; top: 0; bottom: 0; left: 4px; border-left: 1px solid currentColor; }
.tree-branch.last::before { bottom: 50%; }
.tree-branch::after { content: ''; position: absolute; top: 50%; left: 4px; width: 9px; border-top: 1px solid currentColor; }
.object-row { position: relative; }
.object-row::before, .object-row::after { content: ''; position: absolute; z-index: 3; right: 0; left: 0; height: 0; pointer-events: none; }
.object-row.drop-before::before { top: 0; border-top: 2px solid var(--model3d-ui-147d70); }
.object-row.drop-after::after { bottom: 0; border-top: 2px solid var(--model3d-ui-147d70); }
.object-row > .object-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.object-row .visibility { margin-left: auto; }
.object-name-input { width: 0; height: 25px; padding: 2px 5px; color: var(--model3d-ui-314139); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-9cc8bb); border-radius: 4px; font: inherit; outline: 0; }
.tree-drop-blank { position: relative; flex: 1; min-height: 38px; }
.tree-drop-blank.active::before { content: ''; position: absolute; top: 0; right: 0; left: 0; border-top: 2px solid var(--model3d-ui-147d70); }
</style>
