<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { NButton, NCheckbox, NIcon, NInput, NModal, NSelect, NTooltip, useMessage } from 'naive-ui';
import {
    AnalyticsOutline, ArrowUpOutline, CameraOutline, ChevronDownOutline, CloseOutline, CreateOutline, CubeOutline,
    CutOutline, EllipseOutline, EyeOutline, FolderOpenOutline, GridOutline, LayersOutline, MoveOutline,
    RepeatOutline, ResizeOutline, ShapesOutline, TrashOutline, PencilOutline, ScanOutline,
} from '@vicons/ionicons5';
import { Viewport, type ViewTool, type ViewportCallbacks } from './engine/Viewport';
import ViewportView from './components/viewport/Viewport.vue';
import EntityTree, { type OutlinerNode } from './components/entity/EntityTree.vue';
import SvgIcon from './components/ui/SvgIcon.vue';
import { entityProfileClosed } from './engine/profiles';
import { borderSegments } from './engine/sketchBorders';
import { useUndoHistory } from './composables/useUndoHistory';
import { useProjectLibrary } from './composables/useProjectLibrary';
import { useDocumentEntities } from './composables/useDocumentEntities';
import { useModelingOperations } from './composables/useModelingOperations';
import { useSketchState } from './composables/sketch/useSketchState';
import { useSketchConstraints } from './composables/sketch/useSketchConstraints';
import { useSketchEditing } from './composables/sketch/useSketchEditing';
import { useSketchSession } from './composables/sketch/useSketchSession';
import { useSketchAdvanced } from './composables/sketch/useSketchAdvanced';
import { storedLengthUnit, useUnits } from './composables/useUnits';
import AppTopBar from './components/layout/AppTopBar.vue';
import EntitySidebar from './components/layout/EntitySidebar.vue';
import ModelingToolbar from './components/modeling/ModelingToolbar.vue';
import SketchToolbar from './components/sketch/SketchToolbar.vue';
import SketchConstraints from './components/sketch/SketchConstraints.vue';
import SketchHints from './components/sketch/SketchHints.vue';
import SketchAdvancedOverlay from './components/sketch/SketchAdvancedOverlay.vue';
import MenuCommand from './components/ui/MenuCommand.vue';
import IntegerInputNumber from './components/ui/IntegerInputNumber.vue';
import { STORAGE_KEYS } from './config/const';
import { computeSketchFaces } from './engine/sketchFaces';
import {
    createDocument, ENTITY_NAMES,
    type ModelDocument, type ModelEntity, type Vec3, type PrimaryPanel, type SelectionKind,
} from './types';

const message = useMessage();
let viewport: Viewport;
let transforming = false;

const document = ref<ModelDocument>(createDocument(storedLengthUnit()));
const selectedIds = ref<string[]>([]);
const activeTool = ref<ViewTool>('select');
const gridVisible = ref(true);
const shadowVisible = ref(false);
const projectionMode = ref<'perspective' | 'orthographic'>('perspective');
const spaceActive = ref(false);
const showHelp = ref(false);
const stats = ref({ vertices: 0, triangles: 0, objects: 0 });
const measureMode = ref(false);
const activePlaneId = ref<string | null>(null);
const lastFace = ref<{ bodyId: string; normal: Vec3; point: Vec3 } | null>(null);
const viewportMenu = ref<{ x: number; y: number; id: string | null } | null>(null);
const activePanel = ref<PrimaryPanel | null>(null);
const selectionKind = ref<SelectionKind>(null);
const parameterCardOpen = ref(true);
const itemsVisible = ref(true);
const commandSearch = ref('');
const isolateActive = ref(false);
const sectionActive = ref(false);
const displayMode = ref<'shaded' | 'wireframe' | 'xray'>('shaded');
const showEdges = ref(true);

const selectedEntities = computed(() => selectedIds.value.map((id) => document.value.entities.find((item) => item.id === id)).filter(Boolean) as ModelEntity[]);
const selectedSketches = computed(() => selectedEntities.value.filter((item) => item.kind === 'sketch'));
const selected = computed(() => selectedEntities.value.length === 1 ? selectedEntities.value[0] : null);
const sketchState = useSketchState(document);
const {
    sketchMode, sketchType, sketchSides, sketchPoints, sketchDepth, selectedSketchPoint, editingSketchId,
    trimmedSelection, sketchContextMenu, selectedShapes, selectedEdges, selectedPoints,
    activeConstraintRule, sketchSelectionTool, constraintLimit, sketchGuideSnapEnabled,
    sketchClosed, constraintSegmentCount,
    selectionLocked, selectionLengthLocked, horizontalConstraintActive, verticalConstraintActive,
    autoConstraintActive, selectedConstraintRuleItems,
} = sketchState;
const { canUndo, canRedo, pushHistory, popHistory, undo, redo, clearHistory } = useUndoHistory(document, selectedIds);
const { lengthUnit, scaleBar, scaleBarLabel, setLengthUnit, displayLength, inputLength } = useUnits(document, () => { viewport?.setLengthUnit(lengthUnit.value); refreshSketch(); });
const sketchConstraints = useSketchConstraints({
    document, selectedIds, state: sketchState, viewport: () => viewport, message,
    pushHistory, popHistory, refreshSketch: () => sketchSession.refreshSketch(),
    syncTrimmedEntity: (points) => sketchEditing.syncTrimmedEntity(points), isTransforming: () => transforming,
});
const {
    selectConstraintRule, deleteSelectedConstraintRule,
    applySketchConstraint, toggleSketchPointLock,
} = sketchConstraints;
const {
    operation, historyEditId, canBoolean, extrudeBody, booleanDraft, operationTargets,
    createPrimitive, applyBoolean, startExtrude, updateExtrude, updateExtrudeLength, onExtrudeGesture,
    updateExtrudeResult, swapBooleanRoles, doneOperation, cancelOperation, editHistory,
    clearEdge, updateFaceOffsetInput, onDirectEdit,
} = useModelingOperations({
    document, selectedIds, selectedEntities, selected, selectionKind, activeTool, activePanel,
    parameterCardOpen, lastFace, viewport: () => viewport, message, pushHistory, popHistory, inputLength, setTool,
    startSketch: (editProfile) => sketchSession.startSketch(editProfile),
});
const uiState = computed(() => sketchMode.value ? 'Sketch' : historyEditId.value ? 'HistoryEdit' : operation.value ? 'ToolActive' : selectedIds.value.length ? 'SelectionAdaptive' : 'Default');
const historySteps = computed(() => document.value.entities.flatMap((item) => {
    const steps = ['sketch', 'extrude', 'boolean'].includes(item.kind) ? [{ id: item.id, name: item.name, kind: item.kind as string }] : [];
    if (item.edge) steps.push({ id: `${item.id}:edge`, name: item.name, kind: item.edge.type });
    return steps;
}).reverse());
const activePlane = computed(() => document.value.planes.find((plane) => plane.id === activePlaneId.value) || null);
const {
    importInput, projects, project, saveState, exportQuality, exporting,
    showNewProject, newProjectName, flushSave, scheduleSave, clearSaveTimer, openProject,
    newProject, duplicateProject, removeProject, onExportAction,
    importProject, onImportFile, initializeProjects,
} = useProjectLibrary({
    document, selectedIds, activePlaneId, activePlane, lengthUnit, isolateActive, sectionActive,
    viewport: () => viewport, clearHistory, cancelSketch: () => sketchSession.cancelSketch(), setTool, message,
});
const {
    treeNodes, contextMenu, showRename, renameValue,
    selectEntity, updateEntity, updateLengthEntity, updateEdgeSize, updateVector,
    removeSelected, removeConstraintsForEdge, removeConstraintsForEntity,
    createFolder, openNodeContext, requestRename, applyRename, deleteContextNodes, reparentNodes,
    createPlane, constructPlane, createPlaneAndSketch, selectPlane, activateTreeNode,
    toggleNodeVisibility, changeActivePlane,
} = useDocumentEntities({
    document, selectedIds, selected, selectionKind, activeTool, activePanel, activePlaneId, activePlane,
    lastFace, sketchMode, editingSketchId, activeConstraintRule, viewport: () => viewport, message,
    pushHistory, inputLength, setTool,
    selectSketchEntity: (id, additive) => sketchEditing.selectSketchEntity(id, additive),
    cancelSketch: () => sketchSession.cancelSketch(),
    clearSketchSelection: () => sketchEditing.clearSketchSelection(),
    beginSketch, refreshSketch: () => sketchSession.refreshSketch(),
});
const sketchEditing = useSketchEditing({
    document, selectedIds, activePlaneId, activePlane, viewportMenu, state: sketchState,
    constraints: sketchConstraints, viewport: () => viewport, message, pushHistory, popHistory,
    refreshSketch: () => sketchSession.refreshSketch(),
    persistSketchProgress: (resetAfter) => sketchSession.persistSketchProgress(resetAfter),
    removeConstraintsForEdge, removeConstraintsForEntity,
    isTransforming: () => transforming, setTransforming: (value) => transforming = value,
});
const {
    activateSketchSelectionTool, clearSketchSelection, selectTrimmedBorder, selectSketchEntity,
    openSketchContext, deleteSketchFromContext, deleteViewportSketch, addSketchPoint,
    moveSketchPoint, finishSketchHandleDrag, moveSketchCenter, deleteSketchPoint, deleteSketchBorder,
    selectSketchSegment, moveSketchHandle, resetSketchHandle, selectSketchPoint,
    selectSketchPointRef, dragSketch, closeSketchPath, setSketchSides, updateSketchCoordinate,
} = sketchEditing;
const sketchSession = useSketchSession({
    document, selectedIds, selected, selectionKind, activeTool, activePlaneId, lastFace, lengthUnit,
    state: sketchState, constraints: sketchConstraints, editing: sketchEditing,
    viewport: () => viewport, message, pushHistory, setTool,
    canDraw: () => canDraw.value, isTransforming: () => transforming,
});
const {
    startSketch, refreshSketch, setSketchType, updateSketchDepth,
    onSketchSectorMove, resetSketchSector, onSketchDimension, finishSketch, closeSketch,
    cancelSketch, cancelSketchRefresh,
} = sketchSession;
const sketchAdvanced = useSketchAdvanced({
    document, activePlaneId, activeTool, sketchType, sketchSides, sketchSelectionTool, selectedShapes, selectedIds, lengthUnit, setLengthUnit,
    viewport: () => viewport, message, pushHistory, setTransforming: (value) => transforming = value,
    refreshSketch, syncSketchFromDocument: sketchConstraints.syncLocalSketchFromDocument, selectSketchEntity, clearSketchSelection, activateSketchSelectionTool,
});
const { symmetry, symmetryActive, overlayActive } = sketchAdvanced;
const canDraw = computed(() => !!activePlane.value && selectedIds.value.includes(activePlane.value.id));
const planeOptions = computed(() => document.value.planes.map((plane) => ({ label: plane.name, value: plane.id })));
const contextVisible = computed(() => parameterCardOpen.value && !sketchMode.value && operation.value?.type !== 'extrude' && ((!!selected.value && selected.value.kind !== 'sketch') || (selectedEntities.value.length > 1 && selectedSketches.value.length !== selectedEntities.value.length) || ['offsetFace', 'fillet', 'chamfer'].includes(activeTool.value)));
const visibleEntityCount = computed(() => document.value.entities.filter((item) => item.kind !== 'sketch').length);
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
function chooseSketchTransform(tool: 'translate' | 'rotate' | 'scale') {
    if (symmetry.value && symmetry.value.step !== 3) return;
    activeTool.value = tool;
    sketchSelectionTool.value = true;
    viewport?.setTool(tool);
    viewport?.setSketchSelectionTool(true);
}
function chooseSketchSelection() {
    if (symmetry.value && symmetry.value.step !== 3) return;
    activeTool.value = 'select';
    viewport?.setTool('select');
    activateSketchSelectionTool();
}
function chooseSketchType(type: typeof sketchType.value) {
    if (symmetry.value && symmetry.value.step !== 3) return;
    activeTool.value = 'select';
    viewport?.setTool('select');
    setSketchType(type);
}
function closeSketchMode() {
    if (symmetryActive.value) sketchAdvanced.cancelSymmetry();
    closeSketch();
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

function setTool(tool: ViewTool) {
    if (operation.value && activeTool.value !== tool) cancelOperation();
    if (measureMode.value) { measureMode.value = false; viewport?.setMeasureMode(false); }
    if (sketchMode.value) cancelSketch();
    activeTool.value = tool;
    viewport?.setTool(tool);
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
        if (symmetryActive.value) sketchAdvanced.cancelSymmetry();
        else if (operation.value) cancelOperation();
        else if (sketchMode.value) clearSketchSelection();
        else if (activeTool.value !== 'select') setTool('select');
        else { activePanel.value = null; selectEntity(null); }
    }
    else if (event.code === 'Delete' || event.code === 'Backspace') { if (!symmetryActive.value) removeSelected(); }
    else if (event.code === 'KeyV') sketchMode.value ? chooseSketchSelection() : setTool('select');
    else if (event.code === 'KeyG') sketchMode.value ? chooseSketchTransform('translate') : setTool('translate');
    else if (event.code === 'KeyR') sketchMode.value ? chooseSketchTransform('rotate') : setTool('rotate');
    else if (event.code === 'KeyS' && (sketchMode.value || selectionKind.value !== 'plane')) sketchMode.value ? chooseSketchTransform('scale') : setTool('scale');
    else if (event.code === 'KeyE' && operation.value?.type === 'extrude' && extrudeBody.value) updateExtrude('sideMode', extrudeBody.value.sideMode === 'one' ? 'symmetric' : 'one');
    else if (event.code === 'KeyE' && selected.value?.kind === 'sketch') startExtrude(selected.value.id);
    else if (event.code === 'KeyF' && selectionKind.value === 'edge') chooseTool('fillet');
    else if (event.code === 'KeyF') viewport?.fit();
}

watch(document, () => {
    if (!transforming) viewport?.sync(document.value);
    scheduleSave();
}, { deep: true });
watch([selectedIds, selectedShapes, sketchMode], ([ids, shapes, active]) => viewport?.setSelected(active ? shapes : ids), { deep: true });
watch([selectedEdges, selectedPoints, sketchMode], ([edges, points]) => viewport?.setSketchSelectionState(edges, points), { deep: true });
watch(() => project.value.name, scheduleSave);
watch(constraintLimit, (value) => localStorage.setItem(STORAGE_KEYS.constraintLimit, String(value)));
watch(sketchGuideSnapEnabled, (value) => viewport?.setSketchGuideSnapEnabled(value));
watch(sketchMode, (active) => { if (!active && symmetryActive.value) sketchAdvanced.cancelSymmetry(); });
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

Object.defineProperty(window, 'projectData', {
    configurable: true,
    enumerable: true,
    get: () => ({
        ...document.value,
        activePlaneId: activePlaneId.value,
        editingSketchId: editingSketchId.value,
        selectedIds: selectedIds.value,
        sketchPoints: sketchPoints.value,
        trimmedSelection: trimmedSelection.value,
        faces: activePlaneId.value ? computeSketchFaces(document.value.entities, activePlaneId.value) : [],
        borders: document.value.entities.filter((entity) => entity.kind === 'sketch').map((entity) => ({
            id: entity.id,
            type: entity.profileType,
            open: entity.open,
            trimmed: !!entity.trimmed,
            controlPoints: entity.controlPoints,
            segments: borderSegments(entity),
        })),
    }),
});

const viewportCallbacks: ViewportCallbacks = {
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
        onSketchPointRefSelect: selectSketchPointRef,
        onSketchConstraintRule: selectConstraintRule,
        onSketchComplete: finishSketch,
        onSketchClosePath: closeSketchPath,
        onSketchEntitySelect: selectSketchEntity,
        onSketchBorderSelect: selectTrimmedBorder,
        onSketchContext: openSketchContext,
        onSketchCancelSelection: clearSketchSelection,
        onSketchCenterMove: moveSketchCenter,
        onSketchPointDelete: deleteSketchPoint,
        onSketchBorderDelete: deleteSketchBorder,
        onSketchSectorMove,
        onSketchSectorReset: resetSketchSector,
        onSketchDimension,
        onSketchDragEnd: refreshSketch,
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
};

function onViewportReady(instance: Viewport) {
    viewport = instance;
}

onMounted(async () => {
    viewport.sync(document.value);
    viewport.setLengthUnit(lengthUnit.value);
    window.addEventListener('keydown', onKeyDown);
    window.document.addEventListener('contextmenu', preventContextMenu);
    window.document.addEventListener('wheel', preventBrowserZoom, { passive: false });
    window.document.addEventListener('gesturestart', preventGesture);
    window.document.addEventListener('gesturechange', preventGesture);
    window.addEventListener('beforeunload', flushSave);
    try {
        await initializeProjects();
        await nextTick();
        viewport.fit();
    } catch (error) { message.error(`无法打开本地项目库：${(error as Error).message}`); }
});
onBeforeUnmount(() => {
    delete (window as any).projectData;
    clearSaveTimer();
    cancelSketchRefresh();
    flushSave();
    window.removeEventListener('keydown', onKeyDown);
    window.document.removeEventListener('contextmenu', preventContextMenu);
    window.document.removeEventListener('wheel', preventBrowserZoom);
    window.document.removeEventListener('gesturestart', preventGesture);
    window.document.removeEventListener('gesturechange', preventGesture);
    window.removeEventListener('beforeunload', flushSave);
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

            <main class="viewport-area" :class="{ 'drawing-active': sketchMode, 'symmetry-active': symmetryActive }">
                <ViewportView :callbacks="viewportCallbacks" :suspended="overlayActive" @ready="onViewportReady" />
                <SketchAdvancedOverlay v-if="sketchMode && overlayActive" :advanced="sketchAdvanced" />
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

                <SketchToolbar :sketch-mode="sketchMode" :active-panel="activePanel" :selection-tool="sketchSelectionTool" :sketch-type="sketchType" :sides="sketchSides" :active-tool="activeTool" :symmetry-step="symmetry?.step || null"
                    :planes="document.planes" :selection-kind="selectionKind" @close="sketchMode ? closeSketchMode() : activePanel = null" @select="chooseSketchSelection"
                    @type="chooseSketchType" @sides="setSketchSides" @plane="beginSketch" @construct="createPlaneAndSketch" @face="beginSketch()" @symmetry="sketchAdvanced.startSymmetry" @transform="chooseSketchTransform" />
                <SketchConstraints v-if="sketchMode && !symmetryActive" :segment-count="constraintSegmentCount" :selected-point="selectedSketchPoint" :selection-locked="selectionLocked" :length-locked="selectionLengthLocked" :edge-selected="selectedEdges.length > 0 || selectedShapes.length > 0"
                    :rules="selectedConstraintRuleItems" :constraint-limit="constraintLimit" :guide-snap-enabled="sketchGuideSnapEnabled" :auto-active="autoConstraintActive" :horizontal-active="horizontalConstraintActive" :vertical-active="verticalConstraintActive"
                    @constraint="applySketchConstraint" @lock="toggleSketchPointLock" @delete-rule="deleteSelectedConstraintRule" @update:constraint-limit="constraintLimit = $event" @update:guide-snap-enabled="sketchGuideSnapEnabled = $event" />
                <SketchHints v-if="sketchMode && !overlayActive" :profile-type="sketchType" :selection-tool="sketchSelectionTool" />

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
                <div v-if="!sketchMode" class="viewport-status"><div>{{ stats.objects }} 实体 · {{ stats.triangles.toLocaleString() }} 三角面</div></div>
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

<style lang="scss" scoped>
.viewport-area.symmetry-active :deep(.viewport > canvas) { opacity: .1; }
</style>
