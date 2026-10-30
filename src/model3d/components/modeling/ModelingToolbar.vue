<script setup lang="ts">
import { NIcon, NPopover } from 'naive-ui';
import { AddOutline, BuildOutline, CameraOutline, CutOutline, EyeOutline, LayersOutline, ListOutline, MoveOutline, PencilOutline, RepeatOutline, ResizeOutline, SearchOutline, TimeOutline } from '@vicons/ionicons5';
import ViewportToolItem from '../ui/ViewportToolItem.vue';
import SvgIcon from '../ui/SvgIcon.vue';

export interface HistoryStep { id: string; name: string; kind: string }
defineProps<{
    activePanel: string | null;
    activeTool: string;
    sketchMode: boolean;
    sectionActive: boolean;
    isolateActive: boolean;
    measureMode: boolean;
    itemsVisible: boolean;
    selectionKind: string | null;
    canIsolate: boolean;
    historySteps: HistoryStep[];
}>();
const emit = defineEmits<{
    panel: [panel: string];
    sketch: [];
    construct: [];
    tool: [tool: string];
    section: [];
    isolate: [];
    measure: [];
    items: [];
    history: [id: string];
}>();
const historyNames: Record<string, string> = { sketch: '草图', extrude: '拉伸', boolean: '布尔', fillet: '圆角', chamfer: '倒角' };
</script>

<template>
    <nav class="vertical-toolbar" :class="{ 'toolbar-leave': sketchMode || activePanel === 'sketch' }" aria-label="建模工具">
        <div class="menu-state">建模</div>
        <div class="tool-group primary-tools">
            <ViewportToolItem label="搜索" :active="activePanel === 'search'" @click="emit('panel', 'search')"><NIcon><SearchOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="草图" :active="activePanel === 'sketch' || sketchMode" @click="emit('sketch')"><SvgIcon name="pencil" /></ViewportToolItem>
            <ViewportToolItem label="插入" :active="activePanel === 'insert'" @click="emit('panel', 'insert')"><NIcon><AddOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="构造平面" @click="emit('construct')"><NIcon><LayersOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="工具" :active="activePanel === 'tools'" @click="emit('panel', 'tools')"><NIcon><BuildOutline /></NIcon></ViewportToolItem>
        </div>
        <div class="tool-group transform-tools">
            <ViewportToolItem label="移动" :active="activeTool === 'translate'" @click="emit('tool', 'translate')"><NIcon><MoveOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="旋转" :active="activeTool === 'rotate'" @click="emit('tool', 'rotate')"><NIcon><RepeatOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="缩放" :disabled="selectionKind === 'plane'" :active="activeTool === 'scale'" @click="emit('tool', 'scale')"><NIcon><ResizeOutline /></NIcon></ViewportToolItem>
        </div>
        <div class="toolbar-spacer"></div>
        <div class="tool-group primary-tools">
            <ViewportToolItem label="剖视图" :active="sectionActive" @click="emit('section')"><NIcon><CutOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="隔离" :active="isolateActive" :disabled="!canIsolate" @click="emit('isolate')"><NIcon><EyeOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="测量" :active="measureMode" @click="emit('measure')"><SvgIcon name="ruler" /></ViewportToolItem>
            <ViewportToolItem label="显示" :active="activePanel === 'display'" @click="emit('panel', 'display')"><NIcon><CameraOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem label="实体树" :active="itemsVisible" @click="emit('items')"><NIcon><ListOutline /></NIcon></ViewportToolItem>
            <NPopover trigger="click" placement="right-start">
                <template #trigger><ViewportToolItem label="历史"><NIcon><TimeOutline /></NIcon></ViewportToolItem></template>
                <div class="history-panel">
                    <strong>历史</strong>
                    <button v-for="step in historySteps" :key="step.id" type="button" @click="emit('history', step.id)"><span>{{ historyNames[step.kind] }}</span>{{ step.name }}<NIcon><PencilOutline /></NIcon></button>
                    <div v-if="!historySteps.length" class="history-empty">暂无步骤</div>
                </div>
            </NPopover>
        </div>
    </nav>
</template>

<style lang="scss" scoped>
.vertical-toolbar { position: absolute; z-index: 8; top: 12px; bottom: 43px; left: 12px; width: 48px; display: flex; flex-direction: column; padding: 4px; overflow: visible; transition: transform .24s ease, opacity .18s ease; }
.vertical-toolbar.toolbar-leave { transform: translateX(calc(-100% - 18px)); opacity: 0; pointer-events: none; }
.menu-state { padding: 5px 2px 7px; color: var(--model3d-ui-738079); font-size: 8px; text-align: center; }
.tool-group { display: flex; flex-direction: column; align-items: flex-start; flex: 0 0 auto; gap: 3px; padding: 4px 0; }
.transform-tools { margin: 8px 0; padding: 8px 0 !important; border-top: 1px solid var(--model3d-ui-e3e8e5); border-bottom: 1px solid var(--model3d-ui-e3e8e5); }
.toolbar-spacer { flex: 1; min-height: 2px; }
.history-panel { width: 220px; max-height: 340px; overflow-y: auto; }
.history-panel > strong { display: block; margin-bottom: 8px; font-size: 12px; }
.history-panel > button { width: 100%; display: flex; align-items: center; gap: 7px; padding: 8px 4px; border: 0; border-bottom: 1px solid var(--model3d-ui-edf0ee); background: transparent; color: var(--model3d-ui-4e5e54); font-size: 10px; text-align: left; cursor: pointer; }
.history-panel > button span { padding: 2px 4px; color: var(--model3d-ui-187566); background: var(--model3d-ui-e8f3ef); border-radius: 3px; font-size: 8px; }
.history-panel > button .n-icon { margin-left: auto; }
.history-empty { padding: 18px; color: var(--model3d-ui-8b9690); font-size: 10px; text-align: center; }
</style>
