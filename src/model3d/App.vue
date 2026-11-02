<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { NButton, NIcon, NInput, NModal, useMessage } from 'naive-ui';
import {
    AnalyticsOutline, CloseOutline, CubeOutline, EllipseOutline, EyeOutline, LayersOutline,
    ShapesOutline, TrashOutline, PencilOutline, ScanOutline,
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
import ToolPanels from './components/modeling/ToolPanels.vue';
import ModelingOperationBar from './components/modeling/ModelingOperationBar.vue';
import ViewportUtilities from './components/viewport/ViewportUtilities.vue';
import SectionControl from './components/viewport/SectionControl.vue';
import DirectBooleanToggle from './components/viewport/DirectBooleanToggle.vue';
import { STORAGE_KEYS } from './config/const';
import { computeSketchFaces } from './engine/sketchFaces';
import {
    createDocument,
    type BooleanOperation, type ModelDocument, type ModelEntity, type Vec3, type PrimaryPanel, type SelectionKind,
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
const isolateActive = ref(false);
const sectionActive = ref(false);
const sectionOffset = ref(0);
const sectionLimit = ref(100);
const directDragPosition = ref({ x: 0, y: 0 });
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
    operation, historyEditId, canBoolean, extrudeBody, booleanDraft, operationTargets, directBooleanMode, directBooleanAvailable,
    createPrimitive, applyBoolean, startExtrude, updateExtrude, updateExtrudeLength, onExtrudeGesture,
    updateExtrudeResult, swapBooleanRoles, doneOperation, cancelOperation, editHistory,
    updateFaceOffsetInput, onDirectEdit, updateDirectBooleanMode,
} = useModelingOperations({
    document, selectedIds, selectedEntities, selected, selectionKind, activeTool, activePanel,
    parameterCardOpen, lastFace, viewport: () => viewport, message, pushHistory, popHistory, inputLength, setTool,
    startSketch: (editProfile) => sketchSession.startSketch(editProfile),
});
const uiState = computed(() => sketchMode.value ? 'Sketch' : historyEditId.value ? 'HistoryEdit' : operation.value ? 'ToolActive' : selectedIds.value.length ? 'SelectionAdaptive' : 'Default');
const historySteps = computed(() => document.value.entities.flatMap((item) => {
    const steps = ['sketch', 'extrude', 'boolean'].includes(item.kind) ? [{ id: item.id, name: item.name, kind: item.kind as string }] : [];
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
    selectEntity, updateEntity, updateLengthEntity, updateVector,
    removeSelected, removeConstraintsForEdge, removeConstraintsForEntity,
    createFolder, openNodeContext, requestRename, applyRename, deleteContextNodes, reparentNodes,
    createPlane, constructPlane, createPlaneAndSketch, selectPlane, activateTreeNode,
    toggleNodeVisibility,
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
    openSketchContext, deleteSketchFromContext, addSketchPoint,
    moveSketchPoint, finishSketchHandleDrag, moveSketchCenter, deleteSketchPoint, deleteSketchBorder,
    selectSketchSegment, moveSketchHandle, resetSketchHandle, selectSketchPoint,
    selectSketchPointRef, dragSketch, closeSketchPath, setSketchSides,
} = sketchEditing;
const sketchSession = useSketchSession({
    document, selectedIds, selected, selectionKind, activeTool, activePlaneId, lastFace, lengthUnit,
    state: sketchState, constraints: sketchConstraints, editing: sketchEditing,
    viewport: () => viewport, message, pushHistory, setTool,
    canDraw: () => canDraw.value, isTransforming: () => transforming,
});
const {
    startSketch, refreshSketch, setSketchType,
    onSketchSectorMove, resetSketchSector, onSketchDimension, finishSketch, closeSketch,
    cancelSketch, cancelSketchRefresh,
} = sketchSession;
const sketchAdvanced = useSketchAdvanced({
    document, activePlaneId, activeTool, sketchType, sketchSides, sketchSelectionTool, sketchGuideSnapEnabled, selectedShapes, selectedIds, lengthUnit, setLengthUnit,
    viewport: () => viewport, message, pushHistory, setTransforming: (value) => transforming = value,
    refreshSketch, syncSketchFromDocument: sketchConstraints.syncLocalSketchFromDocument, selectSketchEntity, clearSketchSelection, activateSketchSelectionTool,
});
const { symmetry, symmetryActive, overlayActive } = sketchAdvanced;
const canDraw = computed(() => !!activePlane.value && selectedIds.value.includes(activePlane.value.id));
const contextVisible = computed(() => parameterCardOpen.value && !sketchMode.value && (operation.value?.type === 'extrude' || (!!selected.value && selected.value.kind !== 'sketch') || (selectedEntities.value.length > 1 && selectedSketches.value.length !== selectedEntities.value.length) || activeTool.value === 'offsetFace'));
const visibleEntityCount = computed(() => document.value.entities.filter((item) => item.kind !== 'sketch').length);

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
    stopMeasure();
    activeTool.value = tool;
    sketchSelectionTool.value = true;
    viewport?.setTool(tool);
    viewport?.setSketchSelectionTool(true);
}
function chooseSketchSelection() {
    if (symmetry.value && symmetry.value.step !== 3) return;
    stopMeasure();
    activeTool.value = 'select';
    viewport?.setTool('select');
    activateSketchSelectionTool();
}
function chooseSketchType(type: typeof sketchType.value) {
    if (symmetry.value && symmetry.value.step !== 3) return;
    stopMeasure();
    activeTool.value = 'select';
    viewport?.setTool('select');
    setSketchType(type);
}
function closeSketchMode() {
    stopMeasure();
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
    if (id === 'tools') return togglePanel('tools');
    activePanel.value = null;
    if (id === 'sketch') return beginSketch();
    if (id === 'extrude' && selected.value?.kind === 'sketch') return startExtrude(selected.value.id);
    if (id === 'extrude') return message.warning('请先选择闭合 Sketch profile');
    if (['offsetFace', 'translate', 'scale'].includes(id)) return chooseTool(id as ViewTool);
    if (id === 'plane') return createPlane();
    if (['box', 'cylinder', 'sphere'].includes(id)) return createPrimitive(id as 'box' | 'cylinder' | 'sphere');
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
    if (sectionActive.value) {
        sectionLimit.value = Math.max(1, viewport?.getSectionRadius() || 100);
        sectionOffset.value = 0;
    }
    viewport?.setSection(sectionActive.value, sectionOffset.value);
}
function updateSectionOffset(value: number) {
    sectionOffset.value = value;
    viewport?.setSectionOffset(value);
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
    if (activeTool.value === 'offsetFace') {
        setTool('select');
        parameterCardOpen.value = false;
        return;
    }
    selectEntity(null);
}

function setTool(tool: ViewTool) {
    if (operation.value && activeTool.value !== tool) cancelOperation();
    stopMeasure();
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
        return;
    }
    lastFace.value = { bodyId: id, normal, point };
    selectEntity(id, additive);
    selectionKind.value = additive ? 'mixed' : picked?.kind === 'sketch' ? 'sketch' : type;
    activePanel.value = null;
    parameterCardOpen.value = true;
    if (additive) { setTool('select'); return; }
    setTool('select');
}
function onBodySelect(id: string) {
    selectEntity(id);
    if (document.value.entities.find((item) => item.id === id)?.kind === 'sketch') {
        selectionKind.value = 'sketch';
        setTool('select');
        return;
    }
    selectionKind.value = 'body';
    activePanel.value = null;
    parameterCardOpen.value = true;
    setTool('translate');
}
function toggleMeasure() {
    if (measureMode.value) return stopMeasure();
    if (sketchMode.value) {
        chooseSketchSelection();
        clearSketchSelection();
    } else setTool('select');
    measureMode.value = true;
    viewport?.setMeasureMode(true);
}
function stopMeasure() {
    if (!measureMode.value) return;
    measureMode.value = false;
    viewport?.setMeasureMode(false);
}
function startSymmetry() {
    stopMeasure();
    sketchAdvanced.startSymmetry();
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
function closeOperationBar() {
    if (operation.value) cancelOperation();
    else parameterCardOpen.value = false;
}
function updateBooleanOperation(value: BooleanOperation) {
    if (!booleanDraft.value) return;
    const entity = document.value.entities.find((item) => item.id === booleanDraft.value!.resultId);
    if (entity) entity.operation = value;
}
function updateBooleanKeep(key: 'keepTarget' | 'keepTool', value: boolean) {
    if (booleanDraft.value) booleanDraft.value[key] = value;
}
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
    else if (event.code === 'KeyF') viewport?.fit();
}

watch(document, () => {
    if (!transforming) viewport?.sync(document.value);
    if (sectionActive.value) {
        sectionLimit.value = Math.max(1, viewport?.getSectionRadius() || 100);
        if (Math.abs(sectionOffset.value) > sectionLimit.value) updateSectionOffset(Math.sign(sectionOffset.value) * sectionLimit.value);
    }
    scheduleSave();
}, { deep: true });
watch([selectedIds, selectedShapes, sketchMode, selectionKind], ([ids, shapes, active, kind]) => {
    viewport?.setSelected(active ? shapes : ids);
    if (!active && kind !== 'face' && kind !== 'edge') viewport?.clearGeometrySelection();
}, { deep: true });
watch([selectedEdges, selectedPoints, sketchMode], ([edges, points]) => viewport?.setSketchSelectionState(edges, points), { deep: true });
watch(() => project.value.name, scheduleSave);
watch(constraintLimit, (value) => localStorage.setItem(STORAGE_KEYS.constraintLimit, String(value)));
watch(sketchGuideSnapEnabled, (value) => viewport?.setSketchGuideSnapEnabled(value));
watch(sketchMode, (active) => { if (!active && symmetryActive.value) sketchAdvanced.cancelSymmetry(); });
watch(gridVisible, (value) => viewport?.setGridVisible(value));
watch(shadowVisible, (value) => viewport?.setShadowsVisible(value));
watch(showEdges, (value) => viewport?.setDisplayMode(displayMode.value, value));
watch(() => [sketchMode.value, activePlaneId.value] as const, ([active]) => {
    if (!active) stopMeasure();
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
        onDirectDragState: (state) => { directDragPosition.value = { x: state.x, y: state.y }; },
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
            <EntitySidebar :visible="true" :projects="projects" :project-id="project.id" :nodes="treeNodes" :selected-ids="selectedIds" :entity-count="visibleEntityCount"
                @open="openProject" @create="showNewProject = true" @duplicate="duplicateProject" @import="importProject" @remove="removeProject" @folder="createFolder"
                @select="selectFromItems" @activate="activateTreeNode" @context="openNodeContext" @drop="reparentNodes" @toggle="toggleNodeVisibility" />

            <main class="viewport-area" :class="{ 'drawing-active': sketchMode, 'symmetry-active': symmetryActive }">
                <ViewportView :callbacks="viewportCallbacks" :suspended="overlayActive" @ready="onViewportReady" />
                <SketchAdvancedOverlay v-if="sketchMode && overlayActive" :advanced="sketchAdvanced" />
                <ModelingToolbar :active-panel="activePanel" :active-tool="activeTool" :sketch-mode="sketchMode" :section-active="sectionActive" :isolate-active="isolateActive"
                    :selection-kind="selectionKind" :can-isolate="isolateActive || selectedIds.length > 0" :history-steps="historySteps"
                    @panel="togglePanel" @sketch="beginSketch()" @construct="constructPlane" @tool="chooseTool" @section="toggleSection" @isolate="toggleIsolate"
                    @history="editHistory" />
                <SectionControl v-if="sectionActive && !sketchMode" :value="sectionOffset" :limit="sectionLimit" :length-unit="lengthUnit" :display-length="displayLength" @update="updateSectionOffset" />
                <DirectBooleanToggle v-if="directBooleanAvailable" :x="directDragPosition.x" :y="directDragPosition.y" :mode="directBooleanMode" @update="updateDirectBooleanMode" />

                <ToolPanels :active-panel="activePanel" :sketch-mode="sketchMode" :operation="operation" :selected-ids="selectedIds" :selected-entities="selectedEntities"
                    :selection-kind="selectionKind" :active-tool="activeTool" :can-boolean="canBoolean"
                    @close-panel="activePanel = null" @command="runCommand" @primitive="createPrimitive" @import="importProject" @create-plane="createPlane"
                    @tool="chooseTool" @sketch="beginSketch()" @boolean="applyBoolean" @clear-selection="selectEntity(null)" @extrude-hint="message.info('请拖动视图中的上下粗箭头进行拉伸')" />

                <SketchToolbar :sketch-mode="sketchMode" :active-panel="activePanel" :selection-tool="sketchSelectionTool" :sketch-type="sketchType" :sides="sketchSides" :active-tool="activeTool" :symmetry-step="symmetry?.step || null"
                    :planes="document.planes" :selection-kind="selectionKind" @close="sketchMode ? closeSketchMode() : activePanel = null" @select="chooseSketchSelection"
                    @type="chooseSketchType" @sides="setSketchSides" @plane="beginSketch" @construct="createPlaneAndSketch" @face="beginSketch()" @symmetry="startSymmetry" @transform="chooseSketchTransform" />
                <SketchConstraints v-if="sketchMode && !symmetryActive" :segment-count="constraintSegmentCount" :selected-point="selectedSketchPoint" :selection-locked="selectionLocked" :length-locked="selectionLengthLocked" :edge-selected="selectedEdges.length > 0 || selectedShapes.length > 0"
                    :rules="selectedConstraintRuleItems" :constraint-limit="constraintLimit" :guide-snap-enabled="sketchGuideSnapEnabled" :auto-active="autoConstraintActive" :horizontal-active="horizontalConstraintActive" :vertical-active="verticalConstraintActive"
                    @constraint="applySketchConstraint" @lock="toggleSketchPointLock" @delete-rule="deleteSelectedConstraintRule" @update:constraint-limit="constraintLimit = $event" @update:guide-snap-enabled="sketchGuideSnapEnabled = $event" />
                <SketchHints v-if="sketchMode && !overlayActive && !measureMode" :profile-type="sketchType" :selection-tool="sketchSelectionTool" />

                <div class="viewport-caption"><span v-if="sectionActive" class="mode-badge">剖视</span><span v-if="isolateActive" class="mode-badge">隔离</span><span class="axis-dot"></span>{{ lengthUnit }}</div>

                <ModelingOperationBar v-if="contextVisible" :operation="operation" :extrude-body="extrudeBody" :boolean-draft="booleanDraft" :history-edit-id="historyEditId"
                    :operation-targets="operationTargets" :document="document" :selected="selected" :selected-entities="selectedEntities" :active-tool="activeTool" :display-length="displayLength" :input-length="inputLength"
                    @close="closeOperationBar" @done="doneOperation" @cancel="cancelOperation" @update-extrude-length="updateExtrudeLength" @update-extrude="updateExtrude"
                    @update-extrude-result="updateExtrudeResult" @update-extrude-target="operation?.type === 'extrude' && (operation.targetId = $event)"
                    @update-boolean-operation="updateBooleanOperation" @update-boolean-keep="updateBooleanKeep"
                    @swap-boolean-roles="swapBooleanRoles" @update-name="updateEntity('name', $event)"
                    @update-vector="updateVector" @update-face-offset="updateFaceOffsetInput" @update-dimension="updateLengthEntity" @update-color="updateEntity('color', $event)" @edit-profile="startSketch(true)" @boolean="applyBoolean" />

                <ViewportUtilities :measure-mode="measureMode" :projection-mode="projectionMode" :scale-bar="scaleBar" :scale-bar-label="scaleBarLabel"
                    :display-mode="displayMode" :show-edges="showEdges" :shadow-visible="shadowVisible" :grid-visible="gridVisible"
                    @measure="toggleMeasure" @fit="fitView" @projection="toggleProjection" @display-mode="updateDisplayMode"
                    @show-edges="showEdges = $event" @shadow-visible="shadowVisible = $event" @grid-visible="gridVisible = $event" />
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
                <section><strong>自适应建模</strong><p>点击选择面或轮廓线，拖动面上的箭头进行偏移，选择实体时可移动、旋转或缩放。再次点击当前工具只收起参数卡，不会退出工具；拖动手柄或输入尺寸才修改几何。</p></section>
                <section><strong>检查与历史</strong><p>隔离、剖视图和显示模式 用于检查模型；测量只读数。历史记录可回改草图、拉伸、布尔运算 和已有边处理参数。</p></section>
            </div>
        </NModal>
        <input ref="importInput" type="file" accept=".json,.model.json" hidden @change="onImportFile" />
    </div>
</template>

<style lang="scss" scoped>
.viewport-area.symmetry-active :deep(.viewport > canvas) { opacity: .1; }
</style>
