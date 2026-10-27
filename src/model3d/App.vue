<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NInputNumber, NModal, NPopconfirm, NPopover, NSelect, NTooltip, useMessage } from 'naive-ui';
import {
    AddOutline, AnalyticsOutline, ArrowRedoOutline, ArrowUndoOutline, CameraOutline, CheckmarkOutline,
    ChevronDownOutline, CloseOutline, CloudDoneOutline, CopyOutline, CreateOutline, CubeOutline,
    CutOutline, DocumentOutline, DownloadOutline, EllipseOutline, EyeOffOutline, EyeOutline, FolderOpenOutline,
    GridOutline, HelpCircleOutline, LayersOutline, MoveOutline, RepeatOutline, ResizeOutline,
    ShapesOutline, TrashOutline, NavigateOutline,
} from '@vicons/ionicons5';
import { Viewport, type CameraView, type ViewTool } from './Viewport';
import { exportGLB, exportProject, exportSTL } from './exporters';
import { deleteProject, getActiveProjectId, listProjects, putProject, setActiveProjectId } from './store';
import {
    cloneDocument, createDocument, createEntity, ENTITY_NAMES, isDocument,
    type BooleanOperation, type GeometryQuality, type ModelDocument, type ModelEntity, type ProjectRecord, type Point2,
} from './types';

const message = useMessage();
const viewportElement = ref<HTMLElement>();
const importInput = ref<HTMLInputElement>();
let viewport: Viewport;
let saveTimer: ReturnType<typeof setTimeout>;
let restoring = false;
let transforming = false;
const undoStack: ModelDocument[] = [];
const redoStack: ModelDocument[] = [];
const historyVersion = ref(0);

const projects = ref<ProjectRecord[]>([]);
const document = ref<ModelDocument>(createDocument());
const project = ref<ProjectRecord>(createProject('未命名项目'));
const selectedIds = ref<string[]>([]);
const saveState = ref<'saved' | 'saving' | 'dirty'>('saved');
const activeTool = ref<ViewTool>('select');
const exportQuality = ref<GeometryQuality>('high');
const exporting = ref(false);
const gridVisible = ref(true);
const spaceActive = ref(false);
const currentView = ref<CameraView>('perspective');
const showNewProject = ref(false);
const showHelp = ref(false);
const newProjectName = ref('未命名项目');
const sketchMode = ref(false);
const sketchPoints = ref<Point2[]>([]);
const stats = ref({ vertices: 0, triangles: 0, objects: 0 });

const projectOptions = computed(() => projects.value.map((item) => ({ label: item.name, value: item.id })));
const selectedEntities = computed(() => selectedIds.value.map((id) => document.value.entities.find((item) => item.id === id)).filter(Boolean) as ModelEntity[]);
const selected = computed(() => selectedEntities.value.length === 1 ? selectedEntities.value[0] : null);
const canUndo = computed(() => (historyVersion.value, undoStack.length > 0));
const canRedo = computed(() => (historyVersion.value, redoStack.length > 0));
const canBoolean = computed(() => selectedEntities.value.length === 2);
const canEdge = computed(() => !!selected.value && ['box', 'cylinder', 'extrude'].includes(selected.value.kind));
const saveLabel = computed(() => saveState.value === 'saved' ? '已保存到本机' : saveState.value === 'saving' ? '保存中…' : '有未保存更改');
const edgeLimit = computed(() => {
    const item = selected.value;
    if (!item) return 20;
    if (item.kind === 'box') return Math.min(item.width!, item.height!, item.depth!) * 0.48;
    if (item.kind === 'cylinder') return Math.min(item.radius!, item.height! / 2) * 0.48;
    return item.depth! * 0.24;
});
const sketchClosed = computed(() => sketchPoints.value.length >= 3);

function uid() {
    return crypto.randomUUID();
}

function createProject(name: string): ProjectRecord {
    const now = Date.now();
    return { id: uid(), name, createdAt: now, updatedAt: now, document: createDocument() };
}

function uniqueName(kind: ModelEntity['kind']) {
    const base = ENTITY_NAMES[kind];
    let index = document.value.entities.filter((item) => item.kind === kind).length + 1;
    let name = `${base} ${index}`;
    while (document.value.entities.some((item) => item.name === name)) name = `${base} ${++index}`;
    return name;
}

function pushHistory() {
    historyVersion.value++;
    undoStack.push(cloneDocument(document.value));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
}

function undo() {
    historyVersion.value++;
    const previous = undoStack.pop();
    if (!previous) return;
    redoStack.push(cloneDocument(document.value));
    document.value = previous;
    selectedIds.value = selectedIds.value.filter((id) => previous.entities.some((item) => item.id === id));
}

function redo() {
    historyVersion.value++;
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(cloneDocument(document.value));
    document.value = next;
    selectedIds.value = selectedIds.value.filter((id) => next.entities.some((item) => item.id === id));
}

async function flushSave() {
    clearTimeout(saveTimer);
    if (!project.value.id) return;
    saveState.value = 'saving';
    try {
        project.value.document = cloneDocument(document.value);
        project.value.updatedAt = Date.now();
        await putProject(project.value);
        const index = projects.value.findIndex((item) => item.id === project.value.id);
        if (index >= 0) projects.value[index] = { ...project.value };
        saveState.value = 'saved';
    } catch (error) {
        saveState.value = 'dirty';
        message.error(`本地保存失败：${(error as Error).message}`);
    }
}

function scheduleSave() {
    if (restoring) return;
    saveState.value = 'dirty';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 650);
}

async function openProject(id: string, saveCurrent = true) {
    if (id === project.value.id) return;
    if (saveCurrent) await flushSave();
    const next = projects.value.find((item) => item.id === id);
    if (!next) return;
    restoring = true;
    project.value = next;
    document.value = cloneDocument(next.document);
    selectedIds.value = [];
    undoStack.length = 0;
    redoStack.length = 0;
    setActiveProjectId(id);
    setTool('select');
    await nextTick();
    viewport?.sync(document.value);
    viewport?.fit();
    restoring = false;
    saveState.value = 'saved';
}

async function reloadProjects() {
    projects.value = await listProjects();
}

async function newProject() {
    await flushSave();
    const next = createProject(newProjectName.value.trim() || '未命名项目');
    const box = createEntity('box', uid());
    box.name = '立方体 1';
    next.document.entities.push(box);
    await putProject(next);
    await reloadProjects();
    showNewProject.value = false;
    newProjectName.value = '未命名项目';
    await openProject(next.id);
    selectedIds.value = [box.id];
}

async function duplicateProject() {
    const copy = createProject(`${project.value.name} 副本`);
    copy.document = cloneDocument(document.value);
    await putProject(copy);
    await reloadProjects();
    await openProject(copy.id);
    message.success('已创建项目副本');
}

async function removeProject() {
    const id = project.value.id;
    await deleteProject(id);
    await reloadProjects();
    if (!projects.value.length) {
        const next = createProject('未命名项目');
        const box = createEntity('box', uid());
        box.name = '立方体 1';
        next.document.entities.push(box);
        await putProject(next);
        await reloadProjects();
    }
    await openProject(projects.value[0].id, false);
    message.success('项目已删除');
}

function selectEntity(id: string | null, additive = false) {
    if (!id) {
        if (!additive) selectedIds.value = [];
        return;
    }
    if (additive) {
        selectedIds.value = selectedIds.value.includes(id)
            ? selectedIds.value.filter((item) => item !== id)
            : [...selectedIds.value, id];
    } else {
        selectedIds.value = [id];
    }
}

function setTool(tool: ViewTool) {
    if (sketchMode.value) cancelSketch();
    activeTool.value = tool;
    viewport?.setTool(tool);
}

function addEntity(kind: 'box' | 'cylinder' | 'sphere') {
    pushHistory();
    const entity = createEntity(kind, uid());
    entity.name = uniqueName(kind);
    document.value.entities.push(entity);
    selectedIds.value = [entity.id];
    setTool('select');
}

function updateEntity(key: keyof ModelEntity, value: any) {
    if (!selected.value) return;
    pushHistory();
    (selected.value as any)[key] = value;
}

function updateVector(key: 'position' | 'rotation' | 'scale', index: number, value: number | null) {
    if (!selected.value || value === null) return;
    pushHistory();
    selected.value[key][index] = key === 'scale' ? Math.max(0.01, value) : value;
}

function removeSelected() {
    const ids = selectedIds.value;
    if (!ids.length) return;
    const referenced = document.value.entities.find((item) => item.kind === 'boolean' && item.operands?.some((id) => ids.includes(id)) && !ids.includes(item.id));
    if (referenced) {
        message.warning(`请先删除依赖它的「${referenced.name}」`);
        return;
    }
    pushHistory();
    ids.forEach((id) => {
        const item = document.value.entities.find((entity) => entity.id === id);
        if (item?.kind === 'boolean') item.operands?.forEach((operandId) => {
            const operand = document.value.entities.find((entity) => entity.id === operandId);
            if (operand) operand.visible = true;
        });
    });
    document.value.entities = document.value.entities.filter((item) => !ids.includes(item.id));
    selectedIds.value = [];
}

function duplicateSelected() {
    const item = selected.value;
    if (!item || item.kind === 'boolean') return;
    pushHistory();
    const copy = cloneDocument({ version: 1, unit: 'mm', entities: [item] }).entities[0];
    copy.id = uid();
    copy.name = `${item.name} 副本`;
    copy.position = [...copy.position];
    copy.position[0] += 10;
    copy.position[2] += 10;
    document.value.entities.push(copy);
    selectedIds.value = [copy.id];
}

function applyBoolean(operation: BooleanOperation) {
    if (!canBoolean.value) return;
    const [a, b] = selectedEntities.value;
    pushHistory();
    const names = { union: '并集', subtract: '差集', intersect: '交集' };
    const entity: ModelEntity = {
        id: uid(), name: `${names[operation]} ${document.value.entities.filter((item) => item.kind === 'boolean').length + 1}`,
        kind: 'boolean', color: a.color, visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        operation, operands: [a.id, b.id], edge: null,
    };
    a.visible = false;
    b.visible = false;
    document.value.entities.push(entity);
    selectedIds.value = [entity.id];
    setTool('select');
    message.success(operation === 'subtract' ? `已计算 ${a.name} − ${b.name}` : `已创建${names[operation]}`);
}

function setEdge(type: 'fillet' | 'chamfer') {
    if (!canEdge.value || !selected.value) return;
    pushHistory();
    selected.value.edge = {
        type,
        size: Math.min(selected.value.edge?.size || 3, edgeLimit.value),
        segments: selected.value.edge?.segments || 6,
    };
}

function clearEdge() {
    if (!selected.value) return;
    pushHistory();
    selected.value.edge = null;
}

function startSketch() {
    setTool('select');
    selectedIds.value = [];
    sketchMode.value = true;
    sketchPoints.value = [];
    viewport?.setSketchMode(true, []);
    currentView.value = 'top';
    viewport?.setView('top');
}

function addSketchPoint(point: Point2) {
    const previous = sketchPoints.value[sketchPoints.value.length - 1];
    if (previous && Math.hypot(previous[0] - point[0], previous[1] - point[1]) < 0.01) return;
    sketchPoints.value.push(point);
    viewport?.updateSketch(sketchPoints.value);
}

function finishSketch() {
    if (!sketchMode.value) return;
    const points = [...sketchPoints.value];
    if (points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01) points.pop();
    }
    if (points.length < 3) {
        message.warning('草图至少需要 3 个不同的点');
        return;
    }
    pushHistory();
    const entity = createEntity('extrude', uid());
    entity.name = uniqueName('extrude');
    entity.points = points;
    document.value.entities.push(entity);
    sketchMode.value = false;
    viewport?.setSketchMode(false);
    selectedIds.value = [entity.id];
    viewport?.fitSelection();
    message.success('草图已拉伸，可在右侧调整厚度与边处理');
}

function cancelSketch() {
    sketchMode.value = false;
    sketchPoints.value = [];
    viewport?.setSketchMode(false);
}

async function runExport(type: 'stl' | 'glb') {
    if (!document.value.entities.some((item) => item.visible)) {
        message.warning('没有可导出的可见实体');
        return;
    }
    exporting.value = true;
    await flushSave();
    try {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (type === 'stl') exportSTL(document.value, project.value.name, exportQuality.value);
        else await exportGLB(document.value, project.value.name, exportQuality.value);
        message.success(`${type.toUpperCase()} 已按${exportQuality.value === 'ultra' ? '超高' : '高'}精度导出`);
    } catch (error) {
        console.error(error);
        message.error(`导出失败：${(error as Error).message}`);
    } finally {
        exporting.value = false;
    }
}

function importProject() {
    importInput.value?.click();
}

async function onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        if (!isDocument(data)) throw new Error('不是有效的 Form 3D 项目文件');
        const next = createProject(file.name.replace(/\.model\.json$|\.json$/g, '') || '导入项目');
        next.document = cloneDocument(data);
        await putProject(next);
        await reloadProjects();
        await openProject(next.id);
        message.success('项目已导入');
    } catch (error) {
        message.error((error as Error).message);
    }
}

function entityIcon(kind: ModelEntity['kind']) {
    if (kind === 'boolean') return AnalyticsOutline;
    if (kind === 'extrude') return LayersOutline;
    if (kind === 'cylinder') return AlbumsIcon;
    if (kind === 'sphere') return EllipseOutline;
    return CubeOutline;
}

const AlbumsIcon = ShapesOutline;

function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') {
        event.preventDefault();
        flushSave();
        return;
    }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
    }
    if (event.metaKey || event.ctrlKey || event.code === 'Space') return;
    if (event.code === 'Enter' && sketchMode.value) finishSketch();
    else if (event.code === 'Escape') sketchMode.value ? cancelSketch() : setTool('select');
    else if (event.code === 'Delete' || event.code === 'Backspace') removeSelected();
    else if (event.code === 'KeyV') setTool('select');
    else if (event.code === 'KeyG') setTool('translate');
    else if (event.code === 'KeyR') setTool('rotate');
    else if (event.code === 'KeyS') setTool('scale');
    else if (event.code === 'KeyF') viewport?.fit();
    else if (event.code === 'Digit1') setCameraView('front');
    else if (event.code === 'Digit3') setCameraView('right');
    else if (event.code === 'Digit7') setCameraView('top');
}

function setCameraView(view: CameraView) {
    currentView.value = view;
    viewport?.setView(view);
}

watch(document, () => {
    if (!transforming) viewport?.sync(document.value);
    scheduleSave();
}, { deep: true });
watch(selectedIds, (ids) => viewport?.setSelected(ids), { deep: true });
watch(() => project.value.name, scheduleSave);
watch(gridVisible, (value) => viewport?.setGridVisible(value));

onMounted(async () => {
    viewport = new Viewport(viewportElement.value!, {
        onSelect: selectEntity,
        onTransform: (id, position, rotation, scale) => {
            const item = document.value.entities.find((entity) => entity.id === id);
            if (!item) return;
            if (!transforming) {
                pushHistory();
                transforming = true;
            }
            item.position = position;
            item.rotation = rotation;
            item.scale = scale;
        },
        onTransformEnd: () => {
            if (!transforming) return;
            transforming = false;
            viewport.sync(document.value);
        },
        onSketchPoint: addSketchPoint,
        onSketchComplete: finishSketch,
        onSpaceChange: (active) => spaceActive.value = active,
        onStats: (value) => stats.value = value,
    });
    viewport.sync(document.value);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', flushSave);
    try {
        await reloadProjects();
        const active = getActiveProjectId();
        const initial = projects.value.find((item) => item.id === active) || projects.value[0];
        if (initial) await openProject(initial.id, false);
        else {
            const box = createEntity('box', uid());
            box.name = '立方体 1';
            document.value.entities.push(box);
            selectedIds.value = [box.id];
            await flushSave();
            await reloadProjects();
            setActiveProjectId(project.value.id);
        }
        await nextTick();
        viewport.fit();
    } catch (error) {
        message.error(`无法打开本地项目库：${(error as Error).message}`);
    }
});

onBeforeUnmount(() => {
    clearTimeout(saveTimer);
    flushSave();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('beforeunload', flushSave);
    viewport?.dispose();
});
</script>

<template>
    <div class="studio-shell">
        <header class="topbar">
            <div class="brand">
                <div class="brand-mark"><NIcon :size="23"><CubeOutline /></NIcon></div>
                <div><strong>FORM</strong><span>3D STUDIO</span></div>
            </div>
            <div class="topbar-project">
                <span class="local-badge"><i></i> 本地项目</span>
                <NInput v-model:value="project.name" class="project-name" size="small" :bordered="false" />
            </div>
            <div class="topbar-actions">
                <span class="save-state" :class="saveState"><NIcon :size="15"><CheckmarkOutline /></NIcon>{{ saveLabel }}</span>
                <NTooltip><template #trigger><button class="icon-button" :disabled="!canUndo" @click="undo"><NIcon><ArrowUndoOutline /></NIcon></button></template>撤销 ⌘Z</NTooltip>
                <NTooltip><template #trigger><button class="icon-button" :disabled="!canRedo" @click="redo"><NIcon><ArrowRedoOutline /></NIcon></button></template>重做 ⇧⌘Z</NTooltip>
                <button class="icon-button" @click="showHelp = true"><NIcon><HelpCircleOutline /></NIcon></button>
                <NPopover trigger="click" placement="bottom-end" :show-arrow="false" content-class="export-popover">
                    <template #trigger><NButton type="primary" :loading="exporting"><template #icon><NIcon><DownloadOutline /></NIcon></template>导出模型<NIcon class="chevron"><ChevronDownOutline /></NIcon></NButton></template>
                    <div class="export-panel">
                        <div class="popover-title">导出模型</div>
                        <label>网格精度</label>
                        <NSelect v-model:value="exportQuality" size="small" :options="[
                            { label: '高精度 · 128 细分', value: 'high' },
                            { label: '超高精度 · 256 细分', value: 'ultra' },
                        ]" />
                        <p>由参数化源数据重新生成，不使用预览网格。</p>
                        <NButton block secondary @click="runExport('stl')">STL <span>用于 3D 打印</span></NButton>
                        <NButton block secondary @click="runExport('glb')">GLB <span>包含材质</span></NButton>
                        <div class="popover-divider"></div>
                        <button class="text-action" @click="exportProject(document, project.name)"><NIcon><DocumentOutline /></NIcon>导出可编辑项目 JSON</button>
                    </div>
                </NPopover>
            </div>
        </header>

        <div class="workspace">
            <aside class="left-panel panel">
                <section class="project-section">
                    <div class="section-label">项目</div>
                    <NSelect :value="project.id" :options="projectOptions" size="small" @update:value="openProject" />
                    <div class="project-actions">
                        <NTooltip><template #trigger><button @click="showNewProject = true"><NIcon><AddOutline /></NIcon></button></template>新建项目</NTooltip>
                        <NTooltip><template #trigger><button @click="duplicateProject"><NIcon><CopyOutline /></NIcon></button></template>复制项目</NTooltip>
                        <NTooltip><template #trigger><button @click="importProject"><NIcon><FolderOpenOutline /></NIcon></button></template>导入项目 JSON</NTooltip>
                        <NPopconfirm @positive-click="removeProject"><template #trigger><button class="danger-hover"><NIcon><TrashOutline /></NIcon></button></template>删除当前项目？此操作不可撤销。</NPopconfirm>
                    </div>
                </section>

                <section class="create-section">
                    <div class="section-label">创建实体</div>
                    <div class="create-grid">
                        <button @click="addEntity('box')"><span class="shape-icon box-shape"></span>立方体</button>
                        <button @click="addEntity('cylinder')"><span class="shape-icon cylinder-shape"></span>圆柱体</button>
                        <button @click="addEntity('sphere')"><span class="shape-icon sphere-shape"></span>球体</button>
                        <button :class="{ active: sketchMode }" @click="startSketch"><NIcon><CreateOutline /></NIcon>草图拉伸</button>
                    </div>
                </section>

                <section class="objects-section">
                    <div class="section-label">实体 <span>{{ document.entities.length }}</span></div>
                    <div class="object-list">
                        <div v-if="!document.entities.length" class="empty-objects">创建一个实体开始建模</div>
                        <div v-for="item in document.entities" :key="item.id" class="object-row" :class="{ selected: selectedIds.includes(item.id), muted: !item.visible }" @click="selectEntity(item.id, $event.metaKey || $event.ctrlKey || $event.shiftKey)">
                            <NIcon class="object-type"><component :is="entityIcon(item.kind)" /></NIcon>
                            <span>{{ item.name }}</span>
                            <button class="visibility" @click.stop="pushHistory(); item.visible = !item.visible"><NIcon><component :is="item.visible ? EyeOutline : EyeOffOutline" /></NIcon></button>
                        </div>
                    </div>
                </section>
                <div class="storage-note"><NIcon><CloudDoneOutline /></NIcon><div><strong>自动保存</strong><span>项目仅存储在此浏览器的 IndexedDB 中</span></div></div>
            </aside>

            <main class="viewport-area">
                <div class="model-toolbar">
                    <div class="tool-group">
                        <NTooltip v-for="tool in [
                            { id: 'select', icon: NavigateOutline, label: '选择', key: 'V' },
                            { id: 'translate', icon: MoveOutline, label: '移动', key: 'G' },
                            { id: 'rotate', icon: RepeatOutline, label: '旋转', key: 'R' },
                            { id: 'scale', icon: ResizeOutline, label: '缩放', key: 'S' },
                        ]" :key="tool.id">
                            <template #trigger><button class="tool-button" :class="{ active: activeTool === tool.id }" @click="setTool(tool.id as ViewTool)"><NIcon><component :is="tool.icon" /></NIcon></button></template>{{ tool.label }} · {{ tool.key }}
                        </NTooltip>
                    </div>
                    <div class="tool-group boolean-tools">
                        <NTooltip><template #trigger><button class="tool-button" :disabled="!canBoolean" @click="applyBoolean('union')"><NIcon><AddOutline /></NIcon></button></template>并集 · 先选择两个实体</NTooltip>
                        <NTooltip><template #trigger><button class="tool-button" :disabled="!canBoolean" @click="applyBoolean('subtract')"><NIcon><CutOutline /></NIcon></button></template>差集 · 先选被减实体，再选切削体</NTooltip>
                        <NTooltip><template #trigger><button class="tool-button" :disabled="!canBoolean" @click="applyBoolean('intersect')"><NIcon><ShapesOutline /></NIcon></button></template>交集</NTooltip>
                    </div>
                    <div class="toolbar-spacer"></div>
                    <div class="view-switcher">
                        <button v-for="view in [{ id: 'perspective', label: '透视' }, { id: 'front', label: '前' }, { id: 'top', label: '顶' }, { id: 'right', label: '右' }]" :key="view.id" :class="{ active: currentView === view.id }" @click="setCameraView(view.id as CameraView)">{{ view.label }}</button>
                    </div>
                    <NTooltip><template #trigger><button class="tool-button" :class="{ active: gridVisible }" @click="gridVisible = !gridVisible"><NIcon><GridOutline /></NIcon></button></template>显示 / 隐藏网格</NTooltip>
                    <NTooltip><template #trigger><button class="tool-button" @click="viewport?.fit()"><NIcon><CameraOutline /></NIcon></button></template>适合画布 · F</NTooltip>
                </div>

                <div ref="viewportElement" class="viewport"></div>
                <div class="viewport-caption"><span class="axis-dot"></span>毫米 (mm)</div>
                <div v-if="sketchMode" class="sketch-banner">
                    <div><NIcon><CreateOutline /></NIcon><strong>绘制封闭草图</strong><span>单击添加顶点 · 双击或按 Enter 完成 · Esc 取消</span></div>
                    <span>{{ sketchPoints.length }} 个顶点</span>
                    <NButton size="small" type="primary" :disabled="!sketchClosed" @click="finishSketch">完成并拉伸</NButton>
                    <button class="icon-button" @click="cancelSketch"><NIcon><CloseOutline /></NIcon></button>
                </div>
                <div class="viewport-status">
                    <span :class="{ accent: spaceActive }">按住空格 + 拖拽平移</span><i></i><span>空白处拖拽旋转</span><i></i><span>滚轮缩放</span><i></i><span>⌘ 单击多选</span>
                    <div>{{ stats.objects }} 实体 · {{ stats.triangles.toLocaleString() }} 三角面</div>
                </div>
            </main>

            <aside class="right-panel panel">
                <template v-if="selected">
                    <div class="inspector-heading"><div class="entity-symbol"><NIcon><component :is="entityIcon(selected.kind)" /></NIcon></div><div><input :value="selected.name" @change="updateEntity('name', ($event.target as HTMLInputElement).value)" /><span>{{ ENTITY_NAMES[selected.kind] }}</span></div></div>
                    <div class="inspector-actions">
                        <button :disabled="selected.kind === 'boolean'" @click="duplicateSelected"><NIcon><CopyOutline /></NIcon>复制</button>
                        <button class="danger" @click="removeSelected"><NIcon><TrashOutline /></NIcon>删除</button>
                    </div>

                    <section class="inspector-section">
                        <div class="section-label">变换</div>
                        <div v-for="row in [
                            { key: 'position', label: '位置', unit: 'mm', step: 1 },
                            { key: 'rotation', label: '旋转', unit: '°', step: 15 },
                            { key: 'scale', label: '缩放', unit: '×', step: 0.1 },
                        ]" :key="row.key" class="vector-row">
                            <label>{{ row.label }}</label>
                            <div><NInputNumber v-for="(_, index) in selected[row.key as 'position']" :key="index" :value="selected[row.key as 'position'][index]" size="small" :show-button="false" :step="row.step" :min="row.key === 'scale' ? 0.01 : undefined" @update:value="updateVector(row.key as 'position', index, $event)" /></div>
                        </div>
                    </section>

                    <section v-if="selected.kind !== 'boolean'" class="inspector-section">
                        <div class="section-label">尺寸</div>
                        <div v-if="selected.kind === 'box'" class="property-grid">
                            <label>宽度 <NInputNumber :value="selected.width" :min="0.1" size="small" @update:value="updateEntity('width', $event)" /></label>
                            <label>高度 <NInputNumber :value="selected.height" :min="0.1" size="small" @update:value="updateEntity('height', $event)" /></label>
                            <label>深度 <NInputNumber :value="selected.depth" :min="0.1" size="small" @update:value="updateEntity('depth', $event)" /></label>
                        </div>
                        <div v-else-if="selected.kind === 'cylinder' || selected.kind === 'sphere'" class="property-grid">
                            <label>半径 <NInputNumber :value="selected.radius" :min="0.1" size="small" @update:value="updateEntity('radius', $event)" /></label>
                            <label v-if="selected.kind === 'cylinder'">高度 <NInputNumber :value="selected.height" :min="0.1" size="small" @update:value="updateEntity('height', $event)" /></label>
                        </div>
                        <div v-else class="property-grid">
                            <label>拉伸厚度 <NInputNumber :value="selected.depth" :min="0.1" size="small" @update:value="updateEntity('depth', $event)" /></label>
                            <div class="sketch-info">轮廓包含 {{ selected.points?.length }} 个精确坐标点</div>
                        </div>
                    </section>
                    <section v-else class="inspector-section">
                        <div class="section-label">布尔特征</div>
                        <div class="boolean-description">{{ selected.operation === 'union' ? '并集：合并两个实体' : selected.operation === 'subtract' ? '差集：从第一个实体减去第二个' : '交集：保留重叠区域' }}</div>
                        <div class="operand" v-for="id in selected.operands" :key="id"><span></span>{{ document.entities.find(item => item.id === id)?.name }}</div>
                    </section>

                    <section class="inspector-section">
                        <div class="section-label">边处理 <button v-if="selected.edge" class="section-action" @click="clearEdge">清除</button></div>
                        <template v-if="canEdge">
                            <div class="edge-buttons"><button :class="{ active: selected.edge?.type === 'chamfer' }" @click="setEdge('chamfer')"><span class="chamfer-icon"></span>倒角</button><button :class="{ active: selected.edge?.type === 'fillet' }" @click="setEdge('fillet')"><span class="fillet-icon"></span>圆角</button></div>
                            <div v-if="selected.edge" class="edge-settings">
                                <label>{{ selected.edge.type === 'fillet' ? '圆角半径' : '倒角距离' }}<span>{{ selected.edge.size.toFixed(1) }} mm</span></label>
                                <input type="range" min="0.1" :max="edgeLimit" step="0.1" :value="selected.edge.size" @input="updateEntity('edge', { ...selected.edge!, size: Number(($event.target as HTMLInputElement).value) })" />
                                <NInputNumber :value="selected.edge.size" :min="0.1" :max="edgeLimit" :step="0.5" size="small" @update:value="updateEntity('edge', { ...selected.edge!, size: $event || 0.1 })"><template #suffix>mm</template></NInputNumber>
                                <p>当前作用于实体的全部边。参数随项目保留，导出时应用更高细分。</p>
                            </div>
                        </template>
                        <p v-else class="disabled-hint">{{ selected.kind === 'sphere' ? '球体无需额外边处理' : '布尔结果暂不支持边处理，请先处理源实体' }}</p>
                    </section>
                    <section class="inspector-section appearance-section"><div class="section-label">外观</div><label><input type="color" :value="selected.color" @input="updateEntity('color', ($event.target as HTMLInputElement).value)" /><span>实体颜色</span><code>{{ selected.color }}</code></label></section>
                </template>
                <template v-else-if="selectedEntities.length > 1">
                    <div class="inspector-heading multi"><div class="entity-symbol"><NIcon><ShapesOutline /></NIcon></div><div><strong>已选择 {{ selectedEntities.length }} 个实体</strong><span>可执行布尔运算</span></div></div>
                    <section class="inspector-section"><div class="section-label">布尔运算</div><NButton block secondary @click="applyBoolean('union')">并集</NButton><NButton block secondary @click="applyBoolean('subtract')">差集（{{ selectedEntities[0].name }} − {{ selectedEntities[1].name }}）</NButton><NButton block secondary @click="applyBoolean('intersect')">交集</NButton><p class="disabled-hint">选择顺序决定差集的操作数。</p></section>
                </template>
                <div v-else class="no-selection"><div><NIcon><CubeOutline /></NIcon></div><strong>开始你的设计</strong><p>从左侧创建实体，或在画布中绘制草图。</p><span>选择实体后，在这里编辑尺寸、变换和边处理。</span></div>
            </aside>
        </div>

        <NModal v-model:show="showNewProject" preset="card" title="新建项目" style="width: 420px" :bordered="false">
            <label class="modal-field">项目名称<NInput v-model:value="newProjectName" autofocus placeholder="未命名项目" @keyup.enter="newProject" /></label>
            <p class="modal-note">新项目将包含一个立方体，所有数据保存在当前浏览器。</p>
            <div class="modal-actions"><NButton @click="showNewProject = false">取消</NButton><NButton type="primary" @click="newProject">创建项目</NButton></div>
        </NModal>
        <NModal v-model:show="showHelp" preset="card" title="Form 3D 使用指南" style="width: 600px" :bordered="false">
            <div class="help-content">
                <section><strong>画布操作</strong><p>空白处拖拽旋转，右键或按住空格拖拽平移，滚轮缩放。双击选中实体可聚焦。</p></section>
                <section><strong>建模与多选</strong><p>使用 V / G / R / S 切换选择、移动、旋转和缩放。按住 ⌘ / Ctrl 单击选择两个实体后执行布尔运算；差集以先选实体为被减体。</p></section>
                <section><strong>草图拉伸</strong><p>在地面网格上逐点绘制封闭轮廓，双击或点击“完成并拉伸”。原始轮廓坐标始终保存在项目中。</p></section>
                <section><strong>数据与精度</strong><p>项目采用参数化 JSON：保存实体尺寸、草图点、变换和特征历史，而非预览三角网格。STL / GLB 导出会按所选精度重新细分。STL 是网格格式，不包含材质或精确 B-rep 曲面。</p></section>
                <section><strong>快捷键</strong><p>F 适合画布 · 1 前视图 · 7 顶视图 · 3 右视图 · Delete 删除 · ⌘Z 撤销 · ⌘S 保存</p></section>
            </div>
        </NModal>
        <input ref="importInput" type="file" accept=".json,.model.json" hidden @change="onImportFile" />
    </div>
</template>
