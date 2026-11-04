<script setup lang="ts">
import { computed, ref } from 'vue';
import { NIcon, NInput } from 'naive-ui';
import { ArrowUpOutline, CloseOutline, CubeOutline, EllipseOutline, FolderOpenOutline, GridOutline, MoveOutline, RepeatOutline, ResizeOutline, ShapesOutline } from '@vicons/ionicons5';
import MenuCommand from '../ui/MenuCommand.vue';
import SvgIcon from '../ui/SvgIcon.vue';
import IntegerInputNumber from '../ui/IntegerInputNumber.vue';
import type { BooleanOperation, ModelEntity, OperationState, PrimaryPanel, SelectionKind, SketchPlane } from '../../types';
import type { ViewTool } from '../../engine/Viewport';

const props = defineProps<{
    activePanel: PrimaryPanel | null;
    sketchMode: boolean;
    operation: OperationState | null;
    selectedIds: string[];
    selectedEntities: ModelEntity[];
    selectionKind: SelectionKind;
    activeTool: ViewTool;
    canBoolean: boolean;
    selectThrough: boolean;
    includeTangent: boolean;
    selectedFacePlanar: boolean;
    parameterCardOpen: boolean;
    displayLength: (value: number) => number;
}>();
const emit = defineEmits<{
    closePanel: [];
    command: [id: string];
    primitive: [kind: 'box' | 'cylinder' | 'sphere'];
    import: [];
    createPlane: [kind: SketchPlane['kind']];
    tool: [tool: ViewTool];
    sketch: [];
    boolean: [type: BooleanOperation];
    clearSelection: [];
    extrudeHint: [];
    'update:selectThrough': [value: boolean];
    'update:includeTangent': [value: boolean];
    updateName: [name: string];
    updateVector: [key: 'position' | 'rotation' | 'scale', axis: number, value: number | null];
    updateDimension: [key: keyof ModelEntity, value: number | null];
    updateColor: [value: string];
}>();
const commandSearch = ref('');
const selectedSketches = computed(() => props.selectedEntities.filter((item) => item.kind === 'sketch'));
const selected = computed(() => props.selectedEntities.length === 1 ? props.selectedEntities[0] : null);
const dimensionFields = computed(() => {
    const item = selected.value;
    if (!item) return [];
    if (item.kind === 'box') return [{ key: 'width' as const, label: '宽', value: item.width! }, { key: 'height' as const, label: '高', value: item.height! }, { key: 'depth' as const, label: '深', value: item.depth! }];
    if (item.kind === 'cylinder') return [{ key: 'radius' as const, label: '半径', value: item.radius! }, { key: 'height' as const, label: '高', value: item.height! }];
    if (item.kind === 'sphere') return [{ key: 'radius' as const, label: '半径', value: item.radius! }];
    if (item.kind === 'extrude') return [{ key: 'depth' as const, label: '厚度', value: item.depth! }];
    return [];
});
const activeVector = computed(() => {
    if (!selected.value) return null;
    if (props.activeTool === 'translate') return { key: 'position' as const, label: '位置', value: selected.value.position, step: props.displayLength(1) };
    if (props.activeTool === 'rotate') return { key: 'rotation' as const, label: '旋转', value: selected.value.rotation, step: 15 };
    if (props.activeTool === 'scale') return { key: 'scale' as const, label: '缩放', value: selected.value.scale, step: 0.1 };
    return null;
});
const panelTitles: Partial<Record<PrimaryPanel, string>> = { search: '搜索', insert: '插入', construct: '构造', tools: '工具' };
const commandResults = computed(() => {
    const commands = [
        { id: 'sketch', label: '草图', hint: '在基准面、构造平面或实体平面上绘制', keys: '草图 绘制 sketch' },
        { id: 'extrude', label: '拉伸', hint: '将闭合草图轮廓拉伸为实体', keys: '拉伸 挤出 extrude' },
        { id: 'offsetFace', label: '推拉面', hint: '沿所选平面法向拉伸实体', keys: '推拉 拉伸面 extrude face' },
        { id: 'translate', label: '移动 / 旋转', hint: '移动或旋转所选对象', keys: '移动 旋转 transform' },
        { id: 'scale', label: '缩放', hint: '缩放所选实体', keys: '缩放 scale' },
        { id: 'plane', label: '构造平面', hint: '添加构造平面', keys: '平面 构造 plane' },
        { id: 'box', label: '立方体', hint: '插入立方体', keys: '立方体 box' },
        { id: 'cylinder', label: '圆柱体', hint: '插入圆柱体', keys: '圆柱 cylinder' },
        { id: 'sphere', label: '球体', hint: '插入球体', keys: '球体 sphere' },
    ];
    const query = commandSearch.value.trim().toLowerCase();
    return query ? commands.filter((item) => `${item.label} ${item.keys}`.toLowerCase().includes(query)) : commands;
});
function runCommand(id: string) {
    commandSearch.value = '';
    emit('command', id);
}
</script>

<template>
    <div class="tool-panels">
        <aside v-if="activePanel && activePanel !== 'sketch' && !sketchMode" class="tool-panel">
            <div class="tool-panel-title"><strong>{{ panelTitles[activePanel] }}</strong><button aria-label="关闭工具面板" @click="emit('closePanel')"><NIcon><CloseOutline /></NIcon></button></div>
            <template v-if="activePanel === 'search'">
                <NInput v-model:value="commandSearch" autofocus size="small" placeholder="搜索命令" />
                <div class="command-results"><button v-for="command in commandResults" :key="command.id" @click="runCommand(command.id)"><strong>{{ command.label }}</strong><span>{{ command.hint }}</span></button><div v-if="!commandResults.length" class="history-empty">没有匹配的命令</div></div>
            </template>
            <template v-else-if="activePanel === 'insert'">
                <div class="panel-section-label">基础实体</div>
                <MenuCommand title="立方体" subtitle="插入参数化立方体" @click="emit('primitive', 'box')"><NIcon><CubeOutline /></NIcon></MenuCommand>
                <MenuCommand title="圆柱体" subtitle="插入参数化圆柱体" @click="emit('primitive', 'cylinder')"><NIcon><ShapesOutline /></NIcon></MenuCommand>
                <MenuCommand title="球体" subtitle="插入参数化球体" @click="emit('primitive', 'sphere')"><NIcon><EllipseOutline /></NIcon></MenuCommand>
                <div class="panel-section-label">项目</div>
                <MenuCommand title="文件" subtitle="导入项目 JSON" @click="emit('import')"><NIcon><FolderOpenOutline /></NIcon></MenuCommand>
            </template>
            <template v-else-if="activePanel === 'construct'">
                <p class="panel-note">选择实体平面后可创建贴合该面的构造平面；也可以直接添加基准面。</p>
                <button class="menu-command" @click="emit('createPlane', 'XZ')"><NIcon><GridOutline /></NIcon><span><strong>XZ 平面</strong><small>水平基准面</small></span></button>
                <button class="menu-command" @click="emit('createPlane', 'XY')"><NIcon><GridOutline /></NIcon><span><strong>XY 平面</strong><small>正视基准面</small></span></button>
                <button class="menu-command" @click="emit('createPlane', 'YZ')"><NIcon><GridOutline /></NIcon><span><strong>YZ 平面</strong><small>侧视基准面</small></span></button>
            </template>
            <template v-else-if="activePanel === 'tools'">
                <button class="menu-command" :disabled="!selectedSketches.length" @click="emit('extrudeHint')"><NIcon><ArrowUpOutline /></NIcon><span><strong>拉伸</strong><small>选择封闭轮廓后拖动双向粗箭头</small></span></button>
                <button class="menu-command" :disabled="selectionKind !== 'face' || !selectedFacePlanar" @click="emit('tool', 'offsetFace')"><NIcon><MoveOutline /></NIcon><span><strong>推拉面</strong><small>沿完整平面法向拉伸实体</small></span></button>
                <div class="panel-section-label">布尔运算 · 选择两个实体</div>
                <div class="inline-command-row"><button :disabled="!canBoolean" @click="emit('boolean', 'union')">并集</button><button :disabled="!canBoolean" @click="emit('boolean', 'subtract')">差集</button><button :disabled="!canBoolean" @click="emit('boolean', 'intersect')">交集</button></div>
            </template>
        </aside>

        <aside v-if="!activePanel && parameterCardOpen && selectedIds.length && !sketchMode && !operation" class="tool-panel adaptive-panel">
            <div class="tool-panel-title"><div><small>自适应工具</small><strong>{{ selectedSketches.length === selectedEntities.length ? '封闭草图轮廓' : selectionKind === 'edge' ? '边' : selectionKind === 'face' ? '面' : selectionKind === 'plane' ? '构造平面' : selectedEntities.length > 1 ? `${selectedEntities.length} 个实体` : '实体' }}</strong></div><button aria-label="取消选择" @click="emit('clearSelection')"><NIcon><CloseOutline /></NIcon></button></div>
            <template v-if="selectedSketches.length === selectedEntities.length"><p class="panel-note">已选择 {{ selectedSketches.length }} 个封闭轮廓。拖动视图中的上下粗箭头生成实体，草图底面保持在原平面。</p></template>
            <template v-else-if="selectedEntities.length > 1"><div class="inline-command-row vertical"><button @click="emit('boolean', 'union')">并集</button><button @click="emit('boolean', 'subtract')">差集</button><button @click="emit('boolean', 'intersect')">交集</button></div></template>
            <template v-else-if="selectionKind === 'plane'"><button class="menu-command" @click="emit('sketch')"><SvgIcon name="pencil" /><span><strong>草图</strong><small>在所选平面上绘制</small></span></button><button class="menu-command" @click="emit('tool', 'translate')"><NIcon><MoveOutline /></NIcon><span><strong>移动 / 旋转</strong></span></button></template>
            <template v-else-if="selectionKind === 'face'"><button class="menu-command" :class="{ active: activeTool === 'offsetFace' }" @click="emit('tool', 'offsetFace')"><NIcon><MoveOutline /></NIcon><span><strong>推拉面</strong><small>{{ selectedFacePlanar ? '拖动模型平面或输入距离' : '曲面暂不支持推拉' }}</small></span></button><button class="menu-command" @click="emit('sketch')"><SvgIcon name="pencil" /><span><strong>草图</strong><small>在此平面上新建草图</small></span></button></template>
            <template v-else><button class="menu-command" :class="{ active: activeTool === 'translate' }" @click="emit('tool', 'translate')"><NIcon><MoveOutline /></NIcon><span><strong>移动 / 旋转</strong><small>移动整个实体</small></span></button><button class="menu-command" :class="{ active: activeTool === 'rotate' }" @click="emit('tool', 'rotate')"><NIcon><RepeatOutline /></NIcon><span><strong>旋转</strong></span></button><button class="menu-command" :class="{ active: activeTool === 'scale' }" @click="emit('tool', 'scale')"><NIcon><ResizeOutline /></NIcon><span><strong>缩放</strong></span></button></template>
            <div v-if="selectionKind === 'face' || selectionKind === 'edge'" class="inline-command-row vertical">
                <button :class="{ active: includeTangent }" @click="emit('update:includeTangent', !includeTangent)">相切扩选</button>
                <button :class="{ active: selectThrough }" @click="emit('update:selectThrough', !selectThrough)">穿透选择</button>
            </div>
            <section v-if="selected" class="selection-properties" aria-label="所选实体参数">
                <label class="property-name">名称<input :value="selected.name" @change="emit('updateName', ($event.currentTarget as HTMLInputElement).value)" /></label>
                <div v-if="activeVector" class="property-grid vector-properties">
                    <label v-for="axis in ['X', 'Y', 'Z']" :key="axis">{{ axis }}<IntegerInputNumber :precision="4" :value="activeVector.key === 'position' ? displayLength(activeVector.value[['X','Y','Z'].indexOf(axis)]) : activeVector.value[['X','Y','Z'].indexOf(axis)]" size="small" :show-button="false" :step="activeVector.step" :min="activeVector.key === 'scale' ? 0.01 : undefined" @update:value="emit('updateVector', activeVector.key, ['X','Y','Z'].indexOf(axis), $event)" /></label>
                </div>
                <div v-else-if="dimensionFields.length" class="property-grid">
                    <label v-for="field in dimensionFields" :key="field.key">{{ field.label }}<IntegerInputNumber :precision="4" :value="displayLength(field.value)" size="small" :show-button="false" @update:value="emit('updateDimension', field.key, $event)" /></label>
                </div>
                <label class="property-color">颜色<input type="color" :value="selected.color" aria-label="实体颜色" @input="emit('updateColor', ($event.currentTarget as HTMLInputElement).value)" /></label>
            </section>
            <button class="more-tools" @click="emit('command', 'tools')">更多工具 <span>›</span></button>
        </aside>
    </div>
</template>

<style lang="scss" scoped>
.tool-panels { position: absolute; z-index: 7; top: 12px; right: 12px; width: 210px; max-height: calc(100% - 55px); overflow-y: auto; scrollbar-width: thin; }
.tool-panel { position: relative; top: auto; left: auto; width: 100%; max-height: none; }
.selection-properties { display: grid; gap: 9px; margin-top: 10px; padding: 10px 3px 2px; border-top: 1px solid var(--model3d-ui-e3e9e5); }
.selection-properties label { color: var(--model3d-ui-748078); font-size: 9px; }
.property-name { display: grid; grid-template-columns: 32px 1fr; align-items: center; gap: 5px; }
.property-name input { min-width: 0; height: 27px; padding: 3px 6px; color: var(--model3d-ui-42554b); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; }
.property-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.property-grid label { display: grid; gap: 4px; min-width: 0; }
.property-grid :deep(.n-input-number) { width: 100%; }
.property-color { display: flex; align-items: center; justify-content: space-between; }
.property-color input { width: 42px; height: 25px; padding: 2px; background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 5px; cursor: pointer; }
</style>
