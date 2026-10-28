<script setup lang="ts">
import { NIcon, NSelect } from 'naive-ui';
import { CloseOutline, CreateOutline, EllipseOutline, GridOutline, NavigateOutline, ShapesOutline } from '@vicons/ionicons5';
import SvgIcon from '../ui/SvgIcon.vue';
import { POLYGON_SIDES } from '../../config/configs';
import type { ProfileType } from '../../engine/profiles';
import type { SketchPlane } from '../../types';

const props = defineProps<{ sketchMode: boolean; activePanel: string | null; selectionTool: boolean; sketchType: ProfileType; sides: number; planes: SketchPlane[]; selectionKind: string | null }>();
const emit = defineEmits<{
    close: [];
    select: [];
    type: [type: ProfileType];
    sides: [sides: number];
    plane: [id: string];
    construct: [kind: SketchPlane['kind']];
    face: [];
}>();
function active(type: ProfileType) { return !props.selectionTool && props.sketchType === type; }
</script>

<template>
    <nav class="sketch-toolbar" :class="{ 'toolbar-enter': sketchMode || activePanel === 'sketch' }" aria-label="草图工具">
        <button class="sketch-close" :class="{ 'is-exiting': sketchMode }" @click="emit('close')"><span class="sketch-tool-icon"><NIcon><CloseOutline /></NIcon></span><strong>{{ sketchMode ? '退出草图' : '草图' }}</strong></button>
        <div v-if="!sketchMode" class="sketch-plane-picker">
            <p>选择绘制平面。</p>
            <div class="inline-command-row"><button @click="emit('construct', 'XZ')">XZ</button><button @click="emit('construct', 'XY')">XY</button><button @click="emit('construct', 'YZ')">YZ</button></div>
            <button v-for="plane in planes" :key="plane.id" class="plane-command" @click="emit('plane', plane.id)"><NIcon><GridOutline /></NIcon><strong>{{ plane.name }}</strong></button>
            <button v-if="selectionKind === 'face'" class="plane-command" @click="emit('face')"><NIcon><ShapesOutline /></NIcon><strong>所选实体平面</strong></button>
        </div>
        <div v-else class="sketch-tool-list">
            <button :class="{ active: selectionTool }" @click="emit('select')"><span class="sketch-tool-icon"><NIcon><NavigateOutline /></NIcon></span><span>选择</span></button>
            <button :class="{ active: active('polygon') }" @click="emit('type', 'polygon')"><span class="sketch-tool-icon"><NIcon><CreateOutline /></NIcon></span><span>线条 / 曲线</span></button>
            <button :class="{ active: active('rectangle') }" @click="emit('type', 'rectangle')"><span class="sketch-tool-icon"><NIcon><GridOutline /></NIcon></span><span>矩形</span></button>
            <button :class="{ active: active('circle') }" @click="emit('type', 'circle')"><span class="sketch-tool-icon"><NIcon><EllipseOutline /></NIcon></span><span>圆形</span></button>
            <button :class="{ active: active('ellipse') }" @click="emit('type', 'ellipse')"><span class="sketch-tool-icon"><SvgIcon name="ellipse" /></span><span>椭圆</span></button>
            <div class="sketch-polygon-tool" :class="{ active: active('regular') }">
                <button @click="emit('type', 'regular')"><span class="sketch-tool-icon"><NIcon><ShapesOutline /></NIcon></span><span><strong>正多边形</strong></span></button>
                <NSelect size="small" :value="sides" :options="POLYGON_SIDES.map(n => ({ label: `${n} 边`, value: n }))" @update:value="emit('sides', $event)" />
            </div>
        </div>
    </nav>
</template>

<style lang="scss" scoped>
.sketch-toolbar { position: absolute; z-index: 6; top: 12px; bottom: 43px; left: 12px; width: 172px; padding: 10px; transform: translateX(calc(-100% - 18px)); opacity: 0; pointer-events: none; transition: transform .24s ease, opacity .18s ease; }
.sketch-toolbar.toolbar-enter { transform: translateX(0); opacity: 1; pointer-events: auto; }
.sketch-toolbar button { font: inherit; }
.sketch-close { width: 100%; display: flex; align-items: center; gap: 10px; padding: 5px 3px 12px; border: 0; background: transparent; color: #56665d; cursor: pointer; text-align: left; }
.sketch-close strong { font-size: 12px; font-weight: 550; }
.sketch-close.is-exiting { padding: 8px 9px 10px; color: #c94f4f; }
.sketch-close.is-exiting strong { font-size: 14px; font-weight: 700; }
.sketch-close.is-exiting .sketch-tool-icon { color: #fff; background: #c94f4f; border-color: #ffffff70; }
.sketch-tool-list { display: flex; flex-direction: column; gap: 4px; padding-top: 10px; }
.sketch-tool-list > button, .sketch-polygon-tool > button { width: 100%; min-height: 40px; display: flex; align-items: center; gap: 10px; padding: 3px 5px; border: 0; background: transparent; color: #4d5e54; font-size: 11px; text-align: left; cursor: pointer; }
.sketch-tool-list button.active, .sketch-polygon-tool.active > button { color: #147d70; background: transparent; }
.sketch-tool-icon { width: 30px; height: 30px; display: grid; place-items: center; flex: 0 0 30px; color: #4d675b; background: #fff; border: 1px solid #dfe6e1; border-radius: 50%; font-size: 16px; transition: transform .22s cubic-bezier(.34, 1.56, .64, 1); }
.sketch-tool-list button:hover .sketch-tool-icon { transform: scale(1.16); }
.sketch-tool-list button.active .sketch-tool-icon { color: #147d70; border-color: #8fc4b7; }
.sketch-tool-list > button > span:last-child, .sketch-polygon-tool > button > span:last-child { display: flex; flex-direction: column; justify-content: center; }
.sketch-plane-picker > p { margin: 4px 3px 12px; color: #7e8b83; font-size: 10px; }
.inline-command-row { display: flex; gap: 5px; margin-bottom: 12px; }
.inline-command-row button { flex: 1; min-height: 28px; border: 0; background: transparent; color: #147d70; cursor: pointer; }
.plane-command { width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 5px; border: 0; background: transparent; color: #56675d; text-align: left; cursor: pointer; }
.plane-command strong { font-size: 11px; font-weight: 550; }
.sketch-polygon-tool .n-select { width: 54px; height: 14px; min-height: 14px; margin: 1px 0 0 45px; padding: 0; font-size: 10px; }
.sketch-polygon-tool .n-select :deep(.n-base-selection-label), .sketch-polygon-tool .n-select :deep(.n-base-selection-input) { height: 14px; min-height: 14px; padding: 0; color: #89958e; background: transparent; border: 0; box-shadow: none; font-size: 10px; line-height: 14px; }
.sketch-polygon-tool .n-select :deep(.n-base-selection-arrow) { width: 10px; font-size: 9px; }
</style>
