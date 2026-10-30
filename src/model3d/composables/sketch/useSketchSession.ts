import type { ComputedRef, Ref } from 'vue';
import * as THREE from 'three';
import { useMessage } from 'naive-ui';
import type { EditPhase, SketchDimension, Viewport, ViewTool } from '../../engine/Viewport';
import { profileArcCenter, profileEllipseAngle, type ProfileType } from '../../engine/profiles';
import { INTERACTION } from '../../config/const';
import { uid } from '../../utils/id';
import { cloneEntity, uniqueEntityName } from '../../utils/entity';
import {
    createEntity, type LengthUnit, type ModelDocument, type ModelEntity,
    type SelectionKind, type SketchPlane, type Vec3, type Point2,
} from '../../types';
import type { SketchState } from './useSketchState';
import type { SketchConstraints } from './useSketchConstraints';
import type { SketchEditing } from './useSketchEditing';

interface SketchSessionOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    selected: ComputedRef<ModelEntity | null>;
    selectionKind: Ref<SelectionKind>;
    activeTool: Ref<ViewTool>;
    activePlaneId: Ref<string | null>;
    lastFace: Ref<{ bodyId: string; normal: Vec3; point: Vec3 } | null>;
    lengthUnit: Ref<LengthUnit>;
    state: SketchState;
    constraints: SketchConstraints;
    editing: SketchEditing;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    setTool: (tool: ViewTool) => void;
    canDraw: () => boolean;
    isTransforming: () => boolean;
}

/** Sketch-mode lifecycle, draft persistence, dimensions and viewport refresh. */
export function useSketchSession(options: SketchSessionOptions) {
    const {
        document, selectedIds, selected, selectionKind, activeTool, activePlaneId, lastFace, lengthUnit,
        state, constraints, editing, viewport, message, pushHistory, setTool, canDraw, isTransforming,
    } = options;
    const {
        sketchMode, sketchType, sketchCurves, sketchSides, selectedSketchSegment, sketchPoints,
        sketchDepth, selectedSketchPoint, editingSketchId, trimmedSelection, sketchContextMenu,
        selectedSketchSegments, selectedShapes, selectedEdges, selectedPoints, sketchLockedPoints,
        sketchSectorAngle, sketchOpen, sketchProfileStartAngle, sketchAppendMode, sketchSelectionTool,
        sketchClosed,
    } = state;
    const { ensureShapeConstraints, syncEditingSketch } = constraints;
    const {
        clearSketchDragState, activateSketchSelectionTool, beginSketchHandleDrag, finishSketchHandleDrag,
    } = editing;
    let sketchRefreshFrame = 0;

    function startSketch(editProfile = false) {
        if (sketchMode.value) return;
        if (!canDraw() && !editProfile) return;
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
            viewport()?.setActivePlane(plane);
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
        viewport()?.setSketchEditing(editing?.id || null);
        viewport()?.setSketchMode(true, sketchPoints.value);
        viewport()?.setSketchSelectionTool(sketchSelectionTool.value);
        refreshSketch();
        viewport()?.normalToSketch();
    }
    function persistSketchProgress(resetAfter: boolean) {
        if (trimmedSelection.value) return;
        const ready = ['circle', 'regular'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : ['polygon', 'line'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : sketchPoints.value.length >= 3;
        if (!ready) return;
        let id = editingSketchId.value;
        if (!id) {
            pushHistory();
            const entity = createEntity('sketch', uid());
            entity.name = uniqueEntityName(document.value, 'sketch');
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
            ensureShapeConstraints(entity);
        }
        if (resetAfter) {
            selectedIds.value = [id!];
            sketchAppendMode.value = sketchType.value === 'polygon';
            viewport()?.setSketchEditing(id!);
            refreshSketch();
            activateSketchSelectionTool();
        }
    }
    function refreshSketch() {
        if (isTransforming()) {
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
        const trimmed = trimmedSelection.value;
        const controlPoints = trimmed ? (trimmed.kind === 'line' ? [0, 1] : [0, sketchPoints.value.length - 1]) : document.value.entities.find((entity) => entity.id === editingSketchId.value)?.controlPoints;
        viewport()?.setSketchEditing(editingSketchId.value);
        viewport()?.updateSketch(sketchPoints.value, selectedSketchPoint.value, sketchType.value, sketchCurves.value, sketchSides.value, selectedSketchSegment.value, sketchLockedPoints.value, sketchSectorAngle.value, lengthUnit.value, sketchOpen.value, sketchProfileStartAngle.value, controlPoints, trimmed?.kind === 'curve');
    }
    function setSketchType(type: ProfileType) {
        viewport()?.setSketchEdgeEditing(null);
        selectedShapes.value = [];
        selectedEdges.value = [];
        selectedPoints.value = [];
        trimmedSelection.value = null;
        sketchSelectionTool.value = false;
        viewport()?.setSketchSelectionTool(false);
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
        viewport()?.setSketchEditing(null);
        selectedSketchSegments.value = [];
        selectedSketchPoint.value = -1;
        selectedSketchSegment.value = -1;
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
        if (phase === 'end' || !isTransforming()) syncEditingSketch();
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
        if (trimmedSelection.value) {
            cancelSketch();
            return;
        }
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
            entity.name = uniqueEntityName(document.value, 'sketch');
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
        viewport()?.fitSelection();
    }
    function closeSketch() {
        sketchClosed.value ? finishSketch() : cancelSketch();
    }
    function cancelSketch() {
        finishSketchHandleDrag();
        viewport()?.setSketchEdgeEditing(null);
        selectedShapes.value = [];
        selectedEdges.value = [];
        selectedPoints.value = [];
        trimmedSelection.value = null;
        clearSketchDragState();
        selectedIds.value = [];
        selectionKind.value = null;
        lastFace.value = null;
        viewport()?.clearGeometrySelection();
        sketchMode.value = false;
        sketchContextMenu.value = null;
        viewport()?.setSketchEditing(null);
        sketchPoints.value = [];
        selectedSketchPoint.value = -1;
        selectedSketchSegment.value = -1;
        selectedSketchSegments.value = [];
        sketchLockedPoints.value = [];
        sketchCurves.value = {};
        editingSketchId.value = null;
        viewport()?.setSketchMode(false);
    }


        function cancelSketchRefresh() {
            if (sketchRefreshFrame) cancelAnimationFrame(sketchRefreshFrame);
            sketchRefreshFrame = 0;
        }

    return {
        startSketch, persistSketchProgress, refreshSketch, renderSketch, setSketchType,
        updateSketchDepth, onSketchSectorMove, resetSketchSector, onSketchDimension,
        finishSketch, closeSketch, cancelSketch, cancelSketchRefresh,
    };
}
