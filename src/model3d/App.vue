<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { NButton, NCheckbox, NIcon, NInput, NModal, NPopconfirm, NPopover, NSelect, NTooltip, useMessage } from 'naive-ui';
import {
    AddOutline, AnalyticsOutline, ArrowRedoOutline, ArrowUndoOutline, ArrowUpOutline, CameraOutline,
    ChevronDownOutline, CloseOutline, CopyOutline, CreateOutline, CubeOutline,
    CutOutline, DocumentOutline, DownloadOutline, EllipseOutline, EyeOffOutline, EyeOutline, FolderOpenOutline,
    GridOutline, HelpCircleOutline, LayersOutline, MoveOutline, RepeatOutline, ResizeOutline,
    ShapesOutline, TrashOutline, NavigateOutline, FolderOutline, PencilOutline, ScanOutline,
    SearchOutline, BuildOutline, ListOutline, TimeOutline, LockClosedOutline, LockOpenOutline,
} from '@vicons/ionicons5';
import { Viewport, type EditPhase, type ViewTool, type SketchDimension } from './engine/Viewport';
import EntityTree, { type OutlinerNode } from './components/entity/EntityTree.vue';
import SvgIcon from './components/ui/SvgIcon.vue';
import { entityProfileClosed, profileArcCenter, profileClosed, profileEllipseAngle, type ProfileType, type ProfileCurves } from './engine/profiles';
import { borderSegments, sliceBorder, splitCubic } from './engine/sketchBorders';
import { buildEntityMesh } from './engine/geometry';
import { exportGLB, exportProject, exportSTL } from './engine/exporters';
import { deleteProject, getActiveProjectId, listProjects, putProject, setActiveProjectId } from './stores/store';
import { useUndoHistory } from './composables/useUndoHistory';
import { storedLengthUnit, useUnits } from './composables/useUnits';
import { uid } from './utils/id';
import AppTopBar from './components/layout/AppTopBar.vue';
import EntitySidebar from './components/layout/EntitySidebar.vue';
import ModelingToolbar from './components/modeling/ModelingToolbar.vue';
import SketchToolbar from './components/sketch/SketchToolbar.vue';
import SketchConstraints from './components/sketch/SketchConstraints.vue';
import MenuCommand from './components/ui/MenuCommand.vue';
import IntegerInputNumber from './components/ui/IntegerInputNumber.vue';
import { INTERACTION } from './config/const';
import { solveSketchConstraints, straightConstraintSegment, type SketchConstraintType } from './engine/sketchConstraints';
import { restitchSketchEdges, type RestitchEdge } from './engine/sketchRestitch';
import {
    cloneDocument, createDocument, createEntity, ENTITY_NAMES, isDocument, normalizeDocument,
    type BooleanOperation, type GeometryQuality, type ModelDocument, type ModelEntity, type ProjectRecord, type Point2, type Vec3, type SketchPlane, type LengthUnit,
} from './types';

const message = useMessage();
const viewportElement = ref<HTMLElement>();
const importInput = ref<HTMLInputElement>();
let viewport: Viewport;
let saveTimer: ReturnType<typeof setTimeout>;
let restoring = false;
let transforming = false;
let directBase: ModelEntity | null = null;
let directHistoryPushed = false;
let extrudeGestureMoved = false;
let sketchCenterDrag: { start: Point2; points: Point2[]; curves: ProfileCurves } | null = null;
let sketchRefreshFrame = 0;

const projects = ref<ProjectRecord[]>([]);
const document = ref<ModelDocument>(createDocument(storedLengthUnit()));
const project = ref<ProjectRecord>(createProject('未命名项目'));
const selectedIds = ref<string[]>([]);
const saveState = ref<'saved' | 'saving' | 'dirty'>('saved');
const activeTool = ref<ViewTool>('select');
const exportQuality = ref<GeometryQuality>('high');
const exporting = ref(false);
const gridVisible = ref(true);
const shadowVisible = ref(false);
const projectionMode = ref<'perspective' | 'orthographic'>('perspective');
const spaceActive = ref(false);
const showNewProject = ref(false);
const showHelp = ref(false);
const newProjectName = ref('未命名项目');
const sketchMode = ref(false);
const sketchType = ref<ProfileType>('polygon');
const sketchCurves = ref<ProfileCurves>({});
const sketchSides = ref(3);
const selectedSketchSegment = ref(-1);
const sketchPoints = ref<Point2[]>([]);
const sketchDepth = ref(10);
const selectedSketchPoint = ref(-1);
const editingSketchId = ref<string | null>(null);
type OperationState = {
    type: 'extrude'; profileId: string; bodyId: string; profileIds: string[]; bodyIds: string[]; before: ModelDocument; result: 'new' | BooleanOperation; targetId: string | null; existing: boolean;
} | {
    type: 'boolean'; resultId: string; targetId: string; toolId: string; before: ModelDocument; keepTarget: boolean; keepTool: boolean; existing: boolean;
};
const operation = ref<OperationState | null>(null);
const historyEditId = ref<string | null>(null);
const stats = ref({ vertices: 0, triangles: 0, objects: 0 });
const measureMode = ref(false);
const activePlaneId = ref<string | null>(null);
const lastFace = ref<{ bodyId: string; normal: Vec3; point: Vec3 } | null>(null);
const contextMenu = ref<{ x: number; y: number; node: OutlinerNode } | null>(null);
const viewportMenu = ref<{ x: number; y: number; id: string | null } | null>(null);
const sketchContextMenu = ref<{ x: number; y: number; id: string | null } | null>(null);
const showRename = ref(false);
const renameValue = ref('');
const renameTarget = ref<OutlinerNode | null>(null);
type PrimaryPanel = 'search' | 'sketch' | 'insert' | 'construct' | 'tools' | 'display';
type SelectionKind = 'face' | 'edge' | 'body' | 'plane' | 'sketch' | 'mixed' | null;
const activePanel = ref<PrimaryPanel | null>(null);
const selectionKind = ref<SelectionKind>(null);
const parameterCardOpen = ref(true);
const itemsVisible = ref(true);
const commandSearch = ref('');
const isolateActive = ref(false);
const sectionActive = ref(false);
const displayMode = ref<'shaded' | 'wireframe' | 'xray'>('shaded');
const showEdges = ref(true);
const selectedSketchSegments = ref<number[]>([]);
const sketchLockedPoints = ref<number[]>([]);
const sketchSectorAngle = ref(360);
const sketchOpen = ref(false);
const sketchProfileStartAngle = ref<number | undefined>(undefined);
const sketchAppendMode = ref(true);
const sketchSelectionTool = ref(false);

const projectOptions = computed(() => projects.value.map((item) => ({ label: item.name, value: item.id })));
const selectedEntities = computed(() => selectedIds.value.map((id) => document.value.entities.find((item) => item.id === id)).filter(Boolean) as ModelEntity[]);
const selectedSketches = computed(() => selectedEntities.value.filter((item) => item.kind === 'sketch'));
const selected = computed(() => selectedEntities.value.length === 1 ? selectedEntities.value[0] : null);
const { canUndo, canRedo, pushHistory, popHistory, undo, redo, clearHistory } = useUndoHistory(document, selectedIds);
const { lengthUnit, scaleBar, scaleBarLabel, setLengthUnit, displayLength, inputLength, formatLength } = useUnits(document, () => { viewport?.setLengthUnit(lengthUnit.value); refreshSketch(); });
const canBoolean = computed(() => selectedEntities.value.length === 2);
const sketchClosed = computed(() => ['circle', 'regular'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : ['polygon', 'line'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : sketchPoints.value.length >= 3);
const uiState = computed(() => sketchMode.value ? 'Sketch' : historyEditId.value ? 'HistoryEdit' : operation.value ? 'ToolActive' : selectedIds.value.length ? 'SelectionAdaptive' : 'Default');
const extrudeBody = computed(() => operation.value?.type === 'extrude' ? document.value.entities.find((item) => item.id === operation.value!.bodyId) : null);
const booleanDraft = computed(() => operation.value?.type === 'boolean' ? operation.value : null);
const operationTargets = computed(() => document.value.entities.filter((item) => !['sketch', 'folder'].includes(item.kind) && item.id !== extrudeBody.value?.id).map((item) => ({ label: item.name, value: item.id })));
const historySteps = computed(() => document.value.entities.flatMap((item) => {
    const steps = ['sketch', 'extrude', 'boolean'].includes(item.kind) ? [{ id: item.id, name: item.name, kind: item.kind as string }] : [];
    if (item.edge) steps.push({ id: `${item.id}:edge`, name: item.name, kind: item.edge.type });
    return steps;
}).reverse());
const activePlane = computed(() => document.value.planes.find((plane) => plane.id === activePlaneId.value) || null);
const canDraw = computed(() => !!activePlane.value && selectedIds.value.includes(activePlane.value.id));
const planeOptions = computed(() => document.value.planes.map((plane) => ({ label: plane.name, value: plane.id })));
const contextVisible = computed(() => parameterCardOpen.value && !sketchMode.value && operation.value?.type !== 'extrude' && ((!!selected.value && selected.value.kind !== 'sketch') || (selectedEntities.value.length > 1 && selectedSketches.value.length !== selectedEntities.value.length) || ['offsetFace', 'fillet', 'chamfer'].includes(activeTool.value)));
const visibleEntityCount = computed(() => document.value.entities.filter((item) => item.kind !== 'sketch').length);
const selectedPointLocked = computed(() => selectedSketchPoint.value >= 0 && sketchLockedPoints.value.includes(selectedSketchPoint.value));
const constraintSegmentCount = computed(() => selectedSketchSegments.value.filter((index) => straightConstraintSegment(sketchPoints.value, sketchCurves.value, index)).length);
const selectionLocked = computed(() => {
    if (selectedSketchPoint.value >= 0) return selectedPointLocked.value;
    if (!selectedSketchSegments.value.length) return false;
    const indices = new Set(selectedSketchSegments.value.flatMap((index) => [index, (index + 1) % sketchPoints.value.length]));
    return [...indices].every((index) => sketchLockedPoints.value.includes(index));
});
const commandResults = computed(() => {
    const commands = [
        { id: 'sketch', label: '草图', hint: '在基准面、构造平面或实体平面上绘制', keys: '草图 绘制 sketch' },
        { id: 'extrude', label: '拉伸', hint: '将闭合草图轮廓拉伸为实体', keys: '拉伸 挤出 extrude' },
        { id: 'offsetFace', label: '偏移面', hint: '推拉所选实体平面', keys: '推拉 偏移面 offset' },
        { id: 'fillet', label: '圆角', hint: '为所选实体边创建圆角', keys: '圆角 fillet' },
        { id: 'chamfer', label: '倒角', hint: '为所选实体边创建倒角', keys: '倒角 chamfer' },
        { id: 'translate', label: '移动 / 旋转', hint: '移动或旋转所选对象', keys: '移动 旋转 transform' },
        { id: 'scale', label: '缩放', hint: '缩放所选实体', keys: '缩放 scale' },
        { id: 'plane', label: '构造平面', hint: '添加构造平面', keys: '平面 构造 plane' },
        { id: 'box', label: '立方体', hint: '插入立方体', keys: '立方体 box' },
        { id: 'cylinder', label: '圆柱体', hint: '插入圆柱体', keys: '圆柱 cylinder' },
        { id: 'sphere', label: '球体', hint: '插入球体', keys: '球体 sphere' },
        { id: 'measure', label: '测量', hint: '测量两个点之间的距离与 XYZ 分量', keys: '测量 measure' },
    ];
    const query = commandSearch.value.trim().toLowerCase();
    return query ? commands.filter((item) => `${item.label} ${item.keys}`.toLowerCase().includes(query)) : commands;
});
const dimensionFields = computed(() => {
    const item = selected.value;
    if (!item) return [];
    if (item.kind === 'box') return [
        { key: 'width', label: '宽', value: item.width! }, { key: 'height', label: '高', value: item.height! }, { key: 'depth', label: '深', value: item.depth! },
    ];
    if (item.kind === 'cylinder') return [{ key: 'radius', label: '半径', value: item.radius! }, { key: 'height', label: '高', value: item.height! }];
    if (item.kind === 'sphere') return [{ key: 'radius', label: '半径', value: item.radius! }];
    if (item.kind === 'extrude') return [{ key: 'depth', label: '厚度', value: item.depth! }];
    return [];
});
const activeVector = computed(() => {
    if (!selected.value) return null;
    if (activeTool.value === 'translate') return { key: 'position' as const, label: '位置', value: selected.value.position, step: displayLength(1) };
    if (activeTool.value === 'rotate') return { key: 'rotation' as const, label: '旋转', value: selected.value.rotation, step: 15 };
    if (activeTool.value === 'scale') return { key: 'scale' as const, label: '缩放', value: selected.value.scale, step: 0.1 };
    return null;
});

const treeNodes = computed(() => {
    // Folders and entities share one parent graph, so either can contain nested nodes.
    const build = (parentId: string | null, trail: string[] = []): OutlinerNode[] => {
        const folders = document.value.folders.filter((item) => item.parentId === parentId).map((folder) => ({ folder, order: 0 }));
        const entities = document.value.entities.filter((item) => item.kind !== 'sketch' && item.parentId === parentId).map((entity) => ({ entity, order: 1 }));
        return [...folders, ...entities].flatMap((entry: any) => {
            const item = entry.folder || entry.entity;
            if (trail.includes(item.id)) return [];
            return [{
                id: item.id, kind: entry.folder ? 'folder' : 'entity', name: item.name, visible: item.visible,
                children: build(item.id, [...trail, item.id]),
            } as OutlinerNode];
        });
    };
    const planeNodes = document.value.planes.map((plane) => ({
        id: plane.id, kind: 'plane', name: plane.name, visible: plane.visible,
        children: sketchMode.value && plane.id === activePlaneId.value
            ? document.value.entities.filter((item) => item.kind === 'sketch' && item.planeId === plane.id).map((item) => ({ id: item.id, kind: 'entity', name: item.name, visible: item.visible, children: [] } as OutlinerNode))
            : [],
    } as OutlinerNode));
    return [...planeNodes, ...build(null)];
});

function createProject(name: string): ProjectRecord {
    const now = Date.now();
    return { id: uid(), name, createdAt: now, updatedAt: now, document: createDocument(storedLengthUnit()) };
}
function cloneEntity(entity: ModelEntity) { return JSON.parse(JSON.stringify(entity)) as ModelEntity; }
function uniqueName(kind: ModelEntity['kind']) {
    const base = ENTITY_NAMES[kind];
    let index = document.value.entities.filter((item) => item.kind === kind).length + 1;
    let name = `${base} ${index}`;
    while (document.value.entities.some((item) => item.name === name)) name = `${base} ${++index}`;
    return name;
}
function togglePanel(panel: PrimaryPanel) {
    if (sketchMode.value && panel !== 'sketch') cancelSketch();
    activePanel.value = activePanel.value === panel ? null : panel;
    viewportMenu.value = null;
}
function chooseTool(tool: ViewTool) {
    if (activeTool.value === tool && !operation.value) {
        parameterCardOpen.value = !parameterCardOpen.value;
        return;
    }
    parameterCardOpen.value = true;
    activePanel.value = null;
    setTool(tool);
}
function createPrimitive(kind: 'box' | 'cylinder' | 'sphere') {
    pushHistory();
    const entity = createEntity(kind, uid());
    entity.name = uniqueName(kind);
    document.value.entities.push(entity);
    selectedIds.value = [entity.id];
    selectionKind.value = 'body';
    activePanel.value = null;
    parameterCardOpen.value = true;
    setTool('translate');
    nextTick(() => viewport?.fitSelection());
}
function beginSketch(planeId?: string) {
    if (planeId) selectPlane(planeId);
    if (!canDraw.value && !(selectionKind.value === 'face' && selected.value && lastFace.value?.bodyId === selected.value.id)) {
        activePanel.value = 'sketch';
        return;
    }
    activePanel.value = null;
    startSketch();
}
function runCommand(id: string) {
    commandSearch.value = '';
    activePanel.value = null;
    if (id === 'sketch') return beginSketch();
    if (id === 'extrude' && selected.value?.kind === 'sketch') return startExtrude(selected.value.id);
    if (id === 'extrude') return message.warning('请先选择闭合 Sketch profile');
    if (['offsetFace', 'fillet', 'chamfer', 'translate', 'scale'].includes(id)) return chooseTool(id as ViewTool);
    if (id === 'plane') return createPlane();
    if (['box', 'cylinder', 'sphere'].includes(id)) return createPrimitive(id as 'box' | 'cylinder' | 'sphere');
    if (id === 'measure') return toggleMeasure();
}
function toggleIsolate() {
    if (isolateActive.value) {
        viewport?.setIsolate(null);
        isolateActive.value = false;
        return;
    }
    if (!selectedIds.value.length) return message.warning('请先选择要隔离的对象');
    viewport?.setIsolate(selectedIds.value);
    isolateActive.value = true;
    activePanel.value = null;
}
function toggleSection() {
    sectionActive.value = !sectionActive.value;
    const plane = activePlane.value && selectedIds.value.includes(activePlane.value.id) ? activePlane.value : null;
    const normal = plane?.normal || lastFace.value?.normal || [0, 1, 0];
    const point = plane?.origin || lastFace.value?.point || [0, 0, 0];
    viewport?.setSection(sectionActive.value, normal as Vec3, point as Vec3);
}
function updateDisplayMode(mode: 'shaded' | 'wireframe' | 'xray') {
    displayMode.value = mode;
    viewport?.setDisplayMode(mode, showEdges.value);
}
function openViewportMenu(id: string | null, x: number, y: number) {
    if (id && !selectedIds.value.includes(id)) {
        selectedIds.value = [id];
        selectionKind.value = document.value.entities.find((item) => item.id === id)?.kind === 'sketch' ? 'sketch' : 'body';
    }
    viewportMenu.value = { id, x: Math.min(x, window.innerWidth - 190), y: Math.min(y, window.innerHeight - 170) };
}
function zoomToSelection() {
    viewport?.fitSelection();
    viewportMenu.value = null;
}
function onHoverSketch(id: string, normal: Vec3, point: Vec3) {
    const entity = document.value.entities.find((item) => item.id === id);
    if (!entity || entity.kind === 'sketch' || sketchMode.value) return;
    selectedIds.value = [id];
    selectionKind.value = 'face';
    lastFace.value = { bodyId: id, normal, point };
    createPlane();
    beginSketch(activePlaneId.value!);
}
function onMarqueeSelect(ids: string[], additive: boolean) {
    selectedIds.value = additive ? [...new Set([...selectedIds.value, ...ids])] : ids;
    selectionKind.value = selectedIds.value.length === 1 ? 'body' : selectedIds.value.length > 1 ? 'mixed' : null;
    activePanel.value = null;
    parameterCardOpen.value = true;
    setTool(selectedIds.value.length === 1 ? 'translate' : 'select');
}
function onBlankCommit() {
    if (operation.value) return doneOperation();
    if (['offsetFace', 'fillet', 'chamfer'].includes(activeTool.value)) {
        setTool('select');
        parameterCardOpen.value = false;
        return;
    }
    selectEntity(null);
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
    cancelSketch();
    restoring = true;
    project.value = next;
    document.value = normalizeDocument(cloneDocument(next.document));
    lengthUnit.value = storedLengthUnit();
    activePlaneId.value = document.value.planes[0]?.id || null;
    selectedIds.value = [];
    isolateActive.value = false;
    sectionActive.value = false;
    viewport?.setIsolate(null);
    viewport?.setSection(false);
    clearHistory();
    setActiveProjectId(id);
    setTool('select');
    await nextTick();
    viewport?.sync(document.value);
    viewport?.setActivePlane(activePlane.value);
    viewport?.fit();
    restoring = false;
    saveState.value = 'saved';
}
async function reloadProjects() { projects.value = await listProjects(); }
async function newProject() {
    await flushSave();
    const next = createProject(newProjectName.value.trim() || '未命名项目');
    await putProject(next);
    await reloadProjects();
    showNewProject.value = false;
    newProjectName.value = '未命名项目';
    await openProject(next.id);
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
    await deleteProject(project.value.id);
    await reloadProjects();
    if (!projects.value.length) {
        const next = createProject('未命名项目');
        await putProject(next);
        await reloadProjects();
    }
    await openProject(projects.value[0].id, false);
    message.success('项目已删除');
}

function selectEntity(id: string | null, additive = false) {
    if (!id) {
        if (!additive) selectedIds.value = [];
        if (!additive) selectionKind.value = null;
        return;
    }
    selectedIds.value = additive
        ? selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id]
        : [id];
}
function setTool(tool: ViewTool) {
    if (operation.value && activeTool.value !== tool) cancelOperation();
    if (measureMode.value) { measureMode.value = false; viewport?.setMeasureMode(false); }
    if (sketchMode.value) cancelSketch();
    activeTool.value = tool;
    viewport?.setTool(tool);
}
function updateEntity(key: keyof ModelEntity, value: any) {
    if (!selected.value || value === null) return;
    pushHistory();
    (selected.value as any)[key] = value;
}
function updateLengthEntity(key: keyof ModelEntity, value: number | null) { updateEntity(key, inputLength(value)); }
function updateExtrudeLength(value: number | null) { updateExtrude('depth', inputLength(value)); }
function updateEdgeSize(value: number | null) {
    if (!selected.value || !['fillet', 'chamfer'].includes(activeTool.value)) return;
    updateEntity('edge', { type: activeTool.value, size: inputLength(value) || 0, segments: selected.value.edge?.segments || 6 });
}
function updateVector(key: 'position' | 'rotation' | 'scale', index: number, value: number | null) {
    if (!selected.value || value === null) return;
    pushHistory();
    selected.value[key][index] = key === 'scale' ? Math.max(0.01, value) : key === 'position' ? inputLength(value)! : value;
}
function removeSelected() {
    if (selectedIds.value.length) deleteNodeIds(selectedIds.value);
}
function deleteNodeIds(ids: string[]) {
    const planeSketchIds = document.value.entities.filter((item) => item.kind === 'sketch' && item.planeId && ids.includes(item.planeId)).map((item) => item.id);
    const allIds = [...new Set([...ids, ...planeSketchIds])];
    const remainingSelectedIds = selectedIds.value.filter((id) => !allIds.includes(id));
    const removedEditedSketch = !!editingSketchId.value && allIds.includes(editingSketchId.value);
    const referenced = document.value.entities.find((item) => !allIds.includes(item.id) && ((item.kind === 'boolean' && item.operands?.some((id) => allIds.includes(id))) || (item.profileId && allIds.includes(item.profileId))));
    if (referenced) return message.warning(`请先删除依赖它的「${referenced.name}」`);
    pushHistory();
    if (sketchMode.value && activePlaneId.value && ids.includes(activePlaneId.value)) cancelSketch();
    allIds.forEach((id) => {
        const item = document.value.entities.find((entity) => entity.id === id);
        if (item?.kind === 'boolean') item.operands?.forEach((operandId) => {
            const operand = document.value.entities.find((entity) => entity.id === operandId);
            if (operand) operand.visible = true;
        });
        document.value.folders.filter((folder) => folder.parentId === id).forEach((folder) => folder.parentId = null);
        document.value.entities.filter((entity) => entity.parentId === id).forEach((entity) => entity.parentId = null);
    });
    document.value.entities = document.value.entities.filter((item) => !allIds.includes(item.id));
    document.value.folders = document.value.folders.filter((item) => !allIds.includes(item.id));
    document.value.planes = document.value.planes.filter((item) => !allIds.includes(item.id));
    if (activePlaneId.value && allIds.includes(activePlaneId.value)) {
        activePlaneId.value = document.value.planes[0]?.id || null;
        viewport?.setActivePlane(activePlane.value);
    }
    if (removedEditedSketch) clearSketchSelection();
    selectedIds.value = remainingSelectedIds;
    selectionKind.value = remainingSelectedIds.length ? selectionKind.value : null;
}
function duplicateSelected() {
    const item = selected.value;
    if (!item || item.kind === 'boolean') return;
    pushHistory();
    const copy = cloneEntity(item);
    copy.id = uid();
    copy.name = `${item.name} 副本`;
    copy.position = [...copy.position];
    copy.position[0] += 10;
    copy.position[2] += 10;
    document.value.entities.push(copy);
    selectedIds.value = [copy.id];
}
function applyBoolean(type: BooleanOperation) {
    if (!canBoolean.value) return;
    const bodies = selectedEntities.value.filter((item) => item.kind !== 'sketch');
    if (bodies.length !== 2) return message.warning('请选择两个实体 Body');
    const [first, second] = bodies;
    const target = type === 'union' ? second : first;
    const tool = type === 'union' ? first : second;
    const before = cloneDocument(document.value);
    pushHistory();
    const names = { union: '并集', subtract: '差集', intersect: '交集' };
    const entity: ModelEntity = {
        id: uid(), parentId: null, name: `${names[type]} ${document.value.entities.filter((item) => item.kind === 'boolean').length + 1}`,
        kind: 'boolean', color: target.color, visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        operation: type, operands: [target.id, tool.id], edge: null,
    };
    document.value.entities.push(entity);
    operation.value = { type: 'boolean', resultId: entity.id, targetId: target.id, toolId: tool.id, before, keepTarget: false, keepTool: false, existing: false };
    activePanel.value = null;
    selectedIds.value = [target.id, tool.id];
    viewport?.setBooleanRoles({ target: target.id, tool: tool.id });
}
function startExtrude(profileId: string, existingBody?: ModelEntity, keepView = false) {
    if (operation.value) return;
    const primary = document.value.entities.find((item) => item.id === profileId && item.kind === 'sketch');
    if (!primary || !entityProfileClosed(primary)) return;
    const profiles = existingBody ? [primary] : [primary, ...selectedEntities.value.filter((item) => item.kind === 'sketch' && item.id !== profileId && entityProfileClosed(item))];
    const before = cloneDocument(document.value);
    pushHistory();
    const bodies: ModelEntity[] = [];
    profiles.forEach((profile, index) => {
        let body = index === 0 ? existingBody : undefined;
        if (!body) {
            body = createEntity('extrude', uid());
            body.name = uniqueName('extrude');
            body.parentId = profile.parentId;
            body.profileId = profile.id;
            body.points = profile.points!.map((point) => [...point]);
            body.profileType = profile.profileType;
            body.planeId = profile.planeId;
            body.depth = 10;
            body.sideMode = 'one';
            body.direction = 1;
            body.position = [0, 0, 0];
            body.sectorAngle = profile.sectorAngle;
            document.value.entities.push(body);
        }
        profile.visible = true;
        body.visible = true;
        bodies.push(body);
    });
    const body = bodies[0];
    let targetId: string | null = null;
    let result: 'new' | BooleanOperation = 'new';
    if (!existingBody) {
        const bounds = new THREE.Box3().setFromObject(buildEntityMesh(body, document.value));
        const target = document.value.entities.find((item) => item.visible && !bodies.some((entry) => entry.id === item.id) && item.kind !== 'sketch' && (() => {
            try { return bounds.intersectsBox(new THREE.Box3().setFromObject(buildEntityMesh(item, document.value))); } catch { return false; }
        })());
        if (target) { targetId = target.id; result = body.direction === -1 ? 'subtract' : 'union'; }
    }
    operation.value = { type: 'extrude', profileId, bodyId: body.id, profileIds: profiles.map((item) => item.id), bodyIds: bodies.map((item) => item.id), before, result, targetId, existing: !!existingBody };
    activePanel.value = null;
    historyEditId.value = existingBody?.id || null;
    selectedIds.value = profiles.map((item) => item.id);
    activeTool.value = 'extrude';
    viewport?.setTool('extrude');
    if (!keepView) viewport?.setView('perspective');
}
function updateExtrude(key: 'depth' | 'direction' | 'sideMode' | 'draftAngle', value: any) {
    if (operation.value?.type !== 'extrude' || value === null) return;
    operation.value.bodyIds.forEach((id) => {
        const body = document.value.entities.find((item) => item.id === id);
        if (body) (body as any)[key] = value;
    });
}
function onExtrudeGesture(profileId: string, direction: 1 | -1, delta: number, phase: EditPhase) {
    if (phase === 'start') {
        extrudeGestureMoved = false;
        if (!operation.value) startExtrude(profileId, undefined, true);
        if (operation.value?.type !== 'extrude') return;
        updateExtrude('direction', direction);
        updateExtrude('depth', 0.1);
        return;
    }
    if (phase === 'move' && operation.value?.type === 'extrude') {
        extrudeGestureMoved = true;
        updateExtrude('depth', Math.max(0.1, Math.round(delta * 100) / 100));
    } else if (phase === 'end' && !extrudeGestureMoved && operation.value?.type === 'extrude') cancelOperation();
}
function updateExtrudeResult(result: 'new' | BooleanOperation) {
    if (operation.value?.type === 'extrude') operation.value.result = result;
}
function swapBooleanRoles() {
    const draft = booleanDraft.value;
    if (!draft) return;
    [draft.targetId, draft.toolId] = [draft.toolId, draft.targetId];
    const entity = document.value.entities.find((item) => item.id === draft.resultId);
    if (entity) entity.operands = [draft.targetId, draft.toolId];
    selectedIds.value = [draft.targetId, draft.toolId];
    viewport?.setBooleanRoles({ target: draft.targetId, tool: draft.toolId });
}
function doneOperation() {
    const current = operation.value;
    if (!current) return;
    if (current.type === 'extrude') {
        const body = document.value.entities.find((item) => item.id === current.bodyId);
        current.profileIds.forEach((profileId) => {
            const profile = document.value.entities.find((item) => item.id === profileId);
            const plane = document.value.planes.find((item) => item.id === profile?.planeId);
            if (plane) plane.visible = false;
        });
        let selectedId = current.bodyId;
        if (current.result !== 'new') {
            if (!current.targetId) return message.warning('请选择自动布尔的目标 Body');
            const target = document.value.entities.find((item) => item.id === current.targetId);
            if (!target || !body) return;
            const result: ModelEntity = {
                id: uid(), parentId: body.parentId, name: `拉伸${current.result === 'union' ? '并集' : current.result === 'subtract' ? '差集' : '交集'} ${document.value.entities.length + 1}`,
                kind: 'boolean', color: body.color, visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
                operation: current.result, operands: [target.id, body.id], edge: null,
            };
            target.visible = false;
            body.visible = false;
            document.value.entities.push(result);
            selectedId = result.id;
        }
        selectedIds.value = [selectedId];
    } else {
        const target = document.value.entities.find((item) => item.id === current.targetId);
        const tool = document.value.entities.find((item) => item.id === current.toolId);
        if (target) target.visible = current.keepTarget;
        if (tool) tool.visible = current.keepTool;
        selectedIds.value = [current.resultId];
        viewport?.setBooleanRoles(null);
    }
    operation.value = null;
    historyEditId.value = null;
    setTool('select');
}
function cancelOperation() {
    const current = operation.value;
    if (!current) return;
    const selectedId = current.type === 'extrude' ? current.profileId : current.resultId;
    document.value = current.before;
    popHistory();
    operation.value = null;
    historyEditId.value = null;
    viewport?.setBooleanRoles(null);
    selectedIds.value = document.value.entities.some((item) => item.id === selectedId) ? [selectedId] : [];
    setTool('select');
}
function editHistory(id: string) {
    if (id.endsWith(':edge')) {
        const entity = document.value.entities.find((item) => item.id === id.slice(0, -5));
        if (!entity?.edge) return;
        selectedIds.value = [entity.id];
        selectionKind.value = 'edge';
        historyEditId.value = entity.id;
        activePanel.value = null;
        parameterCardOpen.value = true;
        setTool(entity.edge.type);
        return;
    }
    const entity = document.value.entities.find((item) => item.id === id);
    if (!entity) return;
    if (entity.kind === 'sketch') {
        if (entityProfileClosed(entity)) return startExtrude(id);
        selectedIds.value = [id];
        return startSketch(true);
    }
    if (entity.kind === 'extrude' && entity.profileId) return startExtrude(entity.profileId, entity);
    if (entity.kind === 'boolean' && entity.operands) {
        const before = cloneDocument(document.value);
        pushHistory();
        operation.value = { type: 'boolean', resultId: entity.id, targetId: entity.operands[0], toolId: entity.operands[1], before,
            keepTarget: !!document.value.entities.find((item) => item.id === entity.operands![0])?.visible,
            keepTool: !!document.value.entities.find((item) => item.id === entity.operands![1])?.visible, existing: true };
        historyEditId.value = entity.id;
        selectedIds.value = [...entity.operands];
        viewport?.setBooleanRoles({ target: entity.operands[0], tool: entity.operands[1] });
    }
}
function selectFromItems(id: string, additive: boolean) {
    if (document.value.planes.some((plane) => plane.id === id)) { selectPlane(id); return; }
    if (sketchMode.value && document.value.entities.some((item) => item.id === id && item.kind === 'sketch')) { selectSketchEntity(id); return; }
    selectEntity(id, additive);
    selectionKind.value = additive ? 'mixed' : 'body';
    activePanel.value = null;
    parameterCardOpen.value = true;
    if (additive) return;
    const entity = document.value.entities.find((item) => item.id === id);
    if (entity?.kind === 'sketch') { selectionKind.value = 'sketch'; setTool('select'); }
    else if (entity && entity.kind !== 'boolean') setTool('translate');
}
function onGeometrySelect(id: string, type: 'face' | 'edge', normal: Vec3, point: Vec3, additive = false) {
    const picked = document.value.entities.find((item) => item.id === id);
    if (operation.value?.type === 'extrude' && picked && picked.kind !== 'sketch' && picked.id !== operation.value.bodyId) {
        operation.value.targetId = id;
        if (operation.value.result === 'new') operation.value.result = 'union';
        return;
    }
    lastFace.value = { bodyId: id, normal, point };
    selectEntity(id, additive);
    selectionKind.value = additive ? 'mixed' : picked?.kind === 'sketch' ? 'sketch' : type;
    activePanel.value = null;
    parameterCardOpen.value = true;
    if (additive) { setTool('select'); return; }
    const entity = picked;
    if (entity?.kind === 'sketch') {
        if (!entityProfileClosed(entity)) startSketch(true);
        else setTool('select');
    } else if (type === 'edge') setTool('fillet');
    else setTool('offsetFace');
}
function onBodySelect(id: string) {
    selectEntity(id);
    if (document.value.entities.find((item) => item.id === id)?.kind === 'sketch') {
        selectionKind.value = 'sketch';
        startSketch(true);
        return;
    }
    selectionKind.value = 'body';
    activePanel.value = null;
    parameterCardOpen.value = true;
    setTool('translate');
}
function edgeLimitFor(item: ModelEntity) {
    if (item.kind === 'box') return Math.min(item.width!, item.height!, item.depth!) * 0.48;
    if (item.kind === 'cylinder') return Math.min(item.radius!, item.height! / 2) * 0.48;
    if (item.kind === 'extrude') return item.depth! * 0.24;
    return 0;
}
function clearEdge() {
    if (!selected.value) return;
    pushHistory();
    selected.value.edge = null;
}
function updateFaceOffsetInput(value: number | null) {
    const item = selected.value;
    if (!item || value === null || !lastFace.value) return;
    pushHistory();
    if (value <= 0) item.faceOffset = null;
    else {
        const rotation = new THREE.Euler(...item.rotation.map(THREE.MathUtils.degToRad) as Vec3);
        const normal = new THREE.Vector3(...lastFace.value.normal).applyQuaternion(new THREE.Quaternion().setFromEuler(rotation).invert()).normalize().toArray() as Vec3;
        item.faceOffset = { normal, distance: Math.max(faceOffsetMinimum(item, normal), value) };
    }
}
function faceOffsetMinimum(item: ModelEntity, normal: Vec3) {
    if (item.kind === 'box') {
        const axis = Math.abs(normal[0]) > 0.5 ? 0 : Math.abs(normal[1]) > 0.5 ? 1 : 2;
        return -[item.width!, item.height!, item.depth!][axis] + 0.1;
    }
    if (item.kind === 'cylinder') return -item.height! + 0.1;
    if (item.kind === 'extrude') return -item.depth! + 0.1;
    if (item.kind === 'boolean') {
        const geometry = buildEntityMesh(item, document.value).geometry;
        geometry.computeBoundingBox();
        const axis = Math.abs(normal[0]) > 0.5 ? 0 : Math.abs(normal[1]) > 0.5 ? 1 : 2;
        return -geometry.boundingBox!.getSize(new THREE.Vector3()).getComponent(axis) + 0.1;
    }
    return 0;
}

function onDirectEdit(id: string, normal: Vec3, delta: number, phase: EditPhase) {
    if (activeTool.value === 'extrude') {
        if (phase === 'start') directBase = extrudeBody.value ? cloneEntity(extrudeBody.value) : null;
        else if (phase === 'move' && directBase && operation.value?.type === 'extrude') operation.value.bodyIds.forEach((id) => {
            const body = document.value.entities.find((item) => item.id === id);
            if (body) body.depth = Math.round(Math.max(0.1, (directBase!.depth || 10) + delta) * 10000) / 10000;
        });
        else directBase = null;
        return;
    }
    const item = document.value.entities.find((entity) => entity.id === id);
    if (!item) return;
    const edgeTool = activeTool.value === 'fillet' || activeTool.value === 'chamfer';
    if (phase ==='start') {
        if (edgeTool && !['box', 'cylinder', 'extrude'].includes(item.kind)) return message.warning('该实体暂不支持边处理');
        if (!edgeTool && !['box', 'cylinder', 'extrude', 'boolean'].includes(item.kind)) return message.warning('该面暂不支持向外拉伸');
        if (!edgeTool && item.kind === 'cylinder' && Math.abs(normal[1]) < 0.5) return message.warning('圆柱侧面暂不支持向外拉伸');
        if (!edgeTool && item.kind === 'extrude') {
            const plane = document.value.planes.find((entry) => entry.id === item.planeId);
            if (plane && Math.abs(new THREE.Vector3(...normal).dot(new THREE.Vector3(...plane.normal))) < 0.9) return message.warning('请选择拉伸体的顶面或底面');
        }
        directBase = cloneEntity(item);
        directHistoryPushed = false;
        return;
    }
    if (phase === 'end') {
        directBase = null;
        return;
    }
    if (!directBase) return;
    if (!directHistoryPushed) {
        pushHistory();
        if (edgeTool) item.edge = { type: activeTool.value as 'fillet' | 'chamfer', size: item.edge?.size || 3, segments: item.edge?.segments || 6 };
        directHistoryPushed = true;
    }
    if (edgeTool) {
        const size = Math.round(THREE.MathUtils.clamp((directBase.edge?.size || 3) + delta, 0.1, edgeLimitFor(directBase)) * 10000) / 10000;
        item.edge = { ...directBase.edge!, size };
        return;
    }
    const next = (directBase.faceOffset?.distance || 0) + delta;
    item.faceOffset = { normal: [...normal], distance: Math.round(Math.max(faceOffsetMinimum(directBase, normal), next) * 100) / 100 };
}

function startSketch(editProfile = false) {
    if (sketchMode.value) return;
    if (!canDraw.value && !editProfile) return;
    const editing = editProfile && selected.value?.kind === 'extrude' ? document.value.entities.find((item) => item.id === selected.value!.profileId) : selected.value?.kind === 'sketch' ? selected.value : document.value.entities.filter((item) => item.kind === 'sketch' && item.planeId === activePlaneId.value).at(-1);
    if (!editing && selected.value && lastFace.value?.bodyId === selected.value.id && activeTool.value === 'offsetFace') {
        const normal = new THREE.Vector3(...lastFace.value.normal).normalize();
        const reference = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const u = reference.clone().cross(normal).normalize();
        const v = normal.clone().cross(u).normalize();
        const plane: SketchPlane = { id: uid(), name: `实体面平面 ${document.value.planes.length + 1}`, kind: 'XY', origin: lastFace.value.point,
            normal: normal.toArray(), u: u.toArray(), v: v.toArray(), visible: true };
        pushHistory();
        document.value.planes.push(plane);
        activePlaneId.value = plane.id;
        viewport?.setActivePlane(plane);
    }
    editingSketchId.value = editing?.id || null;
    if (editing?.planeId) activePlaneId.value = editing.planeId;
    if (!activePlaneId.value && !editing) activePlaneId.value = document.value.planes[0].id;
    sketchPoints.value = editing?.points ? cloneEntity(editing).points! : [];
    sketchDepth.value = editing?.depth || 10;
    sketchType.value = editing?.profileType || 'polygon';
    sketchCurves.value = editing?.curves ? JSON.parse(JSON.stringify(editing.curves)) : {};
    sketchSides.value = editing?.sides || 3;
    sketchSectorAngle.value = editing?.sectorAngle || 360;
    sketchOpen.value = editing ? !!editing.open : ['polygon', 'arc'].includes(sketchType.value);
    sketchProfileStartAngle.value = editing?.profileStartAngle;
    sketchAppendMode.value = !editing || editing.profileType === 'polygon';
    sketchSelectionTool.value = document.value.entities.some((item) => item.kind === 'sketch' && item.planeId === activePlaneId.value);
    selectedSketchSegment.value = -1;
    selectedSketchSegments.value = [];
    selectedSketchPoint.value = -1;
    sketchLockedPoints.value = editing?.lockedPoints ? [...editing.lockedPoints] : [];
    if (!editing) selectedIds.value = [];
    setTool('select');
    sketchMode.value = true;
    viewport?.setSketchEditing(editing?.id || null);
    viewport?.setSketchMode(true, sketchPoints.value);
    viewport?.setSketchSelectionTool(sketchSelectionTool.value);
    refreshSketch();
    viewport?.normalToSketch();
}
function persistSketchProgress(resetAfter: boolean) {
    const ready = ['circle', 'regular'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : ['polygon', 'line'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : sketchPoints.value.length >= 3;
    if (!ready) return;
    let id = editingSketchId.value;
    if (!id) {
        pushHistory();
        const entity = createEntity('sketch', uid());
        entity.name = uniqueName('sketch');
        entity.planeId = activePlaneId.value!;
        entity.position = [0, 0, 0];
        delete entity.depth;
        document.value.entities.push(entity);
        id = entity.id;
        editingSketchId.value = id;
    }
    const entity = document.value.entities.find((item) => item.id === id);
    if (entity) {
        entity.points = sketchPoints.value.map((point) => [...point]);
        entity.profileType = sketchType.value;
        entity.curves = JSON.parse(JSON.stringify(sketchCurves.value));
        entity.lockedPoints = [...sketchLockedPoints.value];
        entity.sides = sketchSides.value;
        entity.sectorAngle = sketchSectorAngle.value;
        entity.open = sketchOpen.value;
        entity.profileStartAngle = sketchProfileStartAngle.value;
        entity.visible = true;
    }
    if (resetAfter) {
        selectedIds.value = [id!];
        sketchAppendMode.value = sketchType.value === 'polygon';
        viewport?.setSketchEditing(id!);
        refreshSketch();
        activateSketchSelectionTool();
    }
}
function refreshSketch() {
    if (transforming) {
        if (sketchRefreshFrame) return;
        sketchRefreshFrame = requestAnimationFrame(() => {
            sketchRefreshFrame = 0;
            renderSketch();
        });
        return;
    }
    if (sketchRefreshFrame) cancelAnimationFrame(sketchRefreshFrame);
    sketchRefreshFrame = 0;
    renderSketch();
}
function renderSketch() {
    viewport?.setSketchEditing(editingSketchId.value);
    viewport?.updateSketch(sketchPoints.value, selectedSketchPoint.value, sketchType.value, sketchCurves.value, sketchSides.value, selectedSketchSegment.value, sketchLockedPoints.value, sketchSectorAngle.value, lengthUnit.value, sketchOpen.value, sketchProfileStartAngle.value);
}
function setSketchType(type: ProfileType) {
    sketchSelectionTool.value = false;
    viewport?.setSketchSelectionTool(false);
    sketchType.value = type;
    editingSketchId.value = null;
    if (activePlaneId.value) selectedIds.value = [activePlaneId.value];
    sketchPoints.value = [];
    sketchCurves.value = {};
    sketchLockedPoints.value = [];
    sketchSectorAngle.value = 360;
    sketchOpen.value = ['polygon', 'arc'].includes(type);
    sketchProfileStartAngle.value = undefined;
    sketchAppendMode.value = true;
    viewport?.setSketchEditing(null);
    selectedSketchSegments.value = [];
    selectedSketchPoint.value = -1;
    selectedSketchSegment.value = -1;
    refreshSketch();
}
function activateSketchSelectionTool() {
    sketchSelectionTool.value = true;
    sketchAppendMode.value = false;
    viewport?.setSketchSelectionTool(true);
}
function clearSketchSelection() {
    finishSketchHandleDrag();
    editingSketchId.value = null;
    sketchPoints.value = [];
    sketchCurves.value = {};
    sketchLockedPoints.value = [];
    sketchSectorAngle.value = 360;
    sketchOpen.value = false;
    sketchProfileStartAngle.value = undefined;
    sketchAppendMode.value = false;
    selectedSketchPoint.value = -1;
    selectedSketchSegment.value = -1;
    selectedSketchSegments.value = [];
    selectedIds.value = activePlaneId.value ? [activePlaneId.value] : [];
    sketchContextMenu.value = null;
    viewport?.setSketchEditing(null);
    refreshSketch();
    activateSketchSelectionTool();
}
function selectSketchEntity(id: string) {
    const entity = document.value.entities.find((item) => item.id === id && item.kind === 'sketch');
    if (!entity) return;
    if (entity.planeId && entity.planeId !== activePlaneId.value) {
        activePlaneId.value = entity.planeId;
        viewport?.setActivePlane(activePlane.value);
    }
    editingSketchId.value = id;
    sketchPoints.value = cloneEntity(entity).points || [];
    sketchType.value = entity.profileType || 'polygon';
    sketchCurves.value = JSON.parse(JSON.stringify(entity.curves || {}));
    sketchSides.value = entity.sides || 3;
    sketchSectorAngle.value = entity.sectorAngle || 360;
    sketchOpen.value = !!entity.open;
    sketchProfileStartAngle.value = entity.profileStartAngle;
    sketchLockedPoints.value = [...(entity.lockedPoints || [])];
    sketchAppendMode.value = sketchType.value === 'polygon';
    selectedSketchPoint.value = -1;
    selectedSketchSegment.value = -1;
    selectedSketchSegments.value = [];
    selectedIds.value = [id];
    sketchContextMenu.value = null;
    viewport?.setSketchEditing(id);
    refreshSketch();
}
function openSketchContext(id: string | null, x: number, y: number) {
    if (id && id !== editingSketchId.value) selectSketchEntity(id);
    const targetId = id || editingSketchId.value;
    if (!targetId) return clearSketchSelection();
    sketchContextMenu.value = { id: targetId, x: Math.min(x, window.innerWidth - 160), y: Math.min(y, window.innerHeight - 110) };
}
function deleteSketchFromContext() {
    const id = sketchContextMenu.value?.id;
    if (!id) return;
    const dependent = document.value.entities.find((item) => item.profileId === id);
    if (dependent) {
        sketchContextMenu.value = null;
        return message.warning(`请先删除引用此草图的「${dependent.name}」`);
    }
    pushHistory();
    document.value.entities = document.value.entities.filter((item) => item.id !== id);
    clearSketchSelection();
}
function deleteViewportSketch() {
    const id = viewportMenu.value?.id;
    viewportMenu.value = null;
    if (!id) return;
    sketchContextMenu.value = { id, x: 0, y: 0 };
    deleteSketchFromContext();
}
function addSketchPoint(point: Point2) {
    if (sketchSelectionTool.value) return;
    if (sketchType.value === 'polygon' && !sketchAppendMode.value) return;
    if (editingSketchId.value && !['polygon', 'arc'].includes(sketchType.value)) return;
    if (sketchType.value === 'circle' && sketchPoints.value.length >= 2) return;
    if (sketchType.value === 'arc' && sketchPoints.value.length >= 3) return;
    if (sketchType.value === 'ellipse' && sketchPoints.value.length >= 3) return;
    if (sketchType.value === 'regular' && sketchPoints.value.length >= 2) return;
    if (sketchType.value === 'rectangle' && sketchPoints.value.length >= 2) return;
    const previous = sketchPoints.value[sketchPoints.value.length - 1];
    if (previous && Math.hypot(previous[0] - point[0], previous[1] - point[1]) < 0.01) return;
    if (sketchType.value === 'rectangle' && sketchPoints.value.length === 1) {
        const first = sketchPoints.value[0];
        sketchPoints.value = [first, [point[0], first[1]], point, [first[0], point[1]]];
    } else sketchPoints.value.push(point);
    syncEditingSketch();
    refreshSketch();
    if (sketchType.value === 'polygon' || sketchType.value === 'arc') persistSketchProgress(false);
    else persistSketchProgress(true);
}
function moveSketchPoint(index: number, point: Point2, phase: EditPhase) {
    if (sketchLockedPoints.value.includes(index)) {
        if (phase === 'start') message.info('该点已锁定，请先在 Constraints 中解锁');
        return;
    }
    if (phase === 'start') {
        beginSketchHandleDrag();
        return;
    }
    if (!sketchPoints.value[index]) return;
    const previous = sketchPoints.value[index];
    const delta: Point2 = [point[0] - previous[0], point[1] - previous[1]];
    const straightCurveSegments = new Set<number>();
    Object.entries(sketchCurves.value).forEach(([key, curve]) => {
        const segment = Number(key);
        const a = sketchPoints.value[segment], b = sketchPoints.value[(segment + 1) % sketchPoints.value.length];
        if (!a || !b) return;
        const straight = [curve.c1, curve.c2].every((control) => Math.abs((b[0] - a[0]) * (control[1] - a[1]) - (b[1] - a[1]) * (control[0] - a[0])) < 0.0001);
        if (straight) straightCurveSegments.add(segment);
    });
    if (sketchType.value === 'ellipse' && (index === 1 || index === 2)) {
        const center = sketchPoints.value[0], first = sketchPoints.value[1], second = sketchPoints.value[2];
        const sign = Math.sign((first[0] - center[0]) * (second[1] - center[1]) - (first[1] - center[1]) * (second[0] - center[0])) || 1;
        const other = index === 1 ? second : first;
        const otherLength = Math.hypot(other[0] - center[0], other[1] - center[1]);
        const previousAngle = Math.atan2(previous[1] - center[1], previous[0] - center[0]);
        const angle = Math.atan2(point[1] - center[1], point[0] - center[0]);
        const rotationDelta = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
        if (sketchProfileStartAngle.value !== undefined) sketchProfileStartAngle.value += rotationDelta;
        sketchPoints.value[index] = point;
        const otherAngle = (index === 1 ? angle + sign * Math.PI / 2 : angle - sign * Math.PI / 2);
        const otherIndex = index === 1 ? 2 : 1;
        sketchPoints.value[otherIndex] = [center[0] + Math.cos(otherAngle) * otherLength, center[1] + Math.sin(otherAngle) * otherLength];
    } else if (sketchType.value === 'rectangle' && sketchPoints.value.length === 4) {
        const opposite = sketchPoints.value[(index + 2) % 4];
        sketchPoints.value = [point, [opposite[0], point[1]], opposite, [point[0], opposite[1]]];
        if (index === 1) sketchPoints.value = [[opposite[0], point[1]], point, [point[0], opposite[1]], opposite];
        else if (index === 2) sketchPoints.value = [opposite, [point[0], opposite[1]], point, [opposite[0], point[1]]];
        else if (index === 3) sketchPoints.value = [[point[0], opposite[1]], opposite, [opposite[0], point[1]], point];
    } else if (index === 0 && ['circle', 'ellipse', 'regular'].includes(sketchType.value)) {
        sketchPoints.value = sketchPoints.value.map((source) => [source[0] + delta[0], source[1] + delta[1]]);
    } else sketchPoints.value[index] = point;
    const previousSegment = index === 0 && profileClosed(sketchType.value) && !sketchOpen.value ? sketchPoints.value.length - 1 : index - 1;
    Object.entries(sketchCurves.value).forEach(([key, curve]) => {
        const segment = Number(key);
        if (segment === index) curve.c1 = [curve.c1[0] + delta[0], curve.c1[1] + delta[1]];
        if (segment === previousSegment) curve.c2 = [curve.c2[0] + delta[0], curve.c2[1] + delta[1]];
    });
    [index, previousSegment].forEach((segment) => {
        if (!straightCurveSegments.has(segment)) return;
        const a = sketchPoints.value[segment], b = sketchPoints.value[(segment + 1) % sketchPoints.value.length];
        const curve = sketchCurves.value[segment];
        curve.c1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
        curve.c2 = [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3];
    });
    if (phase === 'end' || !transforming) {
        syncEditingSketch();
        if (sketchPoints.value.length >= 3) persistSketchProgress(false);
    }
    refreshSketch();
    if (phase === 'end') finishSketchHandleDrag();
}
function beginSketchHandleDrag() {
    if (!editingSketchId.value) return;
    pushHistory();
    transforming = true;
}
function finishSketchHandleDrag() {
    if (!transforming) return;
    transforming = false;
}
function moveSketchCenter(point: Point2, phase: EditPhase) {
    if (phase === 'start') {
        if (sketchLockedPoints.value.length) {
            sketchCenterDrag = null;
            message.info('形状包含固定点，请先取消固定再整体移动');
            return;
        }
        beginSketchHandleDrag();
        sketchCenterDrag = { start: [...point], points: sketchPoints.value.map((source) => [...source]), curves: JSON.parse(JSON.stringify(sketchCurves.value)) };
        return;
    }
    if (!sketchCenterDrag) return;
    const delta: Point2 = [point[0] - sketchCenterDrag.start[0], point[1] - sketchCenterDrag.start[1]];
    sketchPoints.value = sketchCenterDrag.points.map((source) => [source[0] + delta[0], source[1] + delta[1]]);
    const curves = JSON.parse(JSON.stringify(sketchCenterDrag.curves)) as ProfileCurves;
    Object.values(curves).forEach((curve) => {
        curve.c1 = [curve.c1[0] + delta[0], curve.c1[1] + delta[1]];
        curve.c2 = [curve.c2[0] + delta[0], curve.c2[1] + delta[1]];
    });
    sketchCurves.value = curves;
    if (phase === 'end' || !transforming) {
        syncEditingSketch();
        if (sketchPoints.value.length >= 3) persistSketchProgress(false);
    }
    refreshSketch();
    if (phase === 'end') {
        sketchCenterDrag = null;
        finishSketchHandleDrag();
    }
}
function deleteSketchPoint(index: number) {
    if (sketchType.value !== 'polygon' || !sketchPoints.value[index]) return;
    if (sketchPoints.value.length <= 2) return message.warning('线条至少保留两个点');
    if (editingSketchId.value) pushHistory();
    sketchPoints.value.splice(index, 1);
    const curves: ProfileCurves = {};
    Object.entries(sketchCurves.value).forEach(([key, curve]) => {
        const segment = Number(key);
        if (segment === index || segment === index - 1) return;
        curves[segment > index ? segment - 1 : segment] = curve;
    });
    sketchCurves.value = curves;
    sketchLockedPoints.value = sketchLockedPoints.value.filter((point) => point !== index).map((point) => point > index ? point - 1 : point);
    selectedSketchPoint.value = -1;
    selectedSketchSegment.value = -1;
    selectedSketchSegments.value = [];
    syncEditingSketch();
    if (sketchPoints.value.length >= 3) persistSketchProgress(false);
    refreshSketch();
}
function deleteSketchBorder(entityId: string, index: number, start: number, end: number) {
    const entity = document.value.entities.find((item) => item.id === entityId && item.kind === 'sketch');
    if (!entity) return;
    const dependent = document.value.entities.find((item) => item.profileId === entityId);
    if (dependent) return message.warning(`请先删除引用此草图的「${dependent.name}」`);
    const type = entity.profileType || 'polygon';
    pushHistory();
    if (type === 'circle' || type === 'ellipse') {
        if (start <= 0 && end >= 1) document.value.entities = document.value.entities.filter((item) => item.id !== entityId);
        else {
            const center = entity.points![0], edge = entity.points![1];
            const startAngle = entity.profileStartAngle ?? (type === 'ellipse' ? 0 : Math.atan2(edge[1] - center[1], edge[0] - center[0]));
            const travel = (entity.sectorAngle ?? 360) * Math.PI / 180;
            entity.profileStartAngle = startAngle + end * travel;
            entity.sectorAngle = Math.max(0.01, (1 - (end - start)) * (entity.sectorAngle ?? 360));
            entity.open = true;
        }
        if (entity.planeId) recloseProfiles(entity.planeId);
        clearSketchSelection();
        return;
    }
    const remaining: ModelEntity[] = [];
    const makeOpen = (points: Point2[], curve?: { c1: Point2; c2: Point2 }, arc = false) => {
        if (points.length < 2) return;
        const next = createEntity('sketch', uid());
        next.name = `${ENTITY_NAMES.sketch} ${document.value.entities.filter((item) => item.kind === 'sketch').length + remaining.length + 1}`;
        next.parentId = entity.parentId;
        next.planeId = entity.planeId;
        next.position = [0, 0, 0];
        next.open = true;
        next.profileType = arc ? 'arc' : 'polygon';
        next.points = points.map((point) => [...point]);
        next.curves = curve ? { 0: curve } : {};
        delete next.depth;
        remaining.push(next);
    };
    borderSegments(entity).forEach((segment) => {
        const ranges = segment.index === index ? [[0, start], [end, 1]] : [[0, 1]];
        ranges.forEach(([from, to]) => {
            if (to - from < 0.00001) return;
            const samples = sliceBorder(segment, from, to);
            if (type === 'arc') return makeOpen([samples[0], samples[Math.floor(samples.length / 2)], samples[samples.length - 1]], undefined, true);
            const source = entity.points || [];
            const a = source[segment.index], b = source[(segment.index + 1) % source.length];
            const curve = segment.sourceCount === 1 ? entity.curves?.[segment.index] : undefined;
            if (!a || !b) return makeOpen(samples);
            if (!curve) return makeOpen(samples);
            if (from === 0 && to === 1) return makeOpen([a, b], { c1: [...curve.c1], c2: [...curve.c2] });
            if (from === 0) {
                const part = splitCubic(a, curve.c1, curve.c2, b, to).left;
                return makeOpen([part.a, part.b], { c1: part.c1, c2: part.c2 });
            }
            const part = splitCubic(a, curve.c1, curve.c2, b, from).right;
            return makeOpen([part.a, part.b], { c1: part.c1, c2: part.c2 });
        });
    });
    document.value.entities = document.value.entities.filter((item) => item.id !== entityId);
    document.value.entities.push(...remaining);
    if (entity.planeId) recloseProfiles(entity.planeId);
    clearSketchSelection();
}
function recloseProfiles(planeId: string) {
    const candidates = document.value.entities.filter((item) => item.kind === 'sketch' && item.planeId === planeId
        && (item.open || ['polygon', 'rectangle', 'regular', 'line'].includes(item.profileType || 'polygon'))
        && !document.value.entities.some((entity) => entity.profileId === item.id));
    if (!candidates.length) return;
    const edges: RestitchEdge[] = candidates.flatMap((entity) => borderSegments(entity).map((segment) => ({
        a: segment.points[0], b: segment.points[segment.points.length - 1], points: segment.points.map((point) => [...point] as Point2),
        c1: segment.sourceCount === 1 ? entity.curves?.[segment.index]?.c1 : undefined,
        c2: segment.sourceCount === 1 ? entity.curves?.[segment.index]?.c2 : undefined,
    })));
    const rebuilt = restitchSketchEdges(edges).map((path, index) => {
        const entity = createEntity('sketch', uid());
        entity.name = `${ENTITY_NAMES.sketch} ${document.value.entities.length + index + 1}`;
        entity.planeId = planeId;
        entity.position = [0, 0, 0];
        entity.profileType = 'polygon';
        entity.open = !path.closed;
        entity.points = path.points;
        entity.curves = path.curves;
        delete entity.depth;
        return entity;
    });
    document.value.entities = document.value.entities.filter((item) => !candidates.includes(item));
    document.value.entities.push(...rebuilt);
}
function ensureSketchSegment(index: number) {
    if (index < 0 || index >= sketchPoints.value.length) return;
    selectedSketchSegment.value = index;
    if (!sketchCurves.value[index]) {
        const a = sketchPoints.value[index], b = sketchPoints.value[(index + 1) % sketchPoints.value.length];
        sketchCurves.value[index] = { c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], c2: [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3] };
    }
}
function selectSketchSegment(index: number, additive = false) {
    ensureSketchSegment(index);
    selectedSketchSegments.value = additive
        ? selectedSketchSegments.value.includes(index) ? selectedSketchSegments.value.filter((item) => item !== index) : [...selectedSketchSegments.value, index]
        : [index];
    persistSketchProgress(false);
    selectedSketchPoint.value = -1;
    syncEditingSketch();
    refreshSketch();
}
function moveSketchHandle(segment: number, handle: 1 | 2, point: Point2, phase: EditPhase) {
    if (phase === 'start') {
        beginSketchHandleDrag();
        return;
    }
    ensureSketchSegment(segment);
    sketchCurves.value[segment][handle === 1 ? 'c1' : 'c2'] = point;
    if (phase === 'end' || !transforming) {
        persistSketchProgress(false);
        syncEditingSketch();
    }
    refreshSketch();
    if (phase === 'end') finishSketchHandleDrag();
}
function resetSketchHandle(segment: number, handle: 1 | 2) {
    const a = sketchPoints.value[segment], b = sketchPoints.value[(segment + 1) % sketchPoints.value.length];
    if (!a || !b) return;
    if (editingSketchId.value) pushHistory();
    ensureSketchSegment(segment);
    const fraction = handle === 1 ? 1 / 3 : 2 / 3;
    sketchCurves.value[segment][handle === 1 ? 'c1' : 'c2'] = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    syncEditingSketch();
    persistSketchProgress(false);
    refreshSketch();
}
function selectSketchPoint(index: number) {
    selectedSketchPoint.value = index;
    selectedSketchSegment.value = -1;
    selectedSketchSegments.value = [];
    viewport?.setSketchSelection(index);
    refreshSketch();
}
function dragSketch(start: Point2, point: Point2, phase: EditPhase) {
    if (sketchSelectionTool.value) return;
    if (editingSketchId.value) return;
    if (phase === 'start') return;
    if (sketchType.value === 'rectangle') sketchPoints.value = [start, [point[0], start[1]], point, [start[0], point[1]]];
    else if (sketchType.value === 'ellipse') sketchPoints.value = [start, [point[0], start[1]], [start[0], point[1]]];
    else sketchPoints.value = [start, point];
    syncEditingSketch();
    refreshSketch();
    if (phase === 'end' && sketchType.value !== 'polygon') persistSketchProgress(true);
}
function setSketchSides(sides: number) {
    sketchSides.value = sides;
    syncEditingSketch();
    refreshSketch();
}
function updateSketchCoordinate(axis: 0 | 1, value: number | null) {
    const index = selectedSketchPoint.value;
    if (value === null || !sketchPoints.value[index]) return;
    if (editingSketchId.value) pushHistory();
    sketchPoints.value[index][axis] = Math.round(value * 10) / 10;
    syncEditingSketch();
    refreshSketch();
}
function syncEditingSketch() {
    if (!editingSketchId.value) return;
    const item = document.value.entities.find((entity) => entity.id === editingSketchId.value);
    if (item) { item.points = sketchPoints.value.map((point) => [...point]); item.profileType = sketchType.value; item.curves = JSON.parse(JSON.stringify(sketchCurves.value)); item.sides = sketchSides.value; item.lockedPoints = [...sketchLockedPoints.value]; item.sectorAngle = sketchSectorAngle.value; item.open = sketchOpen.value; item.profileStartAngle = sketchProfileStartAngle.value; }
}
function applySketchConstraint(type: SketchConstraintType) {
    const result = solveSketchConstraints(sketchPoints.value, sketchCurves.value, selectedSketchSegments.value, sketchLockedPoints.value, type, profileClosed(sketchType.value) && !sketchOpen.value);
    if (!result) return message.warning('当前点或边无法同时满足该约束，草图未修改');
    if (!result.changed) return;
    if (editingSketchId.value) pushHistory();
    sketchPoints.value = result.points;
    sketchCurves.value = result.curves;
    syncEditingSketch();
    persistSketchProgress(false);
    refreshSketch();
}
function toggleSketchPointLock() {
    const indices = selectedSketchPoint.value >= 0
        ? [selectedSketchPoint.value]
        : [...new Set(selectedSketchSegments.value.flatMap((index) => [index, (index + 1) % sketchPoints.value.length]))];
    if (!indices.length) return;
    if (editingSketchId.value) pushHistory();
    const locked = indices.every((index) => sketchLockedPoints.value.includes(index));
    sketchLockedPoints.value = locked
        ? sketchLockedPoints.value.filter((index) => !indices.includes(index))
        : [...new Set([...sketchLockedPoints.value, ...indices])];
    syncEditingSketch();
    persistSketchProgress(false);
    refreshSketch();
}
function updateSketchDepth(value: number | null) {
    if (value === null) return;
    if (editingSketchId.value) pushHistory();
    sketchDepth.value = Math.max(0.1, value);
    const item = document.value.entities.find((entity) => entity.id === editingSketchId.value);
    if (item) item.depth = sketchDepth.value;
}
function onSketchSectorMove(point: Point2, phase: EditPhase) {
    if (phase === 'start') {
        beginSketchHandleDrag();
        return;
    }
    const center = sketchPoints.value[0], radiusPoint = sketchPoints.value[1];
    if (!center || !radiusPoint) return;
    const start = sketchProfileStartAngle.value ?? (sketchType.value === 'ellipse' ? 0 : Math.atan2(radiusPoint[1] - center[1], radiusPoint[0] - center[0]));
    const current = sketchType.value === 'ellipse' && sketchPoints.value[2] ? profileEllipseAngle(center, radiusPoint, sketchPoints.value[2], point) : Math.atan2(point[1] - center[1], point[0] - center[0]);
    const degrees = ((current - start) * 180 / Math.PI + 360) % 360;
    const quarter = Math.round(degrees / 90) * 90;
    const quarterDistance = Math.min(Math.abs(degrees - quarter), 360 - Math.abs(degrees - quarter));
    const snapped = quarterDistance <= INTERACTION.sectorQuarterSnapThresholdDeg ? quarter : Math.round(degrees);
    sketchSectorAngle.value = snapped % 360 === 0 ? 360 : Math.max(1, snapped);
    if (phase === 'end' || !transforming) syncEditingSketch();
    refreshSketch();
    if (phase === 'end') finishSketchHandleDrag();
}
function resetSketchSector() {
    if (editingSketchId.value) pushHistory();
    sketchSectorAngle.value = 360;
    sketchOpen.value = false;
    sketchProfileStartAngle.value = undefined;
    syncEditingSketch();
    refreshSketch();
}
function onSketchDimension(target: SketchDimension, value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    if (editingSketchId.value) pushHistory();
    const points = sketchPoints.value;
    const setRadius = (center: Point2, edge: Point2, radius: number) => {
        const angle = Math.atan2(edge[1] - center[1], edge[0] - center[0]);
        return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius] as Point2;
    };
    if (target.kind === 'angle') sketchSectorAngle.value = Math.min(360, value);
    else if (target.kind === 'segment' && target.index !== undefined) {
        const a = points[target.index], b = points[(target.index + 1) % points.length];
        if (a && b) points[(target.index + 1) % points.length] = setRadius(a, b, value);
    } else if ((target.kind === 'width' || target.kind === 'height') && points.length === 4) {
        const axis = target.kind === 'width' ? 0 : 1;
        const center = (points[0][axis] + points[2][axis]) / 2;
        points.forEach((point) => point[axis] = center + (point[axis] < center ? -value / 2 : value / 2));
    } else if (target.kind === 'radius' && points[0] && points[1]) points[1] = setRadius(points[0], points[1], value);
    else if (target.kind === 'regularRadius' && points[0] && points[1]) points[1] = setRadius(points[0], points[1], value);
    else if (target.kind === 'radiusX' && points[0] && points[1]) points[1] = setRadius(points[0], points[1], value);
    else if (target.kind === 'radiusY' && points[0] && points[2]) points[2] = setRadius(points[0], points[2], value);
    else if (target.kind === 'control' && target.index !== undefined && target.handle) {
        const curve = sketchCurves.value[target.index];
        const anchor = target.handle === 1 ? points[target.index] : points[(target.index + 1) % points.length];
        const key = target.handle === 1 ? 'c1' : 'c2';
        if (curve && anchor) curve[key] = setRadius(anchor, curve[key], value);
    } else if (target.kind === 'arcRadius') {
        const center = profileArcCenter(points);
        if (center) points.forEach((point, index) => points[index] = setRadius(center, point, value));
    }
    syncEditingSketch();
    persistSketchProgress(false);
    refreshSketch();
}
function finishSketch() {
    if (!sketchMode.value) return;
    const points = [...sketchPoints.value];
    if (sketchType.value === 'polygon' && points.length > 1 && Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 0.01) points.pop();
    const ready = ['circle', 'regular'].includes(sketchType.value) ? points.length >= 2 : ['polygon', 'line'].includes(sketchType.value) ? points.length >= 2 : points.length >= 3;
    if (!ready) return message.warning('当前草图工具的定义点不足');
    if (['polygon', 'line'].includes(sketchType.value)) sketchOpen.value = points.length < 3;
    if (sketchType.value === 'arc') sketchOpen.value = true;
    let id = editingSketchId.value;
    const existing = document.value.entities.find((entity) => entity.id === id);
    if (existing) {
        existing.points = points;
        existing.profileType = sketchType.value;
        existing.lockedPoints = [...sketchLockedPoints.value];
        existing.sectorAngle = sketchSectorAngle.value;
        existing.open = sketchOpen.value;
        existing.profileStartAngle = sketchProfileStartAngle.value;
        if (existing.kind === 'extrude') existing.depth = sketchDepth.value;
    } else {
        pushHistory();
        const entity = createEntity('sketch', uid());
        entity.name = uniqueName('sketch');
        entity.points = points;
        entity.profileType = sketchType.value;
        entity.sides = sketchSides.value;
        entity.lockedPoints = [...sketchLockedPoints.value];
        entity.sectorAngle = sketchSectorAngle.value;
        entity.open = sketchOpen.value;
        entity.profileStartAngle = sketchProfileStartAngle.value;
        entity.planeId = activePlaneId.value!;
        entity.position = [0, 0, 0];
        delete entity.depth;
        document.value.entities.push(entity);
        id = entity.id;
    }
    if (existing) existing.curves = JSON.parse(JSON.stringify(sketchCurves.value));
    else document.value.entities[document.value.entities.length - 1].curves = JSON.parse(JSON.stringify(sketchCurves.value));
    cancelSketch();
    selectedIds.value = [id!];
    viewport?.fitSelection();
}
function closeSketch() {
    sketchClosed.value ? finishSketch() : cancelSketch();
}
function cancelSketch() {
    finishSketchHandleDrag();
    selectedIds.value = [];
    selectionKind.value = null;
    lastFace.value = null;
    viewport?.clearGeometrySelection();
    sketchMode.value = false;
    sketchContextMenu.value = null;
    viewport?.setSketchEditing(null);
    sketchPoints.value = [];
    selectedSketchPoint.value = -1;
    selectedSketchSegment.value = -1;
    selectedSketchSegments.value = [];
    sketchLockedPoints.value = [];
    sketchCurves.value = {};
    editingSketchId.value = null;
    viewport?.setSketchMode(false);
}

function createFolder() {
    pushHistory();
    const folder = { id: uid(), name: `文件夹 ${document.value.folders.length + 1}`, parentId: null, visible: true };
    document.value.folders.push(folder);
    selectedIds.value = [folder.id];
}
function openNodeContext(node: OutlinerNode, event: MouseEvent) {
    if (!selectedIds.value.includes(node.id)) selectedIds.value = [node.id];
    contextMenu.value = { node, x: Math.min(event.clientX, window.innerWidth - 150), y: Math.min(event.clientY, window.innerHeight - 100) };
}
function requestRename(node: OutlinerNode) {
    renameTarget.value = node;
    renameValue.value = node.name;
    showRename.value = true;
    contextMenu.value = null;
}
function applyRename() {
    const target = renameTarget.value;
    const name = renameValue.value.trim();
    if (!target || !name) return;
    pushHistory();
    const collection = target.kind === 'folder' ? document.value.folders : document.value.entities;
    const item = collection.find((entry) => entry.id === target.id);
    if (item) item.name = name;
    showRename.value = false;
}
function deleteContextNodes() {
    const menu = contextMenu.value;
    if (!menu) return;
    const ids = selectedIds.value.includes(menu.node.id) ? [...selectedIds.value] : [menu.node.id];
    contextMenu.value = null;
    deleteNodeIds(ids);
}
function reparentNodes(ids: string[], targetId: string | null) {
    // A node may contain folders or entities, but dragging into its own descendant is rejected.
    const nodes = new Map<string, { parentId: string | null }>();
    document.value.folders.forEach((item) => nodes.set(item.id, item));
    document.value.entities.forEach((item) => nodes.set(item.id, item));
    let cursor = targetId;
    while (cursor) {
        if (ids.includes(cursor)) return message.warning('不能移动到节点自身或其子节点下');
        cursor = nodes.get(cursor)?.parentId || null;
    }
    const valid = ids.filter((id) => id !== targetId && nodes.has(id));
    if (!valid.length) return;
    pushHistory();
    valid.forEach((id) => nodes.get(id)!.parentId = targetId);
}
function createPlane(kind: SketchPlane['kind'] = 'XZ', referenceSelectedPlane = false) {
    const referencePlane = referenceSelectedPlane && selectionKind.value === 'plane' ? activePlane.value : null;
    const useFace = selectionKind.value === 'face' && !!selected.value && lastFace.value?.bodyId === selected.value.id;
    const normal = referencePlane ? new THREE.Vector3(...referencePlane.normal) : useFace ? new THREE.Vector3(...lastFace.value!.normal).normalize() : new THREE.Vector3(kind === 'YZ' ? 1 : 0, kind === 'XZ' ? 1 : 0, kind === 'XY' ? 1 : 0);
    const reference = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = referencePlane ? new THREE.Vector3(...referencePlane.u) : useFace ? reference.clone().cross(normal).normalize() : kind === 'YZ' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const v = referencePlane ? new THREE.Vector3(...referencePlane.v) : useFace ? normal.clone().cross(u).normalize() : kind === 'XZ' ? new THREE.Vector3(0, 0, -1) : kind === 'YZ' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const origin = referencePlane ? [...referencePlane.origin] as Vec3 : useFace ? lastFace.value!.point : [0, 0, 0] as Vec3;
    const plane: SketchPlane = {
        id: uid(), name: useFace ? `面平面 ${document.value.planes.length + 1}` : `${referencePlane?.kind || kind} 平面 ${document.value.planes.length + 1}`,
        kind: referencePlane?.kind || (useFace ? 'XY' : kind), origin, normal: normal.toArray(), u: u.toArray(), v: v.toArray(), visible: true,
    };
    pushHistory();
    document.value.planes.push(plane);
    activePlaneId.value = plane.id;
    selectedIds.value = [plane.id];
    selectionKind.value = 'plane';
    viewport?.setActivePlane(plane);
    setTool('select');
    activePanel.value = null;
}
function constructPlane() { createPlane('XZ', true); }
function createPlaneAndSketch(kind: SketchPlane['kind']) { createPlane(kind); beginSketch(activePlaneId.value!); }
function selectPlane(id: string) {
    activePlaneId.value = id;
    selectedIds.value = [id];
    selectionKind.value = 'plane';
    activePanel.value = null;
    viewport?.setActivePlane(activePlane.value);
    setTool('select');
}
function activateTreeNode(id: string) {
    if (document.value.planes.some((plane) => plane.id === id)) beginSketch(id);
}
function toggleNodeVisibility(id: string) {
    pushHistory();
    const setEntity = (entity: ModelEntity, visible: boolean) => entity.visible = visible;
    const folder = document.value.folders.find((item) => item.id === id);
    if (folder) {
        const visible = !folder.visible;
        const apply = (parentId: string, value: boolean) => {
            document.value.entities.filter((item) => item.parentId === parentId).forEach((item) => setEntity(item, value));
            document.value.folders.filter((item) => item.parentId === parentId).forEach((item) => { item.visible = value; apply(item.id, value); });
        };
        folder.visible = visible;
        apply(id, visible);
        return;
    }
    const plane = document.value.planes.find((item) => item.id === id);
    if (plane) {
        plane.visible = !plane.visible;
        if (!plane.visible && activePlaneId.value === plane.id && sketchMode.value) cancelSketch();
        return;
    }
    const entity = document.value.entities.find((item) => item.id === id);
    if (entity) entity.visible = !entity.visible;
}
function changeActivePlane(id: string) {
    activePlaneId.value = id;
    viewport?.setActivePlane(activePlane.value);
    refreshSketch();
}
function toggleMeasure() {
    if (measureMode.value) {
        measureMode.value = false;
        viewport?.setMeasureMode(false);
    } else {
        setTool('select');
        measureMode.value = true;
        viewport?.setMeasureMode(true);
    }
}
function preventContextMenu(event: Event) { event.preventDefault(); }
function preventBrowserZoom(event: WheelEvent) { if (event.ctrlKey || event.metaKey) event.preventDefault(); }
function preventGesture(event: Event) { event.preventDefault(); }

async function runExport(type: 'stl' | 'glb') {
    if (!document.value.entities.some((item) => item.visible)) return message.warning('没有可导出的可见实体');
    exporting.value = true;
    await flushSave();
    try {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (type === 'stl') exportSTL(document.value, project.value.name, exportQuality.value);
        else await exportGLB(document.value, project.value.name, exportQuality.value);
        message.success(`${type.toUpperCase()} 已导出`);
    } catch (error) {
        message.error(`导出失败：${(error as Error).message}`);
    } finally { exporting.value = false; }
}
function onExportAction(type: 'stl' | 'glb' | 'project') {
    if (type === 'project') exportProject(document.value, project.value.name);
    else runExport(type);
}
function importProject() { importInput.value?.click(); }
async function onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        if (!isDocument(data)) throw new Error('不是有效的 Form 3D 项目文件');
        const next = createProject(file.name.replace(/\.model\.json$|\.json$/g, '') || '导入项目');
        next.document = normalizeDocument(cloneDocument(data));
        await putProject(next);
        await reloadProjects();
        await openProject(next.id);
        message.success('项目已导入');
    } catch (error) { message.error((error as Error).message); }
}
function entityIcon(kind: ModelEntity['kind']) {
    if (kind === 'boolean') return AnalyticsOutline;
    if (kind === 'extrude') return LayersOutline;
    if (kind === 'cylinder') return ShapesOutline;
    if (kind === 'sphere') return EllipseOutline;
    return CubeOutline;
}
function fitView() { viewport?.fit(true); }
function toggleProjection() { projectionMode.value = viewport?.toggleProjection() || 'perspective'; }
function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
    if ((event.metaKey || event.ctrlKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(event.code)) { event.preventDefault(); return; }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') { event.preventDefault(); flushSave(); return; }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (event.metaKey || event.ctrlKey || event.code === 'Space') return;
    if (event.code === 'Enter' && operation.value) doneOperation();
    else if (event.code === 'Enter' && sketchMode.value) finishSketch();
    else if (event.code === 'Escape') {
        if (operation.value) cancelOperation();
        else if (sketchMode.value) clearSketchSelection();
        else if (activeTool.value !== 'select') setTool('select');
        else { activePanel.value = null; selectEntity(null); }
    }
    else if (event.code === 'Delete' || event.code === 'Backspace') removeSelected();
    else if (event.code === 'KeyV') setTool('select');
    else if (event.code === 'KeyG') setTool('translate');
    else if (event.code === 'KeyR') setTool('rotate');
    else if (event.code === 'KeyS' && selectionKind.value !== 'plane') setTool('scale');
    else if (event.code === 'KeyE' && operation.value?.type === 'extrude' && extrudeBody.value) updateExtrude('sideMode', extrudeBody.value.sideMode === 'one' ? 'symmetric' : 'one');
    else if (event.code === 'KeyE' && selected.value?.kind === 'sketch') startExtrude(selected.value.id);
    else if (event.code === 'KeyF' && selectionKind.value === 'edge') chooseTool('fillet');
    else if (event.code === 'KeyF') viewport?.fit();
}

watch(document, () => {
    if (!transforming) viewport?.sync(document.value);
    scheduleSave();
}, { deep: true });
watch(selectedIds, (ids) => viewport?.setSelected(ids), { deep: true });
watch(() => project.value.name, scheduleSave);
watch(gridVisible, (value) => viewport?.setGridVisible(value));
watch(shadowVisible, (value) => viewport?.setShadowsVisible(value));
watch(showEdges, (value) => viewport?.setDisplayMode(displayMode.value, value));
watch(() => [sketchMode.value, activePlaneId.value] as const, ([active]) => {
    if (!active) return;
    nextTick(() => {
        const list = window.document.querySelector<HTMLElement>('.object-list');
        const row = activePlaneId.value ? list?.querySelector<HTMLElement>(`[data-node-id="${activePlaneId.value}"]`) : null;
        if (list && row) list.scrollTo({ top: Math.max(0, row.offsetTop - list.offsetTop), behavior: 'smooth' });
    });
}, { flush: 'post' });

onMounted(async () => {
    viewport = new Viewport(viewportElement.value!, {
        onSelect: selectEntity,
        onGeometrySelect,
        onBodySelect,
        onPlaneSelect: selectPlane,
        onPlaneTransform: (id, position, quaternion) => {
            const plane = document.value.planes.find((item) => item.id === id);
            if (!plane) return;
            if (!transforming) { pushHistory(); transforming = true; }
            plane.origin = position;
            plane.u = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).toArray();
            plane.v = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).toArray();
            plane.normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).toArray();
        },
        onTransform: (id, position, rotation, scale) => {
            const item = document.value.entities.find((entity) => entity.id === id);
            if (!item) return;
            if (!transforming) { pushHistory(); transforming = true; }
            item.position = position;
            item.rotation = rotation;
            item.scale = scale;
        },
        onTransformEnd: () => {
            if (!transforming) return;
            transforming = false;
            viewport.sync(document.value);
        },
        onDirectEdit,
        onSketchPoint: addSketchPoint,
        onSketchPointMove: moveSketchPoint,
        onSketchSegment: selectSketchSegment,
        onSketchHandleMove: moveSketchHandle,
        onSketchHandleReset: resetSketchHandle,
        onSketchDrag: dragSketch,
        onSketchSelect: selectSketchPoint,
        onSketchComplete: finishSketch,
        onSketchEntitySelect: selectSketchEntity,
        onSketchContext: openSketchContext,
        onSketchCancelSelection: clearSketchSelection,
        onSketchCenterMove: moveSketchCenter,
        onSketchPointDelete: deleteSketchPoint,
        onSketchBorderDelete: deleteSketchBorder,
        onSketchSectorMove,
        onSketchSectorReset: resetSketchSector,
        onSketchDimension,
        onLengthUnitChange: setLengthUnit,
        onExtrudeGesture,
        onBlankCommit,
        onExtrudeDimension: () => {
            parameterCardOpen.value = true;
            nextTick(() => window.document.querySelector<HTMLInputElement>('.extrude-distance-input input, .direct-distance-input input')?.focus());
        },
        onMarqueeSelect,
        onHoverSketch,
        onViewportContext: openViewportMenu,
        onSpaceChange: (active) => {
            spaceActive.value = active;
            if (active && transforming) {
                finishSketchHandleDrag();
                viewport?.sync(document.value);
            }
        },
        onMeasureChange: (active) => measureMode.value = active,
        onScale: (value) => scaleBar.value = value,
        onStats: (value) => stats.value = value,
    });
    viewport.sync(document.value);
    viewport.setLengthUnit(lengthUnit.value);
    window.addEventListener('keydown', onKeyDown);
    window.document.addEventListener('contextmenu', preventContextMenu);
    window.document.addEventListener('wheel', preventBrowserZoom, { passive: false });
    window.document.addEventListener('gesturestart', preventGesture);
    window.document.addEventListener('gesturechange', preventGesture);
    window.addEventListener('beforeunload', flushSave);
    try {
        await reloadProjects();
        const active = getActiveProjectId();
        const initial = projects.value.find((item) => item.id === active) || projects.value[0];
        if (initial) await openProject(initial.id, false);
        else {
            await flushSave();
            await reloadProjects();
            setActiveProjectId(project.value.id);
        }
        await nextTick();
        viewport.fit();
    } catch (error) { message.error(`无法打开本地项目库：${(error as Error).message}`); }
});
onBeforeUnmount(() => {
    clearTimeout(saveTimer);
    cancelAnimationFrame(sketchRefreshFrame);
    flushSave();
    window.removeEventListener('keydown', onKeyDown);
    window.document.removeEventListener('contextmenu', preventContextMenu);
    window.document.removeEventListener('wheel', preventBrowserZoom);
    window.document.removeEventListener('gesturestart', preventGesture);
    window.document.removeEventListener('gesturechange', preventGesture);
    window.removeEventListener('beforeunload', flushSave);
    viewport?.dispose();
});
</script>

<template>
    <div class="studio-shell" @click="contextMenu = null; viewportMenu = null; sketchContextMenu = null">
        <AppTopBar :project-name="project.name" :saving="saveState === 'saving'" :can-undo="canUndo" :can-redo="canRedo" :exporting="exporting" :export-quality="exportQuality"
            @name="project.name = $event" @undo="undo" @redo="redo" @help="showHelp = true" @quality="exportQuality = $event" @export="onExportAction" />

        <div class="workspace">
            <EntitySidebar :visible="itemsVisible" :projects="projects" :project-id="project.id" :nodes="treeNodes" :selected-ids="selectedIds" :entity-count="visibleEntityCount"
                @open="openProject" @create="showNewProject = true" @duplicate="duplicateProject" @import="importProject" @remove="removeProject" @folder="createFolder"
                @select="selectFromItems" @activate="activateTreeNode" @context="openNodeContext" @drop="reparentNodes" @toggle="toggleNodeVisibility" />

            <main class="viewport-area" :class="{ 'drawing-active': sketchMode }">
                <div ref="viewportElement" class="viewport"></div>
                <ModelingToolbar :active-panel="activePanel" :active-tool="activeTool" :sketch-mode="sketchMode" :section-active="sectionActive" :isolate-active="isolateActive"
                    :measure-mode="measureMode" :items-visible="itemsVisible" :selection-kind="selectionKind" :can-isolate="isolateActive || selectedIds.length > 0" :history-steps="historySteps"
                    @panel="togglePanel" @sketch="beginSketch()" @construct="constructPlane" @tool="chooseTool" @section="toggleSection" @isolate="toggleIsolate"
                    @measure="toggleMeasure" @items="itemsVisible = !itemsVisible" @history="editHistory" />

                <aside v-if="activePanel && activePanel !== 'sketch' && !sketchMode" class="tool-panel">
                    <div class="tool-panel-title"><strong>{{ ({ search: '搜索', insert: '插入', construct: '构造', tools: '工具', display: '显示' } as Record<string, string>)[activePanel] }}</strong><button @click="activePanel = null"><NIcon><CloseOutline /></NIcon></button></div>
                    <template v-if="activePanel === 'search'">
                        <NInput v-model:value="commandSearch" autofocus size="small" placeholder="搜索命令" />
                        <div class="command-results"><button v-for="command in commandResults" :key="command.id" @click="runCommand(command.id)"><strong>{{ command.label }}</strong><span>{{ command.hint }}</span></button><div v-if="!commandResults.length" class="history-empty">没有匹配的命令</div></div>
                    </template>
                    <template v-else-if="activePanel === 'insert'">
                        <div class="panel-section-label">基础实体</div>
                        <MenuCommand title="立方体" subtitle="插入参数化立方体" @click="createPrimitive('box')"><NIcon><CubeOutline /></NIcon></MenuCommand>
                        <MenuCommand title="圆柱体" subtitle="插入参数化圆柱体" @click="createPrimitive('cylinder')"><NIcon><ShapesOutline /></NIcon></MenuCommand>
                        <MenuCommand title="球体" subtitle="插入参数化球体" @click="createPrimitive('sphere')"><NIcon><EllipseOutline /></NIcon></MenuCommand>
                        <div class="panel-section-label">项目</div>
                        <MenuCommand title="文件" subtitle="导入项目 JSON" @click="importProject"><NIcon><FolderOpenOutline /></NIcon></MenuCommand>
                    </template>
                    <template v-else-if="activePanel === 'construct'">
                        <p class="panel-note">选择实体平面后可创建贴合该面的构造平面；也可以直接添加基准面。</p>
                        <button class="menu-command" @click="createPlane('XZ')"><NIcon><GridOutline /></NIcon><span><strong>XZ 平面</strong><small>水平基准面</small></span></button>
                        <button class="menu-command" @click="createPlane('XY')"><NIcon><GridOutline /></NIcon><span><strong>XY 平面</strong><small>正视基准面</small></span></button>
                        <button class="menu-command" @click="createPlane('YZ')"><NIcon><GridOutline /></NIcon><span><strong>YZ 平面</strong><small>侧视基准面</small></span></button>
                    </template>
                    <template v-else-if="activePanel === 'tools'">
                        <button class="menu-command" :disabled="!selectedSketches.length" @click="message.info('请拖动视图中的上下粗箭头进行拉伸')"><NIcon><ArrowUpOutline /></NIcon><span><strong>拉伸</strong><small>选择封闭轮廓后拖动双向粗箭头</small></span></button>
                        <button class="menu-command" :disabled="selectionKind !== 'face'" @click="chooseTool('offsetFace')"><NIcon><MoveOutline /></NIcon><span><strong>偏移面</strong><small>沿面法向推拉实体</small></span></button>
                        <button class="menu-command" :disabled="selectionKind !== 'edge'" @click="chooseTool('chamfer')"><NIcon><CutOutline /></NIcon><span><strong>倒角</strong><small>处理所选实体边</small></span></button>
                        <button class="menu-command" :disabled="selectionKind !== 'edge'" @click="chooseTool('fillet')"><NIcon><EllipseOutline /></NIcon><span><strong>圆角</strong><small>圆角半径可拖动或精确输入</small></span></button>
                        <div class="panel-section-label">布尔运算 · 选择两个实体</div>
                        <div class="inline-command-row"><button :disabled="!canBoolean" @click="applyBoolean('union')">并集</button><button :disabled="!canBoolean" @click="applyBoolean('subtract')">差集</button><button :disabled="!canBoolean" @click="applyBoolean('intersect')">交集</button></div>
                    </template>
                    <template v-else-if="activePanel === 'display'">
                        <div class="display-mode-grid"><button :class="{ active: displayMode === 'shaded' }" @click="updateDisplayMode('shaded')">实体着色</button><button :class="{ active: displayMode === 'wireframe' }" @click="updateDisplayMode('wireframe')">线框</button><button :class="{ active: displayMode === 'xray' }" @click="updateDisplayMode('xray')">透视</button></div>
                        <NCheckbox :checked="showEdges" size="small" @update:checked="showEdges = $event">显示边线</NCheckbox>
                        <NCheckbox v-model:checked="shadowVisible" size="small">地面投影</NCheckbox>
                        <NCheckbox v-model:checked="gridVisible" size="small">网格</NCheckbox>
                    </template>
                </aside>

                <aside v-if="!activePanel && selectedIds.length && !sketchMode && !operation" class="tool-panel adaptive-panel">
                    <div class="tool-panel-title"><div><small>自适应工具</small><strong>{{ selectedSketches.length === selectedEntities.length ? '封闭草图轮廓' : selectionKind === 'edge' ? '边' : selectionKind === 'face' ? '面' : selectionKind === 'plane' ? '构造平面' : selectedEntities.length > 1 ? `${selectedEntities.length} 个实体` : '实体' }}</strong></div><button @click="selectEntity(null)"><NIcon><CloseOutline /></NIcon></button></div>
                    <template v-if="selectedSketches.length === selectedEntities.length"><p class="panel-note">已选择 {{ selectedSketches.length }} 个封闭轮廓。拖动视图中的上下粗箭头生成实体，草图底面保持在原平面。</p></template>
                    <template v-else-if="selectedEntities.length > 1"><div class="inline-command-row vertical"><button @click="applyBoolean('union')">并集</button><button @click="applyBoolean('subtract')">差集</button><button @click="applyBoolean('intersect')">交集</button></div></template>
                    <template v-else-if="selectionKind === 'plane'"><button class="menu-command" @click="beginSketch()"><SvgIcon name="pencil" /><span><strong>草图</strong><small>在所选平面上绘制</small></span></button><button class="menu-command" @click="chooseTool('translate')"><NIcon><MoveOutline /></NIcon><span><strong>移动 / 旋转</strong></span></button></template>
                    <template v-else-if="selectionKind === 'face'"><button class="menu-command" :class="{ active: activeTool === 'offsetFace' }" @click="chooseTool('offsetFace')"><NIcon><MoveOutline /></NIcon><span><strong>偏移面</strong><small>拖动模型面或输入尺寸</small></span></button><button class="menu-command" @click="beginSketch()"><SvgIcon name="pencil" /><span><strong>草图</strong><small>在此平面上新建草图</small></span></button></template>
                    <template v-else-if="selectionKind === 'edge'"><button class="menu-command" :class="{ active: activeTool === 'fillet' }" @click="chooseTool('fillet')"><NIcon><EllipseOutline /></NIcon><span><strong>圆角</strong><small>圆角 · F</small></span></button><button class="menu-command" :class="{ active: activeTool === 'chamfer' }" @click="chooseTool('chamfer')"><NIcon><CutOutline /></NIcon><span><strong>倒角</strong><small>倒角</small></span></button></template>
                    <template v-else><button class="menu-command" :class="{ active: activeTool === 'translate' }" @click="chooseTool('translate')"><NIcon><MoveOutline /></NIcon><span><strong>移动 / 旋转</strong><small>移动整个实体</small></span></button><button class="menu-command" :class="{ active: activeTool === 'rotate' }" @click="chooseTool('rotate')"><NIcon><RepeatOutline /></NIcon><span><strong>旋转</strong></span></button><button class="menu-command" :class="{ active: activeTool === 'scale' }" @click="chooseTool('scale')"><NIcon><ResizeOutline /></NIcon><span><strong>缩放</strong></span></button></template>
                    <button class="more-tools" @click="togglePanel('tools')">更多工具 <span>›</span></button>
                </aside>

                <SketchToolbar :sketch-mode="sketchMode" :active-panel="activePanel" :selection-tool="sketchSelectionTool" :sketch-type="sketchType" :sides="sketchSides"
                    :planes="document.planes" :selection-kind="selectionKind" @close="sketchMode ? closeSketch() : activePanel = null" @select="activateSketchSelectionTool"
                    @type="setSketchType" @sides="setSketchSides" @plane="beginSketch" @construct="createPlaneAndSketch" @face="beginSketch()" />
                <SketchConstraints v-if="sketchMode" :segment-count="constraintSegmentCount" :selected-point="selectedSketchPoint" :selection-locked="selectionLocked" :edge-selected="selectedSketchSegments.length > 0"
                    @constraint="applySketchConstraint" @lock="toggleSketchPointLock" />

                <div class="viewport-caption"><span v-if="sectionActive" class="mode-badge">剖视</span><span v-if="isolateActive" class="mode-badge">隔离</span><span class="axis-dot"></span>{{ lengthUnit }}</div>

                <section v-if="contextVisible" class="context-panel">
                    <button class="parameter-close" title="收起参数卡，不退出工具" @click="parameterCardOpen = false"><NIcon><ChevronDownOutline /></NIcon></button>
                    <template v-if="operation?.type === 'extrude' && extrudeBody">
                        <div class="context-title"><strong>拉伸</strong><span>{{ historyEditId ? '历史记录编辑' : '拖动画布箭头或输入距离' }}</span></div>
                        <div class="context-fields operation-fields">
                            <label>距离<IntegerInputNumber class="extrude-distance-input" :precision="4" :value="displayLength(extrudeBody.depth)" :min="displayLength(0.1)" size="small" @update:value="updateExtrudeLength" /></label>
                            <label>方向<NSelect :value="extrudeBody.direction" size="small" :options="[{ label: '正向', value: 1 }, { label: '反向', value: -1 }]" @update:value="updateExtrude('direction', $event)" /></label>
                            <label>侧面<NSelect :value="extrudeBody.sideMode" size="small" :options="[{ label: '单侧', value: 'one' }, { label: '对称', value: 'symmetric' }]" @update:value="updateExtrude('sideMode', $event)" /></label>
                            <label>拔模°<IntegerInputNumber :precision="4" :value="extrudeBody.draftAngle || 0" :min="-45" :max="45" size="small" @update:value="updateExtrude('draftAngle', $event)" /></label>
                            <label>结果<NSelect :value="operation.result" size="small" :options="[{ label: '新实体', value: 'new' }, { label: '并集', value: 'union' }, { label: '差集', value: 'subtract' }, { label: '交集', value: 'intersect' }]" @update:value="updateExtrudeResult" /></label>
                            <NSelect v-if="operation.result !== 'new'" :value="operation.targetId" :options="operationTargets" placeholder="目标实体" size="small" @update:value="operation.targetId = $event" />
                            <NButton size="small" type="primary" @click="doneOperation">完成</NButton><NButton size="small" quaternary @click="cancelOperation">取消</NButton>
                        </div>
                    </template>
                    <template v-else-if="operation?.type === 'boolean' && booleanDraft">
                        <div class="context-title"><strong>布尔运算</strong><span>紫色目标 / 蓝色工具</span></div>
                        <div class="context-fields operation-fields">
                            <NSelect :value="document.entities.find(item => item.id === booleanDraft.resultId)?.operation" size="small" :options="[{ label: '并集', value: 'union' }, { label: '差集', value: 'subtract' }, { label: '交集', value: 'intersect' }]" @update:value="document.entities.find(item => item.id === booleanDraft.resultId)!.operation = $event" />
                            <NButton size="small" secondary @click="swapBooleanRoles">交换 目标 / 工具</NButton>
                            <NCheckbox v-model:checked="booleanDraft.keepTarget" size="small">保留目标</NCheckbox>
                            <NCheckbox v-model:checked="booleanDraft.keepTool" size="small">保留工具</NCheckbox>
                            <NButton size="small" type="primary" @click="doneOperation">完成</NButton><NButton size="small" quaternary @click="cancelOperation">取消</NButton>
                        </div>
                    </template>
                    <template v-else-if="sketchMode">
                        <div class="context-title"><NIcon><CreateOutline /></NIcon><strong>{{ editingSketchId ? '编辑草图' : '绘制草图' }}</strong><span>单击添加点，拖动顶点调整</span></div>
                        <div class="context-fields">
                            <NSelect v-if="!editingSketchId" :value="activePlaneId" :options="planeOptions" size="small" class="plane-select" @update:value="changeActivePlane" />
                            <label>厚度<IntegerInputNumber :precision="4" :value="displayLength(sketchDepth)" :min="displayLength(0.1)" size="small" @update:value="updateSketchDepth(inputLength($event))" /></label>
                            <template v-if="selectedSketchPoint >= 0 && sketchPoints[selectedSketchPoint]">
                                <label>X<IntegerInputNumber :precision="4" :value="sketchPoints[selectedSketchPoint][0]" size="small" :show-button="false" @update:value="updateSketchCoordinate(0, $event)" /></label>
                                <label>Z<IntegerInputNumber :precision="4" :value="sketchPoints[selectedSketchPoint][1]" size="small" :show-button="false" @update:value="updateSketchCoordinate(1, $event)" /></label>
                            </template>
                            <NButton size="small" secondary @click="viewport?.normalToSketch()">正视草图</NButton>
                            <NButton size="small" type="primary" :disabled="!sketchClosed" @click="finishSketch">退出草图</NButton>
                            <button class="context-close" @click="cancelSketch"><NIcon><CloseOutline /></NIcon></button>
                        </div>
                    </template>
                    <template v-else-if="selectedEntities.length > 1">
                        <div class="context-title"><strong>{{ selectedEntities.length }} 个实体</strong><span>按选择顺序执行布尔运算</span></div>
                        <div class="context-fields"><NButton size="small" secondary @click="applyBoolean('union')">并集</NButton><NButton size="small" secondary @click="applyBoolean('subtract')">差集</NButton><NButton size="small" secondary @click="applyBoolean('intersect')">交集</NButton></div>
                    </template>
                    <template v-else-if="selected">
                        <div class="context-title"><input :value="selected.name" @change="updateEntity('name', ($event.target as HTMLInputElement).value)" /><span v-if="activeTool === 'offsetFace'">拖动箭头或输入厚度</span><span v-else-if="activeTool === 'fillet' || activeTool === 'chamfer'">在模型上拖动调整距离</span><span v-else>{{ ENTITY_NAMES[selected.kind] }}</span></div>
                        <div v-if="activeVector" class="context-fields vector-fields">
                            <label v-for="axis in ['X', 'Y', 'Z']" :key="axis">{{ axis }}<IntegerInputNumber :precision="4" :value="activeVector.key === 'position' ? displayLength(activeVector.value[['X','Y','Z'].indexOf(axis)]) : activeVector.value[['X','Y','Z'].indexOf(axis)]" size="small" :show-button="false" :step="activeVector.step" :min="activeVector.key === 'scale' ? 0.01 : undefined" @update:value="updateVector(activeVector.key, ['X','Y','Z'].indexOf(axis), $event)" /></label>
                        </div>
                        <div v-else-if="activeTool === 'offsetFace'" class="context-fields">
                            <label>面偏移<IntegerInputNumber class="direct-distance-input" :precision="2" :value="displayLength(selected.faceOffset?.distance || 0)" size="small" @update:value="updateFaceOffsetInput(inputLength($event))" /></label>
                            <button class="text-button" @click="updateFaceOffsetInput(0)">清除面拉伸</button>
                        </div>
                        <div v-else-if="activeTool === 'fillet' || activeTool === 'chamfer'" class="context-fields">
                            <label>距离<IntegerInputNumber class="direct-distance-input" :precision="2" :value="displayLength(selected.edge?.size || 0)" :min="0" :max="selected ? displayLength(edgeLimitFor(selected)) : 0" size="small" @update:value="updateEdgeSize" /></label>
                            <button class="text-button" @click="clearEdge">清除边处理</button>
                        </div>
                        <div v-else class="context-fields">
                            <label v-for="field in dimensionFields" :key="field.key">{{ field.label }}<IntegerInputNumber :precision="4" :value="displayLength(field.value)" :min="displayLength(0.1)" size="small" :show-button="false" @update:value="updateLengthEntity(field.key, $event)" /></label>
                            <label v-if="selected.kind === 'extrude'" class="context-action"><NButton size="small" secondary @click="startSketch(true)">编辑轮廓</NButton></label>
                            <input class="context-color" type="color" :value="selected.color" title="实体颜色" @input="updateEntity('color', ($event.target as HTMLInputElement).value)" />
                        </div>
                    </template>
                    <template v-else>
                        <div class="context-title"><strong>{{ activeTool === 'offsetFace' ? '推拉' : activeTool === 'fillet' ? '圆角' : '倒角' }}</strong><span>在画布中按住模型并拖动</span></div>
                    </template>
                </section>

                <div class="viewport-utilities">
                    <div class="measure-actions">
                        <NTooltip><template #trigger><button :class="{ active: measureMode }" @click.stop="toggleMeasure"><SvgIcon name="ruler" /></button></template>测量</NTooltip>
                        <NTooltip><template #trigger><button @click.stop="toggleProjection"><NIcon><component :is="projectionMode === 'perspective' ? CameraOutline : GridOutline" /></NIcon></button></template>{{ projectionMode === 'perspective' ? '切换正交相机' : '切换透视相机' }}</NTooltip>
                        <NTooltip><template #trigger><button @click.stop="fitView"><NIcon><ScanOutline /></NIcon></button></template>适配视图</NTooltip>
                    </div>
                    <div class="scale-indicator"><div class="scale-rule" :style="{ width: `${scaleBar.width}px` }"><i></i><i></i><i></i></div><span>{{ scaleBarLabel }}</span></div>
                </div>
                <div class="viewport-status"><div>{{ stats.objects }} 实体 · {{ stats.triangles.toLocaleString() }} 三角面</div></div>
            </main>
        </div>

        <NModal v-model:show="showNewProject" preset="card" title="新建项目" style="width: 420px" :bordered="false">
            <label class="modal-field">项目名称<NInput v-model:value="newProjectName" autofocus placeholder="未命名项目" @keyup.enter="newProject" /></label>
            <p class="modal-note">新项目为空白项目，所有数据保存在当前浏览器。</p>
            <div class="modal-actions"><NButton @click="showNewProject = false">取消</NButton><NButton type="primary" @click="newProject">创建项目</NButton></div>
        </NModal>
        <div v-if="contextMenu" class="entity-context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
            <button @click="requestRename(contextMenu.node)"><NIcon><PencilOutline /></NIcon>重命名</button>
            <button class="danger" @click="deleteContextNodes"><NIcon><TrashOutline /></NIcon>删除</button>
        </div>
        <div v-if="viewportMenu" class="entity-context-menu viewport-context-menu" :style="{ left: `${viewportMenu.x}px`, top: `${viewportMenu.y}px` }" @click.stop>
            <button :disabled="!selectedIds.length" @click="toggleIsolate(); viewportMenu = null"><NIcon><EyeOutline /></NIcon>{{ isolateActive ? '退出隔离' : '隔离所选对象' }}</button>
            <button :disabled="!selectedIds.length" @click="zoomToSelection"><NIcon><ScanOutline /></NIcon>缩放至所选对象</button>
            <button v-if="selectionKind === 'face'" @click="beginSketch(); viewportMenu = null"><SvgIcon name="pencil" />在此面上绘制</button>
            <button v-if="selectionKind === 'sketch'" class="danger" @click="deleteViewportSketch"><NIcon><TrashOutline /></NIcon>删除草图</button>
        </div>
        <div v-if="sketchContextMenu" class="entity-context-menu" :style="{ left: `${sketchContextMenu.x}px`, top: `${sketchContextMenu.y}px` }" @click.stop>
            <button class="danger" @click="deleteSketchFromContext"><NIcon><TrashOutline /></NIcon>删除草图</button>
            <button @click="clearSketchSelection"><NIcon><CloseOutline /></NIcon>取消选择</button>
        </div>
        <NModal v-model:show="showRename" preset="card" title="重命名" style="width: 380px" :bordered="false">
            <NInput v-model:value="renameValue" autofocus @keyup.enter="applyRename" />
            <div class="modal-actions"><NButton @click="showRename = false">取消</NButton><NButton type="primary" @click="applyRename">确定</NButton></div>
        </NModal>

        <NModal v-model:show="showHelp" preset="card" title="直接建模操作" style="width: 600px" :bordered="false">
            <div class="help-content">
                <section><strong>选择与画布导航</strong><p>左键单击选择，拖拽环绕；Command/Ctrl＋拖拽框选，空格＋拖拽平移。右键环绕，中键平移，滚轮缩放。</p></section>
                <section><strong>草图与约束</strong><p>草图中选择基准面、构造平面或实体平面。完成图形后仍可连续绘制，退出草图才离开编辑。右侧约束区支持线段方向、平行、垂直、等长和点锁定。</p></section>
                <section><strong>自适应建模</strong><p>选择面时推荐偏移面，选择边时推荐倒角或圆角，选择实体时推荐移动/旋转。再次点击当前工具只收起参数卡，不会退出工具；拖动手柄或输入尺寸才修改几何。</p></section>
                <section><strong>检查与历史</strong><p>隔离、剖视图和显示模式 用于检查模型；测量只读数。历史记录可回改草图、拉伸、布尔运算 和已有边处理参数。</p></section>
            </div>
        </NModal>
        <input ref="importInput" type="file" accept=".json,.model.json" hidden @change="onImportFile" />
    </div>
</template>
