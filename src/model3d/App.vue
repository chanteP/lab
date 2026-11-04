<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useStorage, useWindowSize } from '@vueuse/core';
import * as THREE from 'three';
import { NButton, NIcon, NInput, NModal, NSelect, useMessage } from 'naive-ui';
import {
    AnalyticsOutline, CloseOutline, CubeOutline, EllipseOutline, EyeOutline, LayersOutline,
    ShapesOutline, TrashOutline, ScanOutline,
} from '@vicons/ionicons5';
import { Viewport, type SketchDimension, type ViewTool, type ViewportCallbacks } from './engine/Viewport';
import ViewportView from './components/viewport/Viewport.vue';
import EntityTree, { type OutlinerNode } from './components/entity/EntityTree.vue';
import SvgIcon from './components/ui/SvgIcon.vue';
import { entityProfileClosed } from './engine/profiles';
import { borderSegments } from './engine/sketchBorders';
import { useUndoHistory } from './composables/useUndoHistory';
import { useProjectLibrary } from './composables/useProjectLibrary';
import { useDocumentEntities } from './composables/useDocumentEntities';
import { useModelingOperations } from './composables/useModelingOperations';
import { useEdgeTreatmentOperations } from './composables/useEdgeTreatmentOperations';
import { useSketchState } from './composables/sketch/useSketchState';
import { useSketchConstraints } from './composables/sketch/useSketchConstraints';
import { useSketchEditing } from './composables/sketch/useSketchEditing';
import { useSketchSession } from './composables/sketch/useSketchSession';
import { useSketchAdvanced } from './composables/sketch/useSketchAdvanced';
import { useSketchAssets } from './composables/sketch/useSketchAssets';
import { storedLengthUnit, useUnits } from './composables/useUnits';
import EntitySidebar from './components/layout/EntitySidebar.vue';
import ModelingToolbar from './components/modeling/ModelingToolbar.vue';
import SketchToolbar from './components/sketch/SketchToolbar.vue';
import SketchConstraints from './components/sketch/SketchConstraints.vue';
import SketchHints from './components/sketch/SketchHints.vue';
import SketchAdvancedOverlay from './components/sketch/SketchAdvancedOverlay.vue';
import ToolPanels from './components/modeling/ToolPanels.vue';
import ModelingOperationBar from './components/modeling/ModelingOperationBar.vue';
import ModelingHints from './components/modeling/ModelingHints.vue';
import ViewportUtilities from './components/viewport/ViewportUtilities.vue';
import SectionControl from './components/viewport/SectionControl.vue';
import { SIDEBAR_LAYOUT, STORAGE_KEYS } from './config/const';
import { DISPLAY_MODES, LENGTH_UNITS, normalizeDisplayMode } from './config/configs';
import { computeSketchFaces } from './engine/sketchFaces';
import {
    createDocument,
    type DisplayMode, type ModelDocument, type ModelEntity, type Point2, type Vec3, type PrimaryPanel, type SelectionKind,
} from './types';

const message = useMessage();
let viewport: Viewport;
let transforming = false;

const { width: windowWidth } = useWindowSize();
const sidebarWidth = useStorage(STORAGE_KEYS.sidebarWidth, SIDEBAR_LAYOUT.minWidthPx);
const sidebarMaxWidth = computed(() => Math.max(SIDEBAR_LAYOUT.minWidthPx, windowWidth.value * SIDEBAR_LAYOUT.maxViewportRatio));
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
const selectedProfileFace = ref<Point2[] | null>(null);
const selectedFacePlanar = ref(false);
const viewportMenu = ref<{ x: number; y: number; id: string | null } | null>(null);
const activePanel = ref<PrimaryPanel | null>(null);
const selectionKind = ref<SelectionKind>(null);
const parameterCardOpen = ref(true);
const isolateActive = ref(false);
const sectionActive = ref(false);
const sectionOffset = ref(0);
const sectionLimit = ref(100);
const displayMode = ref<DisplayMode>(normalizeDisplayMode(localStorage.getItem(STORAGE_KEYS.displayMode)));
let displayModeBeforeSketch: DisplayMode = displayMode.value;
const showEdges = ref(true);
const selectThrough = ref(false);
const includeTangent = ref(false);

const selectedEntities = computed(() => selectedIds.value.map((id) => document.value.entities.find((item) => item.id === id)).filter(Boolean) as ModelEntity[]);
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
const hintSketchEntity = computed(() => {
    const id = selectedShapes.value[selectedShapes.value.length - 1]
        || selectedEdges.value[selectedEdges.value.length - 1]?.entityId
        || selectedPoints.value[selectedPoints.value.length - 1]?.entityId
        || trimmedSelection.value?.entityId
        || editingSketchId.value;
    return document.value.entities.find((entity) => entity.id === id) || null;
});
const hintSketchProfileType = computed(() => hintSketchEntity.value?.trimmed ? 'trimmed' as const : hintSketchEntity.value?.profileType || null);
const hintSketchHasSelection = computed(() => !!(selectedShapes.value.length || selectedEdges.value.length || selectedPoints.value.length || trimmedSelection.value || (sketchSelectionTool.value && editingSketchId.value)));
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
    operation, historyEditId, canBoolean, booleanCanCommit, extrudeBody, booleanDraft, operationTargets,
    createPrimitive, applyBoolean, startExtrude, updateExtrude, updateExtrudeLength, onExtrudeGesture,
    updateExtrudeResult, toggleBooleanOperand, doneOperation, cancelOperation, editHistory,
    updateFaceOffsetInput, onDirectEdit, finishDirectEdit, cancelDirectEdit,
} = useModelingOperations({
    document, selectedIds, selectedEntities, selected, selectionKind, activeTool, activePanel,
    parameterCardOpen, lastFace, viewport: () => viewport, message, pushHistory, popHistory, inputLength, setTool,
    profileFace: () => selectedProfileFace.value,
    startSketch: (editProfile) => sketchSession.startSketch(editProfile),
});
const {
    onEdgeTreatmentEdit, updateEdgeTreatmentDistance, finishEdgeTreatment, cancelEdgeTreatment,
} = useEdgeTreatmentOperations({
    document, activeTool, viewport: () => viewport, message, pushHistory, popHistory, setTool,
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
    treeNodes, contextMenu,
    selectEntity, updateEntity, updateLengthEntity,
    removeSelected, removeConstraintsForEdge, removeConstraintsForEntity,
    createFolder, openNodeContext, renameNode, deleteContextNodes, reparentNodes,
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
const sketchAssets = useSketchAssets({
    document, selectedIds, selectedShapes, activePlaneId, viewport: () => viewport, message, pushHistory, popHistory,
    clearSketchSelection, selectSketchEntity, refreshSketch,
});
const {
    selectedAssetId, selectedAsset, onSketchAssetCorner, onSketchAssetDimension,
    toggleAssetAspect, onSketchDrop,
} = sketchAssets;
const sketchAdvanced = useSketchAdvanced({
    document, activePlaneId, activeTool, sketchType, sketchSides, sketchSelectionTool, sketchGuideSnapEnabled, selectedShapes, selectedIds, lengthUnit, setLengthUnit,
    viewport: () => viewport, message, pushHistory, setTransforming: (value) => transforming = value,
    refreshSketch, syncSketchFromDocument: sketchConstraints.syncLocalSketchFromDocument, selectSketchEntity, clearSketchSelection, activateSketchSelectionTool,
});
const { symmetry, symmetryActive, overlayActive } = sketchAdvanced;
const canDraw = computed(() => !!activePlane.value && selectedIds.value.includes(activePlane.value.id));

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
    if (sketchMode.value) return;
    setSectionActive(!sectionActive.value);
}
function setSectionActive(active: boolean) {
    sectionActive.value = active;
    if (active) {
        sectionLimit.value = Math.max(1, viewport?.getSectionRadius() || 100);
        sectionOffset.value = 0;
    }
    viewport?.setSection(active, sectionOffset.value);
}
function updateSectionOffset(value: number) {
    sectionOffset.value = value;
    viewport?.setSectionOffset(value);
}
function updateDisplayMode(mode: DisplayMode) {
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
function undoModel() { cancelDirectEdit(); cancelEdgeTreatment(); viewport?.clearGeometrySelection(); undo(); }
function redoModel() { cancelDirectEdit(); cancelEdgeTreatment(); viewport?.clearGeometrySelection(); redo(); }

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
    finishDirectEdit();
    finishEdgeTreatment();
    if (operation.value && activeTool.value !== tool) doneOperation();
    stopMeasure();
    if (sketchMode.value) cancelSketch();
    activeTool.value = tool;
    viewport?.setTool(tool);
}
function selectFromItems(id: string | null, additive: boolean) {
    finishDirectEdit();
    finishEdgeTreatment();
    if (!id) {
        selectEntity(null);
        selectionKind.value = null;
        activePanel.value = null;
        return;
    }
    if (document.value.planes.some((plane) => plane.id === id)) { selectPlane(id); return; }
    if (sketchMode.value && (['sketch', 'image'].includes(document.value.entities.find((item) => item.id === id)?.kind || '') || document.value.folders.find((folder) => folder.id === id)?.kind === 'svg')) {
        selectEntity(id, additive);
        selectionKind.value = 'sketch';
        activePanel.value = null;
        return;
    }
    selectEntity(id, additive);
    selectionKind.value = additive ? 'mixed' : 'body';
    activePanel.value = null;
    parameterCardOpen.value = true;
    if (additive) return;
    const entity = document.value.entities.find((item) => item.id === id);
    if (entity?.kind === 'sketch') { selectionKind.value = 'sketch'; setTool('select'); }
    else if (entity && entity.kind !== 'boolean') setTool('translate');
}
function selectRangeFromItems(ids: string[]) {
    finishDirectEdit();
    if (!ids.length) return;
    if (sketchMode.value) {
        clearSketchSelection();
        ids.forEach((id) => selectSketchEntity(id, true));
        selectionKind.value = 'sketch';
        return;
    }
    selectedIds.value = ids;
    selectionKind.value = ids.length === 1 ? 'body' : 'mixed';
    activePanel.value = null;
    parameterCardOpen.value = true;
    setTool('select');
}
function onGeometrySelect(id: string, type: 'face' | 'edge' | 'vertex', normal: Vec3, point: Vec3, additive = false, profileFace?: Point2[]) {
    finishDirectEdit();
    finishEdgeTreatment();
    const picked = document.value.entities.find((item) => item.id === id);
    if (['edge', 'vertex'].includes(type)) viewport?.resolveGeometryEdgeTreatment();
    if (operation.value?.type === 'extrude' && picked && picked.kind !== 'sketch' && picked.id !== operation.value.bodyId) {
        operation.value.targetId = id;
        return;
    }
    lastFace.value = { bodyId: id, normal, point };
    selectedProfileFace.value = profileFace?.map((point) => [...point]) || null;
    selectedFacePlanar.value = type === 'face' && !!viewport?.getGeometryAnchor()?.planar;
    selectEntity(id, additive);
    selectionKind.value = additive ? 'mixed' : picked && ['sketch', 'image'].includes(picked.kind) ? 'sketch' : type;
    activePanel.value = null;
    parameterCardOpen.value = true;
    if (additive) { setTool('select'); return; }
    setTool('select');
}
function onBodySelect(id: string) {
    finishDirectEdit();
    finishEdgeTreatment();
    selectEntity(id);
    if (['sketch', 'image'].includes(document.value.entities.find((item) => item.id === id)?.kind || '')) {
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
    cancelOperation();
}
function updateBooleanKeep(key: 'keepTarget', value: boolean) {
    if (booleanDraft.value) booleanDraft.value[key] = value;
}
function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
    if ((event.metaKey || event.ctrlKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(event.code)) { event.preventDefault(); return; }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') { event.preventDefault(); flushSave(); return; }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redoModel() : undoModel(); return; }
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
    if (!ids.length) selectedProfileFace.value = null;
    viewport?.setSelected(active ? shapes : ids, active ? 'sketch' : kind);
    if (!active && !['face', 'edge', 'vertex'].includes(kind || '') && !selectedProfileFace.value) viewport?.clearGeometrySelection();
}, { deep: true });
watch([selectedEdges, selectedPoints, sketchMode], ([edges, points]) => viewport?.setSketchSelectionState(edges, points), { deep: true });
watch(selectedAssetId, (id) => viewport?.setSketchAssetSelection(id));
watch(() => project.value.name, scheduleSave);
watch(constraintLimit, (value) => localStorage.setItem(STORAGE_KEYS.constraintLimit, String(value)));
watch(sketchGuideSnapEnabled, (value) => viewport?.setSketchGuideSnapEnabled(value));
watch(sketchMode, (active) => {
    if (active) {
        if (sectionActive.value) setSectionActive(false);
        displayModeBeforeSketch = displayMode.value;
        updateDisplayMode('shaded');
    } else {
        updateDisplayMode(displayModeBeforeSketch);
        if (symmetryActive.value) sketchAdvanced.cancelSymmetry();
    }
});
watch(gridVisible, (value) => viewport?.setGridVisible(value));
watch(shadowVisible, (value) => viewport?.setShadowsVisible(value));
watch(showEdges, (value) => viewport?.setDisplayMode(displayMode.value, value));
watch(displayMode, (value) => localStorage.setItem(STORAGE_KEYS.displayMode, value));
watch([sidebarWidth, sidebarMaxWidth], ([width, maxWidth]) => {
    const nextWidth = Number.isFinite(width) ? Math.round(Math.min(maxWidth, Math.max(SIDEBAR_LAYOUT.minWidthPx, width))) : SIDEBAR_LAYOUT.minWidthPx;
    if (nextWidth !== width) sidebarWidth.value = nextWidth;
}, { immediate: true });
watch(selectThrough, (value) => viewport?.setSelectThrough(value));
watch(includeTangent, (value) => viewport?.setIncludeTangent(value));
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

const handleDirectEdit: ViewportCallbacks['onDirectEdit'] = (id, normal, delta, phase, anchor) => {
    if (['edge', 'vertex'].includes(anchor?.type || '') || ['fillet', 'chamfer'].includes(activeTool.value)) onEdgeTreatmentEdit(id, normal, delta, phase, anchor);
    else onDirectEdit(id, normal, delta, phase, anchor);
};

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
        onDirectEdit: handleDirectEdit,
        onDirectDragState: () => undefined,
        onSketchPoint: addSketchPoint,
        onSketchPointMove: moveSketchPoint,
        onSketchAssetCorner,
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
        onSketchDimension: (target: SketchDimension, value: number) => target.assetId ? onSketchAssetDimension(target, value) : onSketchDimension(target, value),
        onSketchDragEnd: refreshSketch,
        onLengthUnitChange: setLengthUnit,
        onDirectDistance: (value) => ['edge', 'vertex'].includes(selectionKind.value || '') ? updateEdgeTreatmentDistance(value) : updateFaceOffsetInput(value),
        onExtrudeDistance: updateExtrudeLength,
        onExtrudeGesture,
        onBlankCommit,
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
        onBooleanToggle: toggleBooleanOperand,
        onBooleanHover: (id) => viewport?.setBooleanHover(id),
};

function onViewportReady(instance: Viewport) {
    viewport = instance;
    viewport.setSketchAssetSelection(selectedAssetId.value);
}

onMounted(async () => {
    viewport.sync(document.value);
    viewport.setLengthUnit(lengthUnit.value);
    viewport.setDisplayMode(displayMode.value, showEdges.value);
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
        <div class="workspace" :style="{ '--model3d-sidebar-width': `${sidebarWidth}px` }">
            <EntitySidebar v-model:width="sidebarWidth" :max-width="sidebarMaxWidth" :visible="true" :projects="projects" :project-id="project.id" :nodes="treeNodes" :selected-ids="selectedIds" :special-mode="sketchMode || symmetryActive"
                :project-name="project.name" :saving="saveState === 'saving'" :can-undo="canUndo" :can-redo="canRedo" :exporting="exporting" :export-quality="exportQuality"
                @open="openProject" @create="showNewProject = true" @duplicate="duplicateProject" @import="importProject" @remove="removeProject" @folder="createFolder"
                @select="selectFromItems" @activate="activateTreeNode" @select-range="selectRangeFromItems" @rename="renameNode" @context="openNodeContext" @drop="reparentNodes" @toggle="toggleNodeVisibility"
                @name="project.name = $event" @undo="undoModel" @redo="redoModel" @help="showHelp = true" @quality="exportQuality = $event" @export="onExportAction" />

            <main class="viewport-area" :class="{ 'drawing-active': sketchMode, 'symmetry-active': symmetryActive }" @dragover="sketchMode && $event.preventDefault()" @drop="sketchMode && onSketchDrop($event)">
                <ViewportView :callbacks="viewportCallbacks" :suspended="overlayActive" @ready="onViewportReady" />
                <SketchAdvancedOverlay v-if="sketchMode && overlayActive" :advanced="sketchAdvanced" />
                <ModelingToolbar :active-panel="activePanel" :active-tool="activeTool" :sketch-mode="sketchMode" :isolate-active="isolateActive"
                    :selection-kind="selectionKind" :can-isolate="isolateActive || selectedIds.length > 0" :can-boolean="canBoolean" :selected-count="selectedIds.length" :history-steps="historySteps"
                    @panel="togglePanel" @sketch="beginSketch()" @construct="constructPlane" @tool="chooseTool" @isolate="toggleIsolate"
                    @history="editHistory" @boolean="applyBoolean" />
                <SectionControl v-if="sectionActive && !sketchMode" :value="sectionOffset" :limit="sectionLimit" :length-unit="lengthUnit" :display-length="displayLength" @update="updateSectionOffset" />

                <ToolPanels :active-panel="activePanel" :sketch-mode="sketchMode" :operation="operation" :selected-entities="selectedEntities"
                    :selection-kind="selectionKind" :active-tool="activeTool" :can-boolean="canBoolean" v-model:select-through="selectThrough" v-model:include-tangent="includeTangent" :selected-face-planar="selectedFacePlanar"
                    :parameter-card-open="parameterCardOpen" :display-length="displayLength"
                    @close-panel="activePanel = null" @command="runCommand" @primitive="createPrimitive" @import="importProject" @create-plane="createPlane"
                    @tool="chooseTool" @sketch="beginSketch()" @boolean="applyBoolean" @clear-selection="selectEntity(null)" @extrude-hint="message.info('请拖动视图中的上下粗箭头进行拉伸')"
                    @update-dimension="updateLengthEntity" @update-color="updateEntity('color', $event)" />

                <SketchToolbar :sketch-mode="sketchMode" :active-panel="activePanel" :selection-tool="sketchSelectionTool" :sketch-type="sketchType" :sides="sketchSides" :active-tool="activeTool" :symmetry-step="symmetry?.step || null"
                    :planes="document.planes" :selection-kind="selectionKind" :has-selection="hintSketchHasSelection" @close="sketchMode ? closeSketchMode() : activePanel = null" @select="chooseSketchSelection"
                    @type="chooseSketchType" @sides="setSketchSides" @plane="beginSketch" @construct="createPlaneAndSketch" @face="beginSketch()" @symmetry="startSymmetry" @transform="chooseSketchTransform" />
                <SketchConstraints v-if="sketchMode && !symmetryActive" :segment-count="constraintSegmentCount" :selected-point="selectedSketchPoint" :selection-locked="selectionLocked" :length-locked="selectionLengthLocked" :edge-selected="selectedEdges.length > 0 || selectedShapes.length > 0"
                    :rules="selectedConstraintRuleItems" :constraint-limit="constraintLimit" :asset-selected="!!selectedAsset" :aspect-locked="selectedAsset?.aspectLocked ?? true" :guide-snap-enabled="sketchGuideSnapEnabled" :auto-active="autoConstraintActive" :horizontal-active="horizontalConstraintActive" :vertical-active="verticalConstraintActive"
                    @constraint="applySketchConstraint" @lock="toggleSketchPointLock" @aspect="toggleAssetAspect" @delete-rule="deleteSelectedConstraintRule" @update:constraint-limit="constraintLimit = $event" @update:guide-snap-enabled="sketchGuideSnapEnabled = $event" />
                <SketchHints v-if="sketchMode && !overlayActive && !measureMode" :profile-type="sketchType" :selection-tool="sketchSelectionTool"
                    :selected-profile-type="hintSketchProfileType" :has-selection="hintSketchHasSelection" />
                <ModelingHints v-if="!sketchMode" :selection-kind="selectionKind" :active-tool="activeTool" :selected-count="selectedIds.length" :measure-mode="measureMode" :operation="operation" />

                <div class="viewport-caption"><span v-if="sectionActive" class="mode-badge">剖视</span><span v-if="isolateActive" class="mode-badge">隔离</span><NSelect class="unit-select" size="small" aria-label="全局长度单位" :value="lengthUnit" :options="LENGTH_UNITS" :consistent-menu-width="false" @update:value="setLengthUnit" /></div>

                <ModelingOperationBar v-if="operation && !sketchMode" :operation="operation" :extrude-body="extrudeBody" :boolean-draft="booleanDraft" :history-edit-id="historyEditId" :boolean-can-commit="booleanCanCommit"
                    :operation-targets="operationTargets"
                    @close="closeOperationBar" @done="doneOperation" @update-extrude="updateExtrude"
                    @update-extrude-result="updateExtrudeResult" @update-extrude-target="operation?.type === 'extrude' && (operation.targetId = $event)"
                    @update-boolean-keep="updateBooleanKeep" />

                <ViewportUtilities :measure-mode="measureMode" :section-active="sectionActive" :sketch-mode="sketchMode" :projection-mode="projectionMode" :scale-bar="scaleBar" :scale-bar-label="scaleBarLabel"
                    :display-mode="displayMode" :show-edges="showEdges" :shadow-visible="shadowVisible" :grid-visible="gridVisible"
                    @measure="toggleMeasure" @section="toggleSection" @fit="fitView" @projection="toggleProjection" @display-mode="updateDisplayMode"
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
.viewport-caption .unit-select { width: 62px; pointer-events: auto; }
.viewport-caption .unit-select :deep(.n-base-selection) {
    --n-height: 24px !important;
    --n-font-size: 10px !important;
    --n-border: 1px solid transparent !important;
    --n-border-hover: 1px solid var(--model3d-ui-d4dfd8) !important;
    --n-border-active: 1px solid var(--model3d-ui-9cc8bb) !important;
    --n-border-focus: 1px solid var(--model3d-ui-9cc8bb) !important;
    --n-box-shadow-focus: none !important;
    --n-color: transparent !important;
    --n-color-active: var(--model3d-ui-surface90) !important;
}
</style>
