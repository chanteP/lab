<script setup lang="ts">
import { NIcon } from 'naive-ui';
import { CloseOutline, CopyOutline, CreateOutline, EllipseOutline, GridOutline, MoveOutline, NavigateOutline, RepeatOutline, ResizeOutline, ShapesOutline } from '@vicons/ionicons5';
import SvgIcon from '../ui/SvgIcon.vue';
import ViewportToolItem from '../ui/ViewportToolItem.vue';
import { POLYGON_SIDES } from '../../config/configs';
import type { ProfileType } from '../../engine/profiles';
import type { SketchPlane } from '../../types';
import type { ViewTool } from '../../engine/Viewport';

const props = defineProps<{ sketchMode: boolean; activePanel: string | null; selectionTool: boolean; sketchType: ProfileType; sides: number; planes: SketchPlane[]; selectionKind: string | null; activeTool: ViewTool; symmetryStep: number | null }>();
const emit = defineEmits<{
    close: [];
    select: [];
    type: [type: ProfileType];
    sides: [sides: number];
    plane: [id: string];
    construct: [kind: SketchPlane['kind']];
    face: [];
    symmetry: [];
    transform: [tool: 'translate' | 'rotate' | 'scale'];
}>();
const polygonOptions = POLYGON_SIDES.map(sides => ({ label: `${sides} 边`, value: sides }));
function active(type: ProfileType) { return props.activeTool === 'select' && !props.selectionTool && props.sketchType === type; }
function toolsLocked() { return props.symmetryStep === 1 || props.symmetryStep === 2; }
</script>

<template>
    <nav class="sketch-toolbar" :class="{ 'toolbar-enter': sketchMode || activePanel === 'sketch' }" aria-label="草图工具">
        <div class="sketch-close" :class="{ 'is-exiting': sketchMode }">
            <ViewportToolItem :label="sketchMode ? '退出草图' : '草图'" :danger="sketchMode" :large="sketchMode" :description-on-hover="false" @click="emit('close')"><NIcon><CloseOutline /></NIcon></ViewportToolItem>
        </div>
        <div v-if="!sketchMode" class="sketch-plane-picker">
            <p>选择绘制平面。</p>
            <div class="inline-command-row"><button @click="emit('construct', 'XZ')">XZ</button><button @click="emit('construct', 'XY')">XY</button><button @click="emit('construct', 'YZ')">YZ</button></div>
            <ViewportToolItem v-for="plane in planes" :key="plane.id" :label="plane.name" :description-on-hover="false" @click="emit('plane', plane.id)"><NIcon><GridOutline /></NIcon></ViewportToolItem>
            <ViewportToolItem v-if="selectionKind === 'face'" label="所选实体平面" :description-on-hover="false" @click="emit('face')"><NIcon><ShapesOutline /></NIcon></ViewportToolItem>
        </div>
        <div v-else class="sketch-tool-list">
            <div class="tool-group">
                <ViewportToolItem label="选择" :active="selectionTool && activeTool === 'select'" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('select')"><NIcon><NavigateOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem label="线条 / 曲线" :active="active('polygon')" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('type', 'polygon')"><NIcon><CreateOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem label="矩形" :active="active('rectangle')" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('type', 'rectangle')"><NIcon><GridOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem label="圆形" :active="active('circle')" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('type', 'circle')"><NIcon><EllipseOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem label="椭圆" :active="active('ellipse')" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('type', 'ellipse')"><SvgIcon name="ellipse" /></ViewportToolItem>
                <ViewportToolItem label="正多边形" :active="active('regular')" :disabled="toolsLocked()" :description-on-hover="false" :options="polygonOptions" :model-value="sides" @click="emit('type', 'regular')" @select="emit('sides', Number($event))"><NIcon><ShapesOutline /></NIcon></ViewportToolItem>
            </div>
            <div class="tool-group advanced-tool-group">
                <div class="tool-group-label">高级工具</div>
                <ViewportToolItem label="对称" :active="symmetryStep !== null" :description-on-hover="false" @click="emit('symmetry')"><NIcon><CopyOutline /></NIcon></ViewportToolItem>
            </div>
            <div class="tool-group transform-tool-group">
                <div class="tool-group-label">变换工具</div>
                <ViewportToolItem label="平移" :active="activeTool === 'translate'" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('transform', 'translate')"><NIcon><MoveOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem label="旋转" :active="activeTool === 'rotate'" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('transform', 'rotate')"><NIcon><RepeatOutline /></NIcon></ViewportToolItem>
                <ViewportToolItem label="缩放" :active="activeTool === 'scale'" :disabled="toolsLocked()" :description-on-hover="false" @click="emit('transform', 'scale')"><NIcon><ResizeOutline /></NIcon></ViewportToolItem>
            </div>
        </div>
    </nav>
</template>

<style lang="scss" scoped>
.sketch-toolbar { position: absolute; z-index: 6; top: 12px; bottom: auto; left: 12px; width: 172px; max-height: calc(100% - 55px); padding: 10px; overflow-y: auto; scrollbar-width: thin; transform: translateX(calc(-100% - 18px)); opacity: 0; pointer-events: none; transition: transform .24s ease, opacity .18s ease; }
.sketch-toolbar.toolbar-enter { transform: translateX(0); opacity: 1; pointer-events: auto; }
.sketch-toolbar button { font: inherit; }
.sketch-close { margin-bottom: 10px; padding-bottom: 7px; border-bottom: 1px solid var(--model3d-ui-e2e8e4); }
.sketch-close.is-exiting { padding-bottom: 5px; border-bottom-color: transparent; }
.sketch-close.is-exiting :deep(.viewport-tool-item) { padding-left: 2px; }
.sketch-tool-list, .tool-group { display: flex; flex-direction: column; gap: 4px; }
.advanced-tool-group { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--model3d-ui-e2e8e4); }
.transform-tool-group { margin-top: 12px; }
.tool-group-label { padding: 0 5px 3px; color: var(--model3d-ui-89958e); font-size: 10px; font-weight: 600; letter-spacing: .08em; }
.sketch-plane-picker > p { margin: 4px 3px 12px; color: var(--model3d-ui-7e8b83); font-size: 10px; }
.inline-command-row { display: flex; gap: 5px; margin-bottom: 12px; }
.inline-command-row button { flex: 1; min-height: 28px; border: 0; background: transparent; color: var(--model3d-ui-147d70); cursor: pointer; }
.inline-command-row button:hover { background: var(--model3d-ui-edf3ef); }
.inline-command-row button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 1px; }
</style>
