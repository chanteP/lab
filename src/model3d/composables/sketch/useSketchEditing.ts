import type { ComputedRef, Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { EditPhase, Viewport } from '../../engine/Viewport';
import { entityProfileClosed, profileClosed, type ProfileCurves } from '../../engine/profiles';
import { borderSegments, sliceBorder, sliceBorderCurve, splitCubic } from '../../engine/sketchBorders';
import { projectSketchPointToFixedLengths } from '../../engine/sketchConstraints';
import { restitchSketchEdges, type RestitchEdge } from '../../engine/sketchRestitch';
import { curvePoint as curvePointForEntity, translateCurve } from '../../engine/sketchCurves';
import { uid } from '../../utils/id';
import { cloneEntity } from '../../utils/entity';
import { cloneDocument, createEntity, ENTITY_NAMES, type ModelDocument, type ModelEntity, type Point2, type SketchCurve, type SketchElementRef, type SketchPlane } from '../../types';
import type { SketchState } from './useSketchState';
import type { SketchConstraints } from './useSketchConstraints';

interface SketchEditingOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    activePlaneId: Ref<string | null>;
    activePlane: ComputedRef<SketchPlane | null>;
    viewportMenu: Ref<{ x: number; y: number; id: string | null } | null>;
    state: SketchState;
    constraints: SketchConstraints;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    popHistory: () => void;
    refreshSketch: () => void;
    persistSketchProgress: (resetAfter: boolean) => void;
    removeConstraintsForEdge: (entityId: string, index: number) => void;
    removeConstraintsForEntity: (entityId: string) => void;
    isTransforming: () => boolean;
    setTransforming: (value: boolean) => void;
}

/** Sketch selection and point/edge/handle gesture mutations. */
export function useSketchEditing(options: SketchEditingOptions) {
    const {
        document, selectedIds, activePlaneId, activePlane, viewportMenu, state, constraints, viewport,
        message, pushHistory, popHistory, refreshSketch, persistSketchProgress,
        removeConstraintsForEdge, removeConstraintsForEntity, isTransforming, setTransforming,
    } = options;
    const {
        sketchType, sketchCurves, sketchSides, selectedSketchSegment, sketchPoints, selectedSketchPoint,
        editingSketchId, trimmedSelection, sketchContextMenu, selectedSketchSegments, selectedShapes,
        selectedEdges, selectedPoints, activeConstraintRule, sketchLockedPoints, sketchSectorAngle,
        sketchOpen, sketchProfileStartAngle, sketchAppendMode, sketchSelectionTool, sketchGesture,
    } = state;
    const {
        ensureShapeConstraints, absoluteSketchPointIndex,
        enforceSketchConstraints, syncEditingSketch,
    } = constraints;
    let sketchCenterDrag: { start: Point2; points: Point2[]; curves: ProfileCurves } | null = null;
    let trimmedCurveDrag: { start: Point2; points: Point2[] } | null = null;
    let multiPointDrag: { start: Point2; points: Map<string, Point2[]>; curves: Map<string, ProfileCurves> } | null = null;

    function clearSketchDragState() {
        trimmedCurveDrag = null;
    }
    function activateSketchSelectionTool() {
        sketchSelectionTool.value = true;
        sketchAppendMode.value = false;
        viewport()?.setSketchSelectionTool(true);
    }
    function clearSketchSelection() {
        finishSketchHandleDrag();
        activeConstraintRule.value = null;
        viewport()?.setActiveConstraintRule(null);
        viewport()?.setSketchEdgeEditing(null);
        selectedShapes.value = [];
        selectedEdges.value = [];
        selectedPoints.value = [];
        trimmedSelection.value = null;
        trimmedCurveDrag = null;
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
        viewport()?.setSketchEditing(null);
        refreshSketch();
        activateSketchSelectionTool();
    }
    function selectTrimmedBorder(entityId: string, index: number, additive = false) {
        activeConstraintRule.value = null;
        viewport()?.setActiveConstraintRule(null);
        const entity = document.value.entities.find((item) => item.id === entityId);
        const segment = entity && borderSegments(entity).find((item) => item.index === index);
        if (!entity || !segment) return;
        selectedShapes.value = [];
        selectedPoints.value = [];
        const item = { entityId, index };
        const exists = selectedEdges.value.some((edge) => edge.entityId === entityId && edge.index === index);
        selectedEdges.value = additive
            ? exists ? selectedEdges.value.filter((edge) => !(edge.entityId === entityId && edge.index === index)) : [...selectedEdges.value, item]
            : [item];
        if (!selectedEdges.value.length) return clearSketchSelection();
        const a = segment.points[0], b = segment.points[segment.points.length - 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const straight = segment.points.every((point) => Math.abs(dx * (point[1] - a[1]) - dy * (point[0] - a[0])) < 0.0001);
        trimmedSelection.value = { entityId, index, sourceCount: segment.sourceCount, kind: straight ? 'line' : 'curve' };
        editingSketchId.value = entityId;
        sketchPoints.value = straight ? [[...a], [...b]] : segment.points.map((point) => [...point]);
        sketchType.value = straight ? 'line' : 'polygon';
        sketchCurves.value = {};
        sketchLockedPoints.value = [];
        sketchOpen.value = true;
        sketchAppendMode.value = false;
        selectedSketchPoint.value = -1;
        selectedSketchSegment.value = -1;
        selectedSketchSegments.value = [];
        selectedIds.value = [entityId];
        sketchContextMenu.value = null;
        viewport()?.setSketchEditing(entityId);
        viewport()?.setSketchEdgeEditing(index);
        refreshSketch();
    }
    function selectSketchEntity(id: string, additive = false) {
        const entity = document.value.entities.find((item) => item.id === id && item.kind === 'sketch');
        if (!entity) return;
        ensureShapeConstraints(entity);
        selectedEdges.value = [];
        selectedPoints.value = [];
        selectedShapes.value = additive
            ? selectedShapes.value.includes(id) ? selectedShapes.value.filter((item) => item !== id) : [...selectedShapes.value, id]
            : [id];
        if (!selectedShapes.value.length) return clearSketchSelection();
        if (entity.planeId && entity.planeId !== activePlaneId.value) {
            activePlaneId.value = entity.planeId;
            viewport()?.setActivePlane(activePlane.value);
        }
        trimmedSelection.value = null;
        viewport()?.setSketchEdgeEditing(null);
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
        selectedIds.value = [...selectedShapes.value];
        sketchContextMenu.value = null;
        viewport()?.setSketchEditing(id);
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
        removeConstraintsForEntity(id);
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
        const edited = document.value.entities.find((entity) => entity.id === editingSketchId.value);
        if (edited?.controlPoints && !edited.controlPoints.includes(sketchPoints.value.length - 1)) edited.controlPoints.push(sketchPoints.value.length - 1);
        syncEditingSketch();
        refreshSketch();
        if (sketchType.value === 'polygon' || sketchType.value === 'arc') persistSketchProgress(false);
        else persistSketchProgress(true);
    }
    function moveSketchPoint(index: number, point: Point2, phase: EditPhase) {
        if (trimmedSelection.value?.kind === 'curve') {
            moveTrimmedCurve(point, phase);
            return;
        }
        const pointIndex = absoluteSketchPointIndex(index);
        if (selectedPoints.value.length > 1 && selectedPoints.value.some((item) => item.entityId === editingSketchId.value && item.index === pointIndex)) {
            moveSelectedPoints(point, phase);
            return;
        }
        if (sketchLockedPoints.value.includes(pointIndex)) {
            if (phase === 'start') message.info('该点已锁定，请先在 Constraints 中解锁');
            return;
        }
        if (phase === 'start') {
            beginSketchHandleDrag(editingSketchId.value ? [{ entityId: editingSketchId.value, index: pointIndex }] : []);
            return;
        }
        if (!sketchPoints.value[index]) return;
        const edited = document.value.entities.find((entity) => entity.id === editingSketchId.value);
        if (edited) {
            point = projectSketchPointToFixedLengths(edited, pointIndex, point, !trimmedSelection.value && entityProfileClosed(edited));
        }
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
        if (phase === 'end' || !isTransforming()) {
            syncEditingSketch();
            if (sketchPoints.value.length >= 3) persistSketchProgress(false);
        }
        refreshSketch();
        if (phase === 'end') finishSketchHandleDrag();
    }
    function beginSketchHandleDrag(anchors: SketchElementRef[] = []) {
        if (!editingSketchId.value) return;
        sketchGesture.before = cloneDocument(document.value);
        pushHistory();
        setTransforming(true);
        sketchGesture.anchors = anchors.map((anchor) => ({ ...anchor }));
        sketchGesture.rolledBack = false;
    }
    function finishSketchHandleDrag() {
        if (!isTransforming()) return;
        setTransforming(false);
        if (sketchGesture.rolledBack) popHistory();
        sketchGesture.anchors = [];
        sketchGesture.rolledBack = false;
        sketchGesture.before = null;
    }
    function moveSelectedPoints(point: Point2, phase: EditPhase) {
        if (phase === 'start') {
            if (selectedPoints.value.some(({ entityId, index }) => document.value.entities.find((entity) => entity.id === entityId)?.lockedPoints?.includes(index))) {
                message.info('所选点包含固定点，请先取消固定');
                return;
            }
            beginSketchHandleDrag(selectedPoints.value);
            const points = new Map<string, Point2[]>(), curves = new Map<string, ProfileCurves>();
            new Set(selectedPoints.value.map((item) => item.entityId)).forEach((entityId) => {
                const entity = document.value.entities.find((item) => item.id === entityId);
                if (entity?.points) points.set(entityId, entity.points.map((source) => [...source]));
                curves.set(entityId, JSON.parse(JSON.stringify(entity?.curves || {})));
            });
            multiPointDrag = { start: [...point], points, curves };
            return;
        }
        if (!multiPointDrag) return;
        const delta: Point2 = [point[0] - multiPointDrag.start[0], point[1] - multiPointDrag.start[1]];
        const changes = new Map<string, { points: Point2[]; curves: ProfileCurves }>();
        multiPointDrag.points.forEach((base, entityId) => {
            const next = base.map((source) => [...source] as Point2);
            const curves = JSON.parse(JSON.stringify(multiPointDrag!.curves.get(entityId) || {})) as ProfileCurves;
            selectedPoints.value.filter((item) => item.entityId === entityId).forEach(({ index }) => {
                if (!next[index]) return;
                next[index] = [next[index][0] + delta[0], next[index][1] + delta[1]];
                if (curves[index]) curves[index].c1 = [curves[index].c1[0] + delta[0], curves[index].c1[1] + delta[1]];
                if (curves[index - 1]) curves[index - 1].c2 = [curves[index - 1].c2[0] + delta[0], curves[index - 1].c2[1] + delta[1]];
            });
            Object.entries(curves).forEach(([key, curve]) => {
                const segment = Number(key), a = next[segment], b = next[(segment + 1) % next.length];
                const baseA = base[segment], baseB = base[(segment + 1) % base.length];
                const original = multiPointDrag!.curves.get(entityId)?.[segment];
                if (!original || !a || !b || !baseA || !baseB) return;
                const dx = baseB[0] - baseA[0], dy = baseB[1] - baseA[1];
                const straight = [original.c1, original.c2].every((control) => Math.abs(dx * (control[1] - baseA[1]) - dy * (control[0] - baseA[0])) < 0.0001);
                if (straight) {
                    curve.c1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
                    curve.c2 = [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3];
                }
            });
            changes.set(entityId, { points: next, curves });
        });
        const current = changes.get(editingSketchId.value || '');
        if (current) {
            sketchPoints.value = current.points;
            sketchCurves.value = current.curves;
        }
        if (phase === 'end') {
            const before = sketchGesture.before || cloneDocument(document.value);
            changes.forEach((change, entityId) => {
                const entity = document.value.entities.find((item) => item.id === entityId);
                if (entity) {
                    entity.points = change.points;
                    entity.curves = change.curves;
                }
            });
            enforceSketchConstraints(editingSketchId.value, before);
            viewport()?.refreshSketchFaces();
            multiPointDrag = null;
        }
        refreshSketch();
        if (phase === 'end') finishSketchHandleDrag();
    }
    function moveTrimmedCurve(point: Point2, phase: EditPhase) {
        if (phase === 'start') {
            beginSketchHandleDrag();
            trimmedCurveDrag = { start: [...point], points: sketchPoints.value.map((source) => [...source]) };
            return;
        }
        if (!trimmedCurveDrag) return;
        const delta: Point2 = [point[0] - trimmedCurveDrag.start[0], point[1] - trimmedCurveDrag.start[1]];
        sketchPoints.value = trimmedCurveDrag.points.map((source) => [source[0] + delta[0], source[1] + delta[1]]);
        if (phase === 'end' || !isTransforming()) syncEditingSketch();
        refreshSketch();
        if (phase === 'end') {
            trimmedCurveDrag = null;
            finishSketchHandleDrag();
        }
    }
    function moveSketchCenter(point: Point2, phase: EditPhase) {
        if (trimmedSelection.value?.kind === 'curve') {
            moveTrimmedCurve(point, phase);
            return;
        }
        if (phase === 'start') {
            if (sketchLockedPoints.value.length) {
                sketchCenterDrag = null;
                message.info('形状包含固定点，请先取消固定再整体移动');
                return;
            }
            beginSketchHandleDrag(editingSketchId.value ? sketchPoints.value.map((_, index) => ({ entityId: editingSketchId.value!, index })) : []);
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
        if (phase === 'end' || !isTransforming()) {
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
        removeConstraintsForEdge(editingSketchId.value!, Math.max(0, index - 1));
        removeConstraintsForEdge(editingSketchId.value!, index);
        if (editingSketchId.value) pushHistory();
        sketchPoints.value.splice(index, 1);
        const edited = document.value.entities.find((entity) => entity.id === editingSketchId.value);
        if (edited?.controlPoints) edited.controlPoints = edited.controlPoints.filter((point) => point !== index).map((point) => point > index ? point - 1 : point);
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
        removeConstraintsForEdge(entityId, index);
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
        const makeOpen = (points: Point2[], curve?: { c1: Point2; c2: Point2 }, arc = false, analyticCurve?: SketchCurve) => {
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
            if (analyticCurve) next.analyticCurves = { 0: analyticCurve };
            delete next.depth;
            remaining.push(next);
        };
        borderSegments(entity).forEach((segment) => {
            const ranges = segment.index !== index ? [[0, 1]] : segment.closed && start < 0 ? [[end, 1], [0, start + 1]] : [[0, start], [end, 1]];
            ranges.forEach(([from, to]) => {
                if (to - from < 0.00001) return;
                const sliced = sliceBorderCurve(segment, from, to);
                const samples = sliced.points;
                if (sliced.curve) {
                    const cubic = sliced.curve.kind === 'cubic' ? { c1: sliced.curve.c1, c2: sliced.curve.c2 } : undefined;
                    return makeOpen([samples[0], samples[samples.length - 1]], cubic, false, sliced.curve);
                }
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
        candidates.forEach((entity) => removeConstraintsForEntity(entity.id));
        const edges: RestitchEdge[] = candidates.flatMap((entity) => borderSegments(entity).map((segment) => ({
            a: segment.points[0], b: segment.points[segment.points.length - 1], points: segment.points.map((point) => [...point] as Point2),
            c1: segment.sourceCount === 1 ? entity.curves?.[segment.index]?.c1 : undefined,
            c2: segment.sourceCount === 1 ? entity.curves?.[segment.index]?.c2 : undefined,
            curve: segment.curve,
        })));
        const rebuilt = restitchSketchEdges(edges).map((path, index) => {
            const entity = createEntity('sketch', uid());
            entity.name = `${ENTITY_NAMES.sketch} ${document.value.entities.length + index + 1}`;
            entity.planeId = planeId;
            entity.position = [0, 0, 0];
            entity.profileType = 'polygon';
            entity.open = !path.closed;
            entity.points = path.points;
            entity.controlPoints = path.controlPoints;
            entity.trimmed = true;
            entity.curves = path.curves;
            entity.analyticCurves = path.analyticCurves;
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
        if (!editingSketchId.value) return;
        selectTrimmedBorder(editingSketchId.value, index, additive);
        ensureSketchSegment(index);
        selectedSketchSegment.value = index;
        selectedSketchPoint.value = -1;
        refreshSketch();
    }
    function moveSketchHandle(segment: number, handle: 1 | 2, point: Point2, phase: EditPhase) {
        if (phase === 'start') {
            beginSketchHandleDrag();
            return;
        }
        ensureSketchSegment(segment);
        sketchCurves.value[segment][handle === 1 ? 'c1' : 'c2'] = point;
        if (phase === 'end' || !isTransforming()) {
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
    function selectSketchPoint(index: number, additive = false) {
        const entityId = editingSketchId.value;
        if (!entityId || index < 0) {
            selectedSketchPoint.value = index;
            return;
        }
        selectedEdges.value = [];
        selectedShapes.value = [];
        const item = { entityId, index: absoluteSketchPointIndex(index) };
        const exists = selectedPoints.value.some((point) => point.entityId === entityId && point.index === item.index);
        selectedPoints.value = additive
            ? exists ? selectedPoints.value.filter((point) => !(point.entityId === entityId && point.index === item.index)) : [...selectedPoints.value, item]
            : [item];
        selectedIds.value = [entityId];
        selectedSketchPoint.value = index;
        selectedSketchSegment.value = -1;
        selectedSketchSegments.value = [];
        viewport()?.setSketchSelection(index);
        refreshSketch();
    }
    function selectSketchPointRef(entityId: string, index: number) {
        if (editingSketchId.value !== entityId) selectSketchEntity(entityId);
        selectSketchPoint(index);
    }
    function dragSketch(start: Point2, point: Point2, phase: EditPhase) {
        if (sketchSelectionTool.value) return;
        if (editingSketchId.value) return;
        if (phase === 'start') return;
        if (phase === 'end' && ['line', 'polygon'].includes(sketchType.value)) {
            // The Line tool creates an open polygon; finish both types through the click-click path.
            sketchPoints.value = [start];
            addSketchPoint(point);
            return;
        }
        if (sketchType.value === 'rectangle') sketchPoints.value = [start, [point[0], start[1]], point, [start[0], point[1]]];
        else if (sketchType.value === 'ellipse') sketchPoints.value = [start, [point[0], start[1]], [start[0], point[1]]];
        else sketchPoints.value = [start, point];
        syncEditingSketch();
        refreshSketch();
        if (phase === 'end' && sketchType.value !== 'polygon') persistSketchProgress(true);
    }
    function closeSketchPath() {
        if (sketchType.value !== 'polygon' || sketchPoints.value.length < 3) return;
        sketchOpen.value = false;
        syncEditingSketch();
        persistSketchProgress(false);
        refreshSketch();
        activateSketchSelectionTool();
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
    function syncTrimmedEntity(points: Point2[]) {
        const selection = trimmedSelection.value;
        const entity = selection && document.value.entities.find((item) => item.id === selection.entityId);
        if (!selection || !entity?.points) return;
        const start = selection.index, end = start + selection.sourceCount;
        if (end > entity.points.length || end === entity.points.length && !entityProfileClosed(entity)) return;
        if (selection.kind === 'curve') {
            const segment = borderSegments(entity).find((item) => item.index === selection.index);
            if (segment?.curve) {
                // Draft points may be render samples; write back only translated analytic parameters and endpoints.
                const startDelta: Point2 = [points[0][0] - segment.points[0][0], points[0][1] - segment.points[0][1]];
                const last = points[points.length - 1], originalLast = segment.points[segment.points.length - 1];
                const endDelta: Point2 = [last[0] - originalLast[0], last[1] - originalLast[1]];
                const delta = Math.hypot(...startDelta) > 1e-12 ? startDelta : endDelta;
                const curve = translateCurve(segment.curve, delta);
                entity.points![start] = curvePointForEntity(curve, 0);
                entity.points![(start + 1) % entity.points!.length] = curvePointForEntity(curve, 1);
                entity.analyticCurves = { ...(entity.analyticCurves || {}), [start]: curve };
                if (curve.kind === 'cubic') entity.curves = { ...(entity.curves || {}), [start]: { c1: [...curve.c1], c2: [...curve.c2] } };
                viewport()?.refreshSketchFaces();
                return;
            }
            points.forEach((point, index) => entity.points![start + index] = [...point]);
        } else {
            const oldPoints = entity.points, oldCurves = entity.curves || {};
            const delta = 1 - selection.sourceCount;
            entity.points = [...oldPoints.slice(0, start), [...points[0]], [...points[1]], ...oldPoints.slice(end + 1)];
            const curves: ProfileCurves = {};
            Object.entries(oldCurves).forEach(([key, curve]) => {
                const index = Number(key);
                if (index < start) curves[index] = curve;
                else if (index >= end) curves[index + delta] = curve;
            });
            const a = points[0], b = points[1];
            curves[start] = { c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], c2: [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3] };
            entity.curves = curves;
            if (entity.controlPoints) {
                entity.controlPoints = entity.controlPoints.flatMap((index) => index < start ? [index] : index >= end ? [index + delta] : []);
                entity.controlPoints.push(start + 1);
                entity.controlPoints = [...new Set(entity.controlPoints)].sort((a, b) => a - b);
            }
            if (entity.lockedPoints) entity.lockedPoints = entity.lockedPoints.flatMap((index) => index < start ? [index] : index >= end ? [index + delta] : []);
            selection.sourceCount = 1;
        }
        viewport()?.refreshSketchFaces();
    }

    return {
        clearSketchDragState, activateSketchSelectionTool, clearSketchSelection, selectTrimmedBorder, selectSketchEntity,
        openSketchContext, deleteSketchFromContext, deleteViewportSketch, addSketchPoint,
        moveSketchPoint, beginSketchHandleDrag, finishSketchHandleDrag, moveSelectedPoints,
        moveTrimmedCurve, moveSketchCenter, deleteSketchPoint, deleteSketchBorder, recloseProfiles,
        ensureSketchSegment, selectSketchSegment, moveSketchHandle, resetSketchHandle,
        selectSketchPoint, selectSketchPointRef, dragSketch, closeSketchPath, setSketchSides,
        updateSketchCoordinate, syncTrimmedEntity,
    };
}

export type SketchEditing = ReturnType<typeof useSketchEditing>;
