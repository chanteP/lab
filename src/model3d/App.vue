<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { NButton, NCheckbox, NIcon, NInput, NInputNumber, NModal, NPopconfirm, NPopover, NSelect, NTooltip, useMessage } from 'naive-ui';
import {
    AddOutline, AnalyticsOutline, ArrowRedoOutline, ArrowUndoOutline, ArrowUpOutline, CameraOutline, CheckmarkOutline,
    ChevronDownOutline, CloseOutline, CloudDoneOutline, CopyOutline, CreateOutline, CubeOutline,
    CutOutline, DocumentOutline, DownloadOutline, EllipseOutline, EyeOffOutline, EyeOutline, FolderOpenOutline,
    GridOutline, HelpCircleOutline, LayersOutline, MoveOutline, RepeatOutline, ResizeOutline,
    ShapesOutline, TrashOutline, NavigateOutline, FolderOutline, PencilOutline, ScanOutline, ScaleOutline,
} from '@vicons/ionicons5';
import { Viewport, type EditPhase, type ViewTool } from './Viewport';
import EntityTree, { type OutlinerNode } from './EntityTree.vue';
import { profileClosed, type ProfileType } from './profiles';
import { buildEntityMesh } from './geometry';
import { exportGLB, exportProject, exportSTL } from './exporters';
import { deleteProject, getActiveProjectId, listProjects, putProject, setActiveProjectId } from './store';
import {
    cloneDocument, createDocument, createEntity, ENTITY_NAMES, isDocument, normalizeDocument,
    type BooleanOperation, type GeometryQuality, type ModelDocument, type ModelEntity, type ProjectRecord, type Point2, type Vec3, type SketchPlane,
} from './types';

const message = useMessage();
const viewportElement = ref<HTMLElement>();
const importInput = ref<HTMLInputElement>();
let viewport: Viewport;
let saveTimer: ReturnType<typeof setTimeout>;
let restoring = false;
let transforming = false;
let directBase: ModelEntity | null = null;
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
const shadowVisible = ref(false);
const spaceActive = ref(false);
const showNewProject = ref(false);
const showHelp = ref(false);
const newProjectName = ref('未命名项目');
const sketchMode = ref(false);
const sketchType = ref<ProfileType>('polygon');
const sketchPoints = ref<Point2[]>([]);
const sketchDepth = ref(10);
const selectedSketchPoint = ref(-1);
const editingSketchId = ref<string | null>(null);
type OperationState = {
    type: 'extrude'; profileId: string; bodyId: string; before: ModelDocument; result: 'new' | BooleanOperation; targetId: string | null; existing: boolean;
} | {
    type: 'boolean'; resultId: string; targetId: string; toolId: string; before: ModelDocument; keepTarget: boolean; keepTool: boolean; existing: boolean;
};
const operation = ref<OperationState | null>(null);
const historyEditId = ref<string | null>(null);
const stats = ref({ vertices: 0, triangles: 0, objects: 0 });
const measureMode = ref(false);
const scaleBar = ref({ width: 76, label: '50 mm' });
const activePlaneId = ref<string | null>(null);
const lastFace = ref<{ bodyId: string; normal: Vec3; point: Vec3 } | null>(null);
const showAddPlane = ref(false);
const planeKind = ref<'XZ' | 'XY' | 'YZ'>('XZ');
const planeOffset = ref(0);
const contextMenu = ref<{ x: number; y: number; node: OutlinerNode } | null>(null);
const showRename = ref(false);
const renameValue = ref('');
const renameTarget = ref<OutlinerNode | null>(null);

const projectOptions = computed(() => projects.value.map((item) => ({ label: item.name, value: item.id })));
const selectedEntities = computed(() => selectedIds.value.map((id) => document.value.entities.find((item) => item.id === id)).filter(Boolean) as ModelEntity[]);
const selected = computed(() => selectedEntities.value.length === 1 ? selectedEntities.value[0] : null);
const canUndo = computed(() => (historyVersion.value, undoStack.length > 0));
const canRedo = computed(() => (historyVersion.value, redoStack.length > 0));
const canBoolean = computed(() => selectedEntities.value.length === 2);
const saveLabel = computed(() => saveState.value === 'saved' ? '已保存到本机' : saveState.value === 'saving' ? '保存中…' : '有未保存更改');
const sketchClosed = computed(() => sketchType.value === 'circle' ? sketchPoints.value.length >= 2 : sketchPoints.value.length >= 3);
const uiState = computed(() => sketchMode.value ? 'Sketch' : historyEditId.value ? 'HistoryEdit' : operation.value ? 'ToolActive' : selectedIds.value.length ? 'SelectionAdaptive' : 'Default');
const extrudeBody = computed(() => operation.value?.type === 'extrude' ? document.value.entities.find((item) => item.id === operation.value!.bodyId) : null);
const booleanDraft = computed(() => operation.value?.type === 'boolean' ? operation.value : null);
const operationTargets = computed(() => document.value.entities.filter((item) => !['sketch', 'folder'].includes(item.kind) && item.id !== extrudeBody.value?.id).map((item) => ({ label: item.name, value: item.id })));
const historySteps = computed(() => document.value.entities.filter((item) => ['sketch', 'extrude', 'boolean'].includes(item.kind)).map((item) => ({ id: item.id, name: item.name, kind: item.kind })).reverse());
const activePlane = computed(() => document.value.planes.find((plane) => plane.id === activePlaneId.value) || null);
const planeOptions = computed(() => document.value.planes.map((plane) => ({ label: plane.name, value: plane.id })));
const contextVisible = computed(() => sketchMode.value || !!selected.value || selectedEntities.value.length > 1 || ['offsetFace', 'fillet', 'chamfer'].includes(activeTool.value));
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
    if (activeTool.value === 'translate') return { key: 'position' as const, label: '位置', value: selected.value.position, step: 1 };
    if (activeTool.value === 'rotate') return { key: 'rotation' as const, label: '旋转', value: selected.value.rotation, step: 15 };
    if (activeTool.value === 'scale') return { key: 'scale' as const, label: '缩放', value: selected.value.scale, step: 0.1 };
    return null;
});

const treeNodes = computed(() => {
    // Folders and entities share one parent graph, so either can contain nested nodes.
    const build = (parentId: string | null, trail: string[] = []): OutlinerNode[] => {
        const folders = document.value.folders.filter((item) => item.parentId === parentId).map((folder) => ({ folder, order: 0 }));
        const entities = document.value.entities.filter((item) => item.parentId === parentId).map((entity) => ({ entity, order: 1 }));
        return [...folders, ...entities].flatMap((entry: any) => {
            const item = entry.folder || entry.entity;
            if (trail.includes(item.id)) return [];
            return [{
                id: item.id, kind: entry.folder ? 'folder' : 'entity', name: item.name, visible: item.visible,
                children: build(item.id, [...trail, item.id]),
            } as OutlinerNode];
        });
    };
    return build(null);
});

function uid() { return crypto.randomUUID(); }
function createProject(name: string): ProjectRecord {
    const now = Date.now();
    return { id: uid(), name, createdAt: now, updatedAt: now, document: createDocument() };
}
function cloneEntity(entity: ModelEntity) { return JSON.parse(JSON.stringify(entity)) as ModelEntity; }
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
    cancelSketch();
    restoring = true;
    project.value = next;
    document.value = normalizeDocument(cloneDocument(next.document));
    activePlaneId.value = document.value.planes[0]?.id || null;
    selectedIds.value = [];
    undoStack.length = 0;
    redoStack.length = 0;
    historyVersion.value++;
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
function updateVector(key: 'position' | 'rotation' | 'scale', index: number, value: number | null) {
    if (!selected.value || value === null) return;
    pushHistory();
    selected.value[key][index] = key === 'scale' ? Math.max(0.01, value) : value;
}
function removeSelected() {
    const ids = selectedIds.value;
    if (!ids.length) return;
    const referenced = document.value.entities.find((item) => item.kind === 'boolean' && item.operands?.some((id) => ids.includes(id)) && !ids.includes(item.id));
    if (referenced) return message.warning(`请先删除依赖它的「${referenced.name}」`);
    pushHistory();
    ids.forEach((id) => {
        const item = document.value.entities.find((entity) => entity.id === id);
        if (item?.kind === 'boolean') item.operands?.forEach((operandId) => {
            const operand = document.value.entities.find((entity) => entity.id === operandId);
            if (operand) operand.visible = true;
        });
    });
    ids.forEach((id) => {
        document.value.folders.filter((folder) => folder.parentId === id).forEach((folder) => folder.parentId = null);
        document.value.entities.filter((entity) => entity.parentId === id).forEach((entity) => entity.parentId = null);
    });
    document.value.entities = document.value.entities.filter((item) => !ids.includes(item.id));
    document.value.folders = document.value.folders.filter((item) => !ids.includes(item.id));
    selectedIds.value = [];
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
    selectedIds.value = [target.id, tool.id];
    viewport?.setBooleanRoles({ target: target.id, tool: tool.id });
}
function startExtrude(profileId: string, existingBody?: ModelEntity) {
    if (operation.value) return;
    const profile = document.value.entities.find((item) => item.id === profileId && item.kind === 'sketch');
    if (!profile || !profileClosed(profile.profileType || 'polygon')) return;
    const before = cloneDocument(document.value);
    pushHistory();
    let body = existingBody;
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
        document.value.entities.push(body);
    }
    profile.visible = true;
    body.visible = true;
    let targetId: string | null = null;
    let result: 'new' | BooleanOperation = 'new';
    if (!existingBody) {
        const bounds = new THREE.Box3().setFromObject(buildEntityMesh(body, document.value));
        const target = document.value.entities.find((item) => item.visible && item.id !== body!.id && item.kind !== 'sketch' && (() => {
            try { return bounds.intersectsBox(new THREE.Box3().setFromObject(buildEntityMesh(item, document.value))); } catch { return false; }
        })());
        if (target) { targetId = target.id; result = body.direction === -1 ? 'subtract' : 'union'; }
    }
    operation.value = { type: 'extrude', profileId, bodyId: body.id, before, result, targetId, existing: !!existingBody };
    historyEditId.value = existingBody?.id || null;
    selectedIds.value = [profileId];
    activeTool.value = 'extrude';
    viewport?.setTool('extrude');
    viewport?.setView('perspective');
}
function updateExtrude(key: 'depth' | 'direction' | 'sideMode' | 'draftAngle', value: any) {
    if (!extrudeBody.value || value === null) return;
    (extrudeBody.value as any)[key] = value;
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
        const profile = document.value.entities.find((item) => item.id === current.profileId);
        const body = document.value.entities.find((item) => item.id === current.bodyId);
        if (profile) profile.visible = false;
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
    undoStack.pop();
    historyVersion.value++;
    operation.value = null;
    historyEditId.value = null;
    viewport?.setBooleanRoles(null);
    selectedIds.value = document.value.entities.some((item) => item.id === selectedId) ? [selectedId] : [];
    setTool('select');
}
function editHistory(id: string) {
    const entity = document.value.entities.find((item) => item.id === id);
    if (!entity) return;
    if (entity.kind === 'sketch') return startExtrude(id);
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
    selectEntity(id, additive);
    if (additive) return;
    const entity = document.value.entities.find((item) => item.id === id);
    if (entity?.kind === 'sketch') startExtrude(id);
    else if (entity && entity.kind !== 'boolean') setTool('translate');
}
function onGeometrySelect(id: string, type: 'face' | 'edge', normal: Vec3, point: Vec3) {
    lastFace.value = { bodyId: id, normal, point };
    selectEntity(id);
    const entity = document.value.entities.find((item) => item.id === id);
    if (entity?.kind === 'sketch') {
        if (profileClosed(entity.profileType || 'polygon')) startExtrude(id);
        else startSketch();
    } else if (type === 'edge') setTool('fillet');
    else setTool('offsetFace');
}
function onBodySelect(id: string) {
    selectEntity(id);
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

function onDirectEdit(id: string, normal: Vec3, delta: number, phase: EditPhase) {
    if (activeTool.value === 'extrude') {
        if (phase === 'start') directBase = extrudeBody.value ? cloneEntity(extrudeBody.value) : null;
        else if (phase === 'move' && directBase && extrudeBody.value) extrudeBody.value.depth = Math.round(Math.max(0.1, (directBase.depth || 10) + delta) * 10000) / 10000;
        else directBase = null;
        return;
    }
    const item = document.value.entities.find((entity) => entity.id === id);
    if (!item) return;
    const edgeTool = activeTool.value === 'fillet' || activeTool.value === 'chamfer';
    if (phase ==='start') {
        if (edgeTool && !['box', 'cylinder', 'extrude'].includes(item.kind)) return message.warning('该实体暂不支持边处理');
        if (!edgeTool && item.kind === 'boolean') return message.warning('请推拉基础实体的面');
        pushHistory();
        if (edgeTool) item.edge = { type: activeTool.value as 'fillet' | 'chamfer', size: item.edge?.size || 3, segments: item.edge?.segments || 6 };
        directBase = cloneEntity(item);
        return;
    }
    if (phase === 'end') {
        directBase = null;
        return;
    }
    if (!directBase) return;
    if (edgeTool) {
        const size = Math.round(THREE.MathUtils.clamp((directBase.edge?.size || 3) + delta, 0.1, edgeLimitFor(directBase)) * 10000) / 10000;
        item.edge = { ...directBase.edge!, size };
        return;
    }
    const axis = Math.abs(normal[0]) > 0.5 ? 0 : Math.abs(normal[1]) > 0.5 ? 1 : 2;
    const sign = Math.sign(normal[axis]) || 1;
    let key: 'width' | 'height' | 'depth' | 'radius' = 'height';
    if (item.kind === 'box') key = axis === 0 ? 'width' : axis === 1 ? 'height' : 'depth';
    else if (item.kind === 'cylinder') key = axis === 1 ? 'height' : 'radius';
    else if (item.kind === 'extrude') key = 'depth';
    else if (item.kind === 'sphere') key = 'radius';
    const baseValue = directBase[key] || 1;
    const nextValue = Math.round(Math.max(0.1, baseValue + delta * (item.kind === 'sphere' ? 0.5 : sign)) * 10000) / 10000;
    item[key] = nextValue;
    const shouldOffset = item.kind === 'box' || (item.kind === 'cylinder' && axis === 1) || (item.kind === 'extrude' && axis === 1);
    if (shouldOffset) {
        const actual = nextValue - baseValue;
        const direction = new THREE.Vector3(...normal).normalize().applyEuler(new THREE.Euler(...directBase.rotation.map(THREE.MathUtils.degToRad) as Vec3));
        item.position = directBase.position.map((value, index) => value + direction.getComponent(index) * actual / 2) as Vec3;
    }
}

function startSketch(editProfile = false) {
    if (sketchMode.value) return;
    if (!document.value.planes.length && !['extrude', 'sketch'].includes(selected.value?.kind || '')) { showAddPlane.value = true; return message.info('请先添加一个绘制平面'); }
    const editing = editProfile && selected.value?.kind === 'extrude' ? document.value.entities.find((item) => item.id === selected.value!.profileId) : selected.value?.kind === 'sketch' ? selected.value : null;
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
    sketchType.value = editing?.profileType || sketchType.value;
    selectedSketchPoint.value = -1;
    if (!editing) selectedIds.value = [];
    setTool('select');
    sketchMode.value = true;
    viewport?.setSketchMode(true, sketchPoints.value);
    viewport?.setView('top');
}
function setSketchType(type: ProfileType) {
    sketchType.value = type;
    sketchPoints.value = [];
    selectedSketchPoint.value = -1;
    viewport?.updateSketch([], -1, type);
}
function addSketchPoint(point: Point2) {
    if (sketchType.value === 'circle' && sketchPoints.value.length >= 2) return;
    if (sketchType.value === 'arc' && sketchPoints.value.length >= 3) return;
    if (sketchType.value === 'rectangle' && sketchPoints.value.length >= 2) return;
    const previous = sketchPoints.value[sketchPoints.value.length - 1];
    if (previous && Math.hypot(previous[0] - point[0], previous[1] - point[1]) < 0.01) return;
    if (sketchType.value === 'rectangle' && sketchPoints.value.length === 1) {
        const first = sketchPoints.value[0];
        sketchPoints.value = [first, [point[0], first[1]], point, [first[0], point[1]]];
    } else sketchPoints.value.push(point);
    syncEditingSketch();
    viewport?.updateSketch(sketchPoints.value, selectedSketchPoint.value, sketchType.value);
}
function moveSketchPoint(index: number, point: Point2, phase: EditPhase) {
    if (phase === 'start') {
        if (editingSketchId.value) pushHistory();
        return;
    }
    if (!sketchPoints.value[index]) return;
    sketchPoints.value[index] = point;
    syncEditingSketch();
    viewport?.updateSketch(sketchPoints.value, selectedSketchPoint.value, sketchType.value);
}
function selectSketchPoint(index: number) {
    selectedSketchPoint.value = index;
    viewport?.setSketchSelection(index);
}
function updateSketchCoordinate(axis: 0 | 1, value: number | null) {
    const index = selectedSketchPoint.value;
    if (value === null || !sketchPoints.value[index]) return;
    if (editingSketchId.value) pushHistory();
    sketchPoints.value[index][axis] = Math.round(value * 10) / 10;
    syncEditingSketch();
    viewport?.updateSketch(sketchPoints.value, index, sketchType.value);
}
function syncEditingSketch() {
    if (!editingSketchId.value) return;
    const item = document.value.entities.find((entity) => entity.id === editingSketchId.value);
    if (item) { item.points = sketchPoints.value.map((point) => [...point]); item.profileType = sketchType.value; }
}
function updateSketchDepth(value: number | null) {
    if (value === null) return;
    if (editingSketchId.value) pushHistory();
    sketchDepth.value = Math.max(0.1, value);
    const item = document.value.entities.find((entity) => entity.id === editingSketchId.value);
    if (item) item.depth = sketchDepth.value;
}
function finishSketch() {
    if (!sketchMode.value) return;
    const points = [...sketchPoints.value];
    if (sketchType.value === 'polygon' && points.length > 1 && Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 0.01) points.pop();
    const ready = sketchType.value === 'circle' ? points.length >= 2 : points.length >= 3;
    if (!ready) return message.warning('当前草图工具的定义点不足');
    let id = editingSketchId.value;
    const existing = document.value.entities.find((entity) => entity.id === id);
    if (existing) {
        existing.points = points;
        existing.profileType = sketchType.value;
        if (existing.kind === 'extrude') existing.depth = sketchDepth.value;
    } else {
        pushHistory();
        const entity = createEntity('sketch', uid());
        entity.name = uniqueName('sketch');
        entity.points = points;
        entity.profileType = sketchType.value;
        entity.planeId = activePlaneId.value!;
        entity.position = [0, 0, 0];
        delete entity.depth;
        document.value.entities.push(entity);
        id = entity.id;
    }
    const shouldExtrude = !existing && profileClosed(sketchType.value);
    cancelSketch();
    selectedIds.value = [id!];
    if (shouldExtrude) startExtrude(id!);
    else viewport?.fitSelection();
}
function cancelSketch() {
    sketchMode.value = false;
    sketchPoints.value = [];
    selectedSketchPoint.value = -1;
    editingSketchId.value = null;
    viewport?.setSketchMode(false);
}

function createFolder() {
    pushHistory();
    const folder = { id: uid(), name: `文件夹 ${document.value.folders.length + 1}`, parentId: null };
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
    const referenced = document.value.entities.find((item) => item.kind === 'boolean' && item.operands?.some((id) => ids.includes(id)) && !ids.includes(item.id));
    if (referenced) { contextMenu.value = null; return message.warning(`请先删除依赖它的「${referenced.name}」`); }
    pushHistory();
    ids.forEach((id) => {
        const entity = document.value.entities.find((item) => item.id === id);
        if (entity?.kind === 'boolean') entity.operands?.forEach((operandId) => {
            const operand = document.value.entities.find((item) => item.id === operandId);
            if (operand) operand.visible = true;
        });
        if (document.value.folders.some((folder) => folder.id === id)) {
            document.value.folders.filter((folder) => folder.parentId === id).forEach((folder) => folder.parentId = null);
            document.value.entities.filter((entity) => entity.parentId === id).forEach((entity) => entity.parentId = null);
        }
    });
    document.value.entities = document.value.entities.filter((item) => !ids.includes(item.id));
    document.value.folders = document.value.folders.filter((item) => !ids.includes(item.id));
    selectedIds.value = [];
    contextMenu.value = null;
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
function createPlane() {
    pushHistory();
    const kind = planeKind.value;
    const plane: SketchPlane = {
        id: uid(), name: `${kind} 平面 ${document.value.planes.length + 1}`, kind, visible: true,
        origin: kind === 'XZ' ? [0, planeOffset.value, 0] : kind === 'XY' ? [0, 0, planeOffset.value] : [planeOffset.value, 0, 0],
        normal: kind === 'XZ' ? [0, 1, 0] : kind === 'XY' ? [0, 0, 1] : [1, 0, 0],
        u: kind === 'YZ' ? [0, 1, 0] : [1, 0, 0],
        v: kind === 'XZ' ? [0, 0, -1] : kind === 'XY' ? [0, 1, 0] : [0, 0, 1],
    };
    document.value.planes.push(plane);
    activePlaneId.value = plane.id;
    showAddPlane.value = false;
    viewport?.setActivePlane(plane);
}
function changeActivePlane(id: string) {
    activePlaneId.value = id;
    viewport?.setActivePlane(activePlane.value);
    viewport?.updateSketch(sketchPoints.value, selectedSketchPoint.value, sketchType.value);
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
function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
    if ((event.metaKey || event.ctrlKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(event.code)) { event.preventDefault(); return; }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') { event.preventDefault(); flushSave(); return; }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (event.metaKey || event.ctrlKey || event.code === 'Space') return;
    if (event.code === 'Enter' && operation.value) doneOperation();
    else if (event.code === 'Enter' && sketchMode.value) finishSketch();
    else if (event.code === 'Escape') operation.value ? cancelOperation() : sketchMode.value ? cancelSketch() : setTool('select');
    else if (event.code === 'Delete' || event.code === 'Backspace') removeSelected();
    else if (event.code === 'KeyV') setTool('select');
    else if (event.code === 'KeyG') setTool('translate');
    else if (event.code === 'KeyR') setTool('rotate');
    else if (event.code === 'KeyS') setTool('scale');
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

onMounted(async () => {
    viewport = new Viewport(viewportElement.value!, {
        onSelect: selectEntity,
        onGeometrySelect,
        onBodySelect,
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
        onSketchSelect: selectSketchPoint,
        onSketchComplete: finishSketch,
        onBlankCommit: () => operation.value ? doneOperation() : setTool('select'),
        onExtrudeDimension: () => nextTick(() => window.document.querySelector<HTMLInputElement>('.extrude-distance-input input')?.focus()),
        onSpaceChange: (active) => spaceActive.value = active,
        onMeasureChange: (active) => measureMode.value = active,
        onScale: (value) => scaleBar.value = value,
        onStats: (value) => stats.value = value,
    });
    viewport.sync(document.value);
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
    <div class="studio-shell" @click="contextMenu = null">
        <header class="topbar">
            <div class="brand"><div class="brand-mark"><NIcon :size="23"><CubeOutline /></NIcon></div><div><strong>FORM</strong><span>3D STUDIO</span></div></div>
            <div class="topbar-project"><span class="local-badge"><i></i> 本地项目</span><NInput v-model:value="project.name" class="project-name" size="small" :bordered="false" /></div>
            <div class="topbar-actions">
                <span class="save-state" :class="saveState"><NIcon :size="15"><CheckmarkOutline /></NIcon>{{ saveLabel }}</span>
                <NTooltip><template #trigger><button class="icon-button" :disabled="!canUndo" @click="undo"><NIcon><ArrowUndoOutline /></NIcon></button></template>撤销 ⌘Z</NTooltip>
                <NTooltip><template #trigger><button class="icon-button" :disabled="!canRedo" @click="redo"><NIcon><ArrowRedoOutline /></NIcon></button></template>重做 ⇧⌘Z</NTooltip>
                <button class="icon-button" @click="showHelp = true"><NIcon><HelpCircleOutline /></NIcon></button>
                <NPopover trigger="click" placement="bottom-end" :show-arrow="false" content-class="export-popover">
                    <template #trigger><NButton type="primary" :loading="exporting"><template #icon><NIcon><DownloadOutline /></NIcon></template>导出模型<NIcon class="chevron"><ChevronDownOutline /></NIcon></NButton></template>
                    <div class="export-panel">
                        <div class="popover-title">导出模型</div><label>网格精度</label>
                        <NSelect v-model:value="exportQuality" size="small" :options="[{ label: '高精度 · 128 细分', value: 'high' }, { label: '超高精度 · 256 细分', value: 'ultra' }]" />
                        <p>由参数化源数据重新生成，不使用预览网格。</p>
                        <NButton block secondary @click="runExport('stl')">STL <span>用于 3D 打印</span></NButton>
                        <NButton block secondary @click="runExport('glb')">GLB <span>包含材质</span></NButton>
                        <div class="popover-divider"></div><button class="text-action" @click="exportProject(document, project.name)"><NIcon><DocumentOutline /></NIcon>导出可编辑项目 JSON</button>
                    </div>
                </NPopover>
            </div>
        </header>

        <div class="workspace">
            <aside class="left-panel panel">
                <section class="objects-section">
                    <div class="section-label">实体 <span class="section-actions"><button title="新建文件夹" @click="createFolder"><NIcon><FolderOutline /></NIcon> +</button><i>{{ document.entities.length }}</i></span></div>
                    <div class="object-list">
                        <div v-if="!treeNodes.length" class="empty-objects">使用画布左侧工具开始建模</div>
                        <EntityTree :nodes="treeNodes" :selected-ids="selectedIds" @select="selectFromItems" @context="openNodeContext" @drop="reparentNodes"
                            @toggle="(id) => { const item = document.entities.find(entity => entity.id === id); if (item) { pushHistory(); item.visible = !item.visible; } }" />
                    </div>
                </section>
                <section class="project-section">
                    <div class="section-label">项目操作</div>
                    <NSelect :value="project.id" :options="projectOptions" size="small" @update:value="openProject" />
                    <div class="project-actions">
                        <button @click="showNewProject = true"><NIcon><AddOutline /></NIcon><span>新建</span></button>
                        <button @click="duplicateProject"><NIcon><CopyOutline /></NIcon><span>复制</span></button>
                        <button @click="importProject"><NIcon><FolderOpenOutline /></NIcon><span>导入</span></button>
                        <NPopconfirm @positive-click="removeProject"><template #trigger><button class="danger-hover"><NIcon><TrashOutline /></NIcon><span>删除</span></button></template>删除当前项目？此操作不可撤销。</NPopconfirm>
                    </div>
                </section>
                <div class="storage-note"><NIcon><CloudDoneOutline /></NIcon><div><strong>自动保存</strong><span>项目仅存储在此浏览器的 IndexedDB 中</span></div></div>
            </aside>

            <main class="viewport-area">
                <div ref="viewportElement" class="viewport"></div>
                <nav class="vertical-toolbar">
                    <div class="menu-state">{{ { Default: '默认菜单', Sketch: '草图菜单', SelectionAdaptive: '自适应选择', ToolActive: '工具执行中', HistoryEdit: 'History 编辑' }[uiState] }}</div>
                    <div class="tool-group">
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'select' && !sketchMode }" @click="setTool('select')"><NIcon><NavigateOutline /></NIcon></button></template>选择 · V</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'translate' }" @click="setTool('translate')"><NIcon><MoveOutline /></NIcon></button></template>移动 · G</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'rotate' }" @click="setTool('rotate')"><NIcon><RepeatOutline /></NIcon></button></template>旋转 · R</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'scale' }" @click="setTool('scale')"><NIcon><ResizeOutline /></NIcon></button></template>缩放 · S</NTooltip>
                    </div>
                    <div class="tool-group">
                        <NTooltip placement="right"><template #trigger><button @click="showAddPlane = true"><NIcon><LayersOutline /></NIcon></button></template>添加绘制平面</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: sketchMode && sketchType === 'polygon' }" @click="sketchMode ? setSketchType('polygon') : startSketch()"><NIcon><CreateOutline /></NIcon></button></template>Line / 多段线</NTooltip>
                        <template v-if="sketchMode">
                            <NTooltip placement="right"><template #trigger><button :class="{ active: sketchType === 'rectangle' }" @click="setSketchType('rectangle')"><NIcon><GridOutline /></NIcon></button></template>Rectangle · 对角矩形</NTooltip>
                            <NTooltip placement="right"><template #trigger><button :class="{ active: sketchType === 'circle' }" @click="setSketchType('circle')"><NIcon><EllipseOutline /></NIcon></button></template>Circle · 圆心 + 圆周</NTooltip>
                            <NTooltip placement="right"><template #trigger><button :class="{ active: sketchType === 'arc' }" @click="setSketchType('arc')"><NIcon><AnalyticsOutline /></NIcon></button></template>Arc · 三点圆弧</NTooltip>
                        </template>
                    </div>
                    <div class="tool-group">
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'extrude' }" @click="selected?.kind === 'sketch' ? startExtrude(selected.id) : message.info('请先选择闭合草图 Profile')"><NIcon><ArrowUpOutline /></NIcon></button></template>Extrude · 从轮廓拉伸</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'offsetFace' }" @click="setTool('offsetFace')"><NIcon><ArrowUpOutline /></NIcon></button></template>Offset Face · 偏移所选面</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'fillet' }" @click="setTool('fillet')"><NIcon><EllipseOutline /></NIcon></button></template>圆角 · 拖动模型调整</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: activeTool === 'chamfer' }" @click="setTool('chamfer')"><NIcon><CutOutline /></NIcon></button></template>倒角 · 拖动模型调整</NTooltip>
                    </div>
                    <div class="tool-group">
                        <NTooltip placement="right"><template #trigger><button :disabled="!canBoolean" @click="applyBoolean('union')"><NIcon><AddOutline /></NIcon></button></template>并集</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :disabled="!canBoolean" @click="applyBoolean('subtract')"><NIcon><CutOutline /></NIcon></button></template>差集</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :disabled="!canBoolean" @click="applyBoolean('intersect')"><NIcon><ShapesOutline /></NIcon></button></template>交集</NTooltip>
                    </div>
                    <div class="toolbar-spacer"></div>
                    <div class="tool-group">
                        <NTooltip placement="right"><template #trigger><button :disabled="!selected || selected.kind === 'boolean'" @click="duplicateSelected"><NIcon><CopyOutline /></NIcon></button></template>复制实体</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :disabled="!selectedIds.length" @click="removeSelected"><NIcon><TrashOutline /></NIcon></button></template>删除实体</NTooltip>
                        <NTooltip placement="right"><template #trigger><button :class="{ active: gridVisible }" @click="gridVisible = !gridVisible"><NIcon><GridOutline /></NIcon></button></template>地面网格</NTooltip>
                        <NTooltip placement="right"><template #trigger><button @click="fitView"><NIcon><CameraOutline /></NIcon></button></template>适合画布 · F</NTooltip>
                    </div>
                </nav>

                <div class="view-options"><NCheckbox v-model:checked="shadowVisible" size="small">投影</NCheckbox><NPopover trigger="click" placement="bottom-end"><template #trigger><button class="history-button">History</button></template><div class="history-panel"><strong>History</strong><button v-for="step in historySteps" :key="step.id" @click="editHistory(step.id)"><span>{{ step.kind === 'sketch' ? 'Sketch' : step.kind === 'extrude' ? 'Extrude' : 'Boolean' }}</span>{{ step.name }}<NIcon><PencilOutline /></NIcon></button><div v-if="!historySteps.length" class="history-empty">暂无建模步骤</div></div></NPopover></div>
                <div class="viewport-caption"><span class="axis-dot"></span>毫米 (mm)</div>

                <section v-if="contextVisible" class="context-panel">
                    <template v-if="operation?.type === 'extrude' && extrudeBody">
                        <div class="context-title"><strong>Extrude</strong><span>{{ historyEditId ? 'History 编辑' : '拖动画布箭头或输入距离' }}</span></div>
                        <div class="context-fields operation-fields">
                            <label>距离<NInputNumber class="extrude-distance-input" :precision="4" :value="extrudeBody.depth" :min="0.1" size="small" @update:value="updateExtrude('depth', $event)" /></label>
                            <label>方向<NSelect :value="extrudeBody.direction" size="small" :options="[{ label: '正向', value: 1 }, { label: '反向', value: -1 }]" @update:value="updateExtrude('direction', $event)" /></label>
                            <label>侧面<NSelect :value="extrudeBody.sideMode" size="small" :options="[{ label: '单侧', value: 'one' }, { label: '对称', value: 'symmetric' }]" @update:value="updateExtrude('sideMode', $event)" /></label>
                            <label>拔模°<NInputNumber :precision="4" :value="extrudeBody.draftAngle || 0" :min="-45" :max="45" size="small" @update:value="updateExtrude('draftAngle', $event)" /></label>
                            <label>结果<NSelect :value="operation.result" size="small" :options="[{ label: 'New Body', value: 'new' }, { label: 'Union', value: 'union' }, { label: 'Subtract', value: 'subtract' }, { label: 'Intersect', value: 'intersect' }]" @update:value="updateExtrudeResult" /></label>
                            <NSelect v-if="operation.result !== 'new'" :value="operation.targetId" :options="operationTargets" placeholder="Target Body" size="small" @update:value="operation.targetId = $event" />
                            <NButton size="small" type="primary" @click="doneOperation">Done</NButton><NButton size="small" quaternary @click="cancelOperation">Cancel</NButton>
                        </div>
                    </template>
                    <template v-else-if="operation?.type === 'boolean' && booleanDraft">
                        <div class="context-title"><strong>Boolean</strong><span>紫色 Target / 蓝色 Tool</span></div>
                        <div class="context-fields operation-fields">
                            <NSelect :value="document.entities.find(item => item.id === booleanDraft.resultId)?.operation" size="small" :options="[{ label: 'Union', value: 'union' }, { label: 'Subtract', value: 'subtract' }, { label: 'Intersect', value: 'intersect' }]" @update:value="document.entities.find(item => item.id === booleanDraft.resultId)!.operation = $event" />
                            <NButton size="small" secondary @click="swapBooleanRoles">交换 Target / Tool</NButton>
                            <NCheckbox v-model:checked="booleanDraft.keepTarget" size="small">保留 Target</NCheckbox>
                            <NCheckbox v-model:checked="booleanDraft.keepTool" size="small">保留 Tool</NCheckbox>
                            <NButton size="small" type="primary" @click="doneOperation">Done</NButton><NButton size="small" quaternary @click="cancelOperation">Cancel</NButton>
                        </div>
                    </template>
                    <template v-else-if="sketchMode">
                        <div class="context-title"><NIcon><CreateOutline /></NIcon><strong>{{ editingSketchId ? '编辑草图' : '绘制草图' }}</strong><span>单击添加点，拖动顶点调整</span></div>
                        <div class="context-fields">
                            <NSelect v-if="!editingSketchId" :value="activePlaneId" :options="planeOptions" size="small" class="plane-select" @update:value="changeActivePlane" />
                            <label>厚度<NInputNumber :precision="4" :value="sketchDepth" :min="0.1" size="small" @update:value="updateSketchDepth" /></label>
                            <template v-if="selectedSketchPoint >= 0 && sketchPoints[selectedSketchPoint]">
                                <label>X<NInputNumber :precision="4" :value="sketchPoints[selectedSketchPoint][0]" size="small" :show-button="false" @update:value="updateSketchCoordinate(0, $event)" /></label>
                                <label>Z<NInputNumber :precision="4" :value="sketchPoints[selectedSketchPoint][1]" size="small" :show-button="false" @update:value="updateSketchCoordinate(1, $event)" /></label>
                            </template>
                            <NButton size="small" secondary @click="viewport?.normalToSketch()">Normal to Sketch</NButton>
                            <NButton size="small" type="primary" :disabled="!sketchClosed" @click="finishSketch">Exit Sketching</NButton>
                            <button class="context-close" @click="cancelSketch"><NIcon><CloseOutline /></NIcon></button>
                        </div>
                    </template>
                    <template v-else-if="selectedEntities.length > 1">
                        <div class="context-title"><strong>{{ selectedEntities.length }} 个实体</strong><span>按选择顺序执行布尔运算</span></div>
                        <div class="context-fields"><NButton size="small" secondary @click="applyBoolean('union')">并集</NButton><NButton size="small" secondary @click="applyBoolean('subtract')">差集</NButton><NButton size="small" secondary @click="applyBoolean('intersect')">交集</NButton></div>
                    </template>
                    <template v-else-if="selected">
                        <div class="context-title"><input :value="selected.name" @change="updateEntity('name', ($event.target as HTMLInputElement).value)" /><span v-if="activeTool === 'offsetFace'">拖动模型面，向上增大尺寸</span><span v-else-if="activeTool === 'fillet' || activeTool === 'chamfer'">在模型上拖动调整距离</span><span v-else>{{ ENTITY_NAMES[selected.kind] }}</span></div>
                        <div v-if="activeVector" class="context-fields vector-fields">
                            <label v-for="axis in ['X', 'Y', 'Z']" :key="axis">{{ axis }}<NInputNumber :precision="4" :value="activeVector.value[['X','Y','Z'].indexOf(axis)]" size="small" :show-button="false" :step="activeVector.step" :min="activeVector.key === 'scale' ? 0.01 : undefined" @update:value="updateVector(activeVector.key, ['X','Y','Z'].indexOf(axis), $event)" /></label>
                        </div>
                        <div v-else-if="activeTool === 'fillet' || activeTool === 'chamfer'" class="context-fields">
                            <label>距离<NInputNumber :precision="4" :value="selected.edge?.size || 0" :min="0" :max="selected ? edgeLimitFor(selected) : 0" size="small" @update:value="updateEntity('edge', { type: activeTool, size: $event || 0, segments: selected.edge?.segments || 6 })" /></label>
                            <button class="text-button" @click="clearEdge">清除边处理</button>
                        </div>
                        <div v-else class="context-fields">
                            <label v-for="field in dimensionFields" :key="field.key">{{ field.label }}<NInputNumber :precision="4" :value="field.value" :min="0.1" size="small" :show-button="false" @update:value="updateEntity(field.key, $event)" /></label>
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
                        <NTooltip><template #trigger><button :class="{ active: measureMode }" @click.stop="toggleMeasure"><NIcon><ScaleOutline /></NIcon></button></template>测量两个面之间的距离</NTooltip>
                        <NTooltip><template #trigger><button @click.stop="fitView"><NIcon><ScanOutline /></NIcon></button></template>适配视图（保持方向）</NTooltip>
                    </div>
                    <div class="scale-indicator"><div class="scale-rule" :style="{ width: `${scaleBar.width}px` }"><i></i><i></i><i></i></div><span>{{ scaleBar.label }}</span></div>
                </div>
                <div class="gizmo-label">拖动旋转 · 点击切换视图</div>
                <div class="viewport-status"><span :class="{ accent: spaceActive }">空格 + 拖拽平移</span><i></i><span>空白拖拽旋转</span><i></i><span>⌘ 单击多选</span><div>{{ stats.objects }} 实体 · {{ stats.triangles.toLocaleString() }} 三角面</div></div>
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
        <NModal v-model:show="showRename" preset="card" title="重命名" style="width: 380px" :bordered="false">
            <NInput v-model:value="renameValue" autofocus @keyup.enter="applyRename" />
            <div class="modal-actions"><NButton @click="showRename = false">取消</NButton><NButton type="primary" @click="applyRename">确定</NButton></div>
        </NModal>
        <NModal v-model:show="showAddPlane" preset="card" title="添加绘制平面" style="width: 420px" :bordered="false">
            <div class="plane-form"><label>坐标平面<NSelect v-model:value="planeKind" :options="[{ label: 'XZ · 地面', value: 'XZ' }, { label: 'XY · 前视', value: 'XY' }, { label: 'YZ · 侧视', value: 'YZ' }]" /></label>
                <label>法向偏移<NInputNumber :precision="4" v-model:value="planeOffset" :step="5"><template #suffix>mm</template></NInputNumber></label></div>
            <p class="modal-note">草图只能绘制在显式平面上，顶点保存为该平面的局部坐标。</p>
            <div class="modal-actions"><NButton @click="showAddPlane = false">取消</NButton><NButton type="primary" @click="createPlane">添加平面</NButton></div>
        </NModal>
        <NModal v-model:show="showHelp" preset="card" title="直接建模操作" style="width: 600px" :bordered="false">
            <div class="help-content">
                <section><strong>画布与坐标球</strong><p>空白拖拽旋转，空格拖拽平移。拖动右下角坐标球可旋转视角，点击 X / Y / Z 轴端点切换正交方向视图。</p></section>
                <section><strong>草图与精准点编辑</strong><p>先添加 XZ / XY / YZ 平面，再在平面局部坐标中逐点绘制。顶点可拖动或输入数值，厚度可随时调整；已有拉伸实体可重新进入编辑。</p></section>
                <section><strong>面推拉与边处理</strong><p>推拉工具按住模型面上下拖动即可改变尺寸。圆角或倒角工具在模型上拖动调整距离，也可在顶部输入精确数值。</p></section>
                <section><strong>测量与实体树</strong><p>尺子工具依次点击两个面，显示总距离和 XYZ 分量，第三次点击退出。实体树支持多选、嵌套拖拽、文件夹和右键重命名/删除。</p></section>
            </div>
        </NModal>
        <input ref="importInput" type="file" accept=".json,.model.json" hidden @change="onImportFile" />
    </div>
</template>
