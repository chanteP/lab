<script setup lang="ts">
import { NIcon, NPopover } from 'naive-ui';
import { AddOutline, EyeOutline, FolderOpenOutline, LayersOutline, MoveOutline, PencilOutline, RemoveOutline, RepeatOutline, ResizeOutline, TimeOutline } from '@vicons/ionicons5';
import ViewportToolItem from '../ui/ViewportToolItem.vue';
import SvgIcon from '../ui/SvgIcon.vue';

export interface HistoryStep { id: string; name: string; kind: string }
defineProps<{
    activePanel: string | null;
    activeTool: string;
    sketchMode: boolean;
    isolateActive: boolean;
    selectionKind: string | null;
    canIsolate: boolean;
    canBoolean: boolean;
    canShell: boolean;
    canRotateAxis: boolean;
    canRevolve: boolean;
    selectedCount: number;
    historySteps: HistoryStep[];
}>();
const emit = defineEmits<{
    panel: [panel: string];
    sketch: [];
    tool: [tool: string];
    isolate: [];
    history: [id: string];
    import: [];
    boolean: [type: 'union' | 'subtract' | 'intersect'];
    shell: [event: MouseEvent];
    rotateAxis: [];
    revolve: [];
}>();
const historyNames: Record<string, string> = { sketch: '草图', extrude: '拉伸', boolean: '布尔' };
</script>

<template>
    <nav class="vertical-toolbar" :class="{ 'toolbar-leave': sketchMode || activePanel }" aria-label="建模工具">
        <div class="toolbar-section toolbar-top">
            <div class="tool-group primary-tools">
                <ViewportToolItem :description-on-hover="false" label="构造平面" :active="activePanel === 'construct'" @click="emit('panel', 'construct')"><NIcon><LayersOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem :description-on-hover="false" label="草图" :active="activePanel === 'sketch' || sketchMode" @click="emit('sketch')"><SvgIcon name="pencil" /></ViewportToolItem>
                <ViewportToolItem :description-on-hover="false" label="插入" :active="activePanel === 'insert'" @click="emit('panel', 'insert')"><NIcon><AddOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem :description-on-hover="false" label="导入" @click="emit('import')"><NIcon><FolderOpenOutline /></NIcon></ViewportToolItem>
            </div>
            <Transition name="tool-group-slide"><div v-if="canShell || canRotateAxis || canRevolve" class="tool-group advanced-tools" aria-label="高级工具">
                <ViewportToolItem v-if="canShell" :description-on-hover="false" label="抽壳" :active="activeTool === 'shell'" @click="emit('shell', $event)"><SvgIcon name="shell" /></ViewportToolItem>
                <ViewportToolItem v-if="canRotateAxis" :description-on-hover="false" label="绕轴" :active="activeTool === 'rotateAxis'" @click="emit('rotateAxis')"><NIcon><RepeatOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem v-if="canRevolve" :description-on-hover="false" label="车削" :active="activeTool === 'revolve'" @click="emit('revolve')"><NIcon><RepeatOutline /></NIcon></ViewportToolItem>
            </div></Transition>
            <Transition name="tool-group-slide"><div v-if="selectedCount" class="tool-group transform-tools">
                <ViewportToolItem :description-on-hover="false" label="移动" :active="activeTool === 'translate'" @click="emit('tool', 'translate')"><NIcon><MoveOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem :description-on-hover="false" label="旋转" :active="activeTool === 'rotate'" @click="emit('tool', 'rotate')"><NIcon><RepeatOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem :description-on-hover="false" label="缩放" :disabled="selectionKind === 'plane'" :active="activeTool === 'scale'" @click="emit('tool', 'scale')"><NIcon><ResizeOutline /></NIcon></ViewportToolItem>
            </div></Transition>
            <Transition name="tool-group-slide"><div v-if="canBoolean" class="tool-group boolean-tools">
                <ViewportToolItem :description-on-hover="false" label="并集" @click="emit('boolean', 'union')"><NIcon><AddOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem :description-on-hover="false" label="差集" @click="emit('boolean', 'subtract')"><NIcon><RemoveOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem :description-on-hover="false" label="交集" @click="emit('boolean', 'intersect')"><NIcon><LayersOutline /></NIcon></ViewportToolItem>
            </div></Transition>
        </div>
        <div class="toolbar-section toolbar-bottom">
            <div class="tool-group primary-tools">
                <ViewportToolItem :description-on-hover="false" label="隔离" :active="isolateActive" :disabled="!canIsolate" @click="emit('isolate')"><NIcon><EyeOutline /></NIcon></ViewportToolItem>
                <NPopover trigger="click" placement="right-start">
                    <template #trigger><span class="history-trigger"><ViewportToolItem :description-on-hover="false" label="历史"><NIcon><TimeOutline /></NIcon></ViewportToolItem></span></template>
                    <div class="history-panel">
                        <strong>历史</strong>
                        <button v-for="step in historySteps" :key="step.id" type="button" @click="emit('history', step.id)"><span>{{ historyNames[step.kind] }}</span>{{ step.name }}<NIcon><PencilOutline /></NIcon></button>
                        <div v-if="!historySteps.length" class="history-empty">暂无步骤</div>
                    </div>
                </NPopover>
            </div>
        </div>
    </nav>
</template>

<style lang="scss" scoped>
.vertical-toolbar { position: absolute; z-index: 8; top: 12px; bottom: 43px; left: 12px; width: 120px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; padding: 0; overflow: visible; pointer-events: none; transition: transform .24s ease, opacity .18s ease; }
.vertical-toolbar.toolbar-leave { transform: translateX(calc(-100% - 18px)); opacity: 0; pointer-events: none; }
.toolbar-section { width: 100%; padding: 10px; overflow-y: auto; pointer-events: auto; scrollbar-width: thin; }
.toolbar-top { max-height: calc(100% - 100px); }
.toolbar-bottom { flex: 0 0 auto; }
.menu-state { padding: 5px 2px 7px; color: var(--model3d-ui-738079); font-size: 8px; text-align: center; }
.tool-group { display: flex; flex-direction: column; align-items: flex-start; flex: 0 0 auto; gap: 3px; padding: 4px 0; }
.vertical-toolbar .primary-tools :deep(.viewport-tool-item) { height: auto; min-height: 40px; }
.advanced-tools { margin-top: 8px; padding-top: 8px !important; border-top: 1px solid var(--model3d-ui-e3e8e5); }
.transform-tools { margin: 8px 0; padding: 8px 0 !important; border-top: 1px solid var(--model3d-ui-e3e8e5); border-bottom: 1px solid var(--model3d-ui-e3e8e5); }
.history-trigger { display: block; }
.boolean-tools { margin-top: 8px; padding-top: 8px !important; border-top: 1px solid var(--model3d-ui-e3e8e5); }
.history-panel { width: 220px; max-height: 340px; overflow-y: auto; }
.history-panel > strong { display: block; margin-bottom: 8px; font-size: 12px; }
.history-panel > button { width: 100%; display: flex; align-items: center; gap: 7px; padding: 8px 4px; border: 0; border-bottom: 1px solid var(--model3d-ui-edf0ee); background: transparent; color: var(--model3d-ui-4e5e54); font-size: 10px; text-align: left; cursor: pointer; }
.history-panel > button span { padding: 2px 4px; color: var(--model3d-ui-187566); background: var(--model3d-ui-e8f3ef); border-radius: 3px; font-size: 8px; }
.history-panel > button .n-icon { margin-left: auto; }
.history-empty { padding: 18px; color: var(--model3d-ui-8b9690); font-size: 10px; text-align: center; }
</style>
