import { computed, ref, watch, type Ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { STORAGE_KEYS } from '../../config/const';
import { constraintRules, entityConstraintSegment, type SketchConstraintType } from '../../engine/sketchConstraints';
import { sketchGeometricSelection } from '../../engine/sketchGeometricConstraints';
import type { ProfileCurves, ProfileType } from '../../engine/profiles';
import type {
    ConstraintRuleListItem, ModelDocument, Point2, SketchElementRef, TrimmedSelection,
} from '../../types';

/** Sketch draft, selection and derived constraint display state. */
export function useSketchState(document: Ref<ModelDocument>, activePlaneId?: Ref<string | null>) {
    const sketchMode = ref(false);
    const sketchType = ref<ProfileType>('polygon');
    const sketchCurves = ref<ProfileCurves>({});
    const sketchSides = ref(3);
    const selectedSketchSegment = ref(-1);
    const sketchPoints = ref<Point2[]>([]);
    const sketchDepth = ref(10);
    const selectedSketchPoint = ref(-1);
    const editingSketchId = ref<string | null>(null);
    const trimmedSelection = ref<TrimmedSelection | null>(null);
    const selectedSketchSegments = ref<number[]>([]);
    const selectedShapes = ref<string[]>([]);
    const selectedEdges = ref<SketchElementRef[]>([]);
    const selectedPoints = ref<SketchElementRef[]>([]);
    const activeConstraintRule = ref<{ entityId: string; index: number; ruleId: string } | null>(null);
    const hoverConstraintRule = ref<ConstraintRuleListItem | null>(null);
    const sketchLockedPoints = ref<number[]>([]);
    const sketchSectorAngle = ref(360);
    const sketchOpen = ref(false);
    const sketchProfileStartAngle = ref<number | undefined>(undefined);
    const sketchAppendMode = ref(true);
    const sketchSelectionTool = ref(false);
    const sketchGuideSnapEnabled = ref(true);
    const selectedSketchGuideId = ref<string | null>(null);
    // Transient drag/constraint data is deliberately non-reactive.
    const sketchGesture = {
        anchors: [] as SketchElementRef[],
        rolledBack: false,
        before: null as ModelDocument | null,
    };
    // Constraint ownership survives handle selection; only blur or deleting its owner clears it.
    const constraintAnchorSelection = { edges: [] as SketchElementRef[], shapeIds: [] as string[] };
    function rememberConstraintEdges(edges: SketchElementRef[]) {
        constraintAnchorSelection.edges = edges.map((edge) => ({ ...edge }));
        constraintAnchorSelection.shapeIds = [];
    }
    function rememberConstraintShapes(shapeIds: string[]) {
        constraintAnchorSelection.shapeIds = [...shapeIds];
        constraintAnchorSelection.edges = [];
    }
    function clearConstraintAnchorSelection() {
        constraintAnchorSelection.edges = [];
        constraintAnchorSelection.shapeIds = [];
    }
    useEventListener(window, 'blur', clearConstraintAnchorSelection);
    watch(() => document.value.entities, (entities) => {
        const ids = new Set(entities.map((entity) => entity.id));
        constraintAnchorSelection.shapeIds = constraintAnchorSelection.shapeIds.filter((id) => ids.has(id));
        constraintAnchorSelection.edges = constraintAnchorSelection.edges.filter((edge) => {
            const entity = entities.find((item) => item.id === edge.entityId);
            return !!entity?.points && edge.index >= 0 && edge.index < entity.points.length;
        });
    });

    const activeConstraintRuleData = computed(() => {
        const selection = activeConstraintRule.value;
        if (!selection) return null;
        const entity = document.value.entities.find((item) => item.id === selection.entityId);
        return constraintRules(entity?.edgeConstraints?.[selection.index]).find((rule) => rule.id === selection.ruleId) || null;
    });
    function readConstraintLimit() {
        const value = Number(localStorage.getItem(STORAGE_KEYS.constraintLimit));
        return Number.isFinite(value) && value >= 10 && value <= 100 ? Math.round(value) : 20;
    }

    const sketchClosed = computed(() => ['circle', 'regular'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : ['polygon', 'line'].includes(sketchType.value) ? sketchPoints.value.length >= 2 : sketchPoints.value.length >= 3);
    const selectedPointLocked = computed(() => selectedSketchPoint.value >= 0 && sketchLockedPoints.value.includes(selectedSketchPoint.value));
    const constraintSegmentCount = computed(() => selectedEdges.value.filter(({ entityId, index }) => {
        const entity = document.value.entities.find((item) => item.id === entityId);
        return entity?.points && entityConstraintSegment(entity, index);
    }).length);
    const selectionLocked = computed(() => {
        if (selectedPoints.value.length) return selectedPoints.value.every(({ entityId, index }) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            return entity?.lockedPoints?.includes(index);
        });
        if (selectedEdges.value.length) return selectedEdges.value.every(({ entityId, index }) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            return entity?.points && [index, (index + 1) % entity.points.length].every((point) => entity.lockedPoints?.includes(point));
        });
        if (selectedShapes.value.length) return selectedShapes.value.every((entityId) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            return entity?.points?.every((_, index) => entity.lockedPoints?.includes(index));
        });
        return false;
    });
    const selectionLengthLocked = computed(() => selectedEdges.value.length > 0 && selectedEdges.value.every(({ entityId, index }) => {
        const entity = document.value.entities.find((item) => item.id === entityId);
        return constraintRules(entity?.edgeConstraints?.[index]).some((rule) => rule.type === 'length');
    }));
    const horizontalConstraintActive = computed(() => selectedEdges.value.length > 0 && selectedEdges.value.every(({ entityId, index }) => {
        const entity = document.value.entities.find((item) => item.id === entityId);
        return constraintRules(entity?.edgeConstraints?.[index]).some((rule) => rule.type === 'horizontal');
    }));
    const verticalConstraintActive = computed(() => selectedEdges.value.length > 0 && selectedEdges.value.every(({ entityId, index }) => {
        const entity = document.value.entities.find((item) => item.id === entityId);
        return constraintRules(entity?.edgeConstraints?.[index]).some((rule) => rule.type === 'vertical');
    }));
    const autoConstraintActive = computed(() => selectedEdges.value.length > 0 && selectedEdges.value.every(({ entityId, index }) => {
        const entity = document.value.entities.find((item) => item.id === entityId);
        return constraintRules(entity?.edgeConstraints?.[index]).some((rule) => ['horizontal', 'vertical'].includes(rule.type));
    }));
    const geometricSelection = computed<SketchElementRef[]>(() => selectedEdges.value.length
        ? selectedEdges.value
        : selectedShapes.value.map((entityId) => ({ entityId, index: 0 })));
    const tangentConstraintAvailable = computed(() => {
        if (!selectedEdges.value.length && selectedShapes.value.some((entityId) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            return !['circle', 'ellipse'].includes(entity?.profileType || '');
        })) return false;
        return sketchGeometricSelection(document.value.entities, geometricSelection.value).tangent;
    });
    const concentricConstraintAvailable = computed(() => sketchGeometricSelection(document.value.entities, geometricSelection.value).concentric);

    const selectedConstraintRuleItems = computed<ConstraintRuleListItem[]>(() => {
        const items: ConstraintRuleListItem[] = [];
        const labels: Record<SketchConstraintType, string> = { auto: '水平 / 垂直', horizontal: '水平', vertical: '垂直', parallel: '平行', perpendicular: '正交', equal: '等长', length: '固定长度', angle: '角度', tangent: '相切', concentric: '同心' };
        const addPoint = (entityId: string, index: number, covered?: Set<string>) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            if (!entity?.lockedPoints?.includes(index) || covered?.has(`${entityId}:${index}`)) return;
            items.push({ id: `lock-point:${entityId}:${index}`, label: '固定', entityId, index, lock: 'point' });
        };
        const addEdge = (entityId: string, index: number, covered?: Set<string>) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            if (!entity?.points) return;
            const endpoints = [index, (index + 1) % entity.points.length];
            const edgeLocked = !!entity.constraintEdges?.includes(index) && endpoints.every((point) => entity.lockedPoints?.includes(point));
            if (edgeLocked) {
                items.push({ id: `lock-edge:${entityId}:${index}`, label: '固定', entityId, index, lock: 'edge' });
                endpoints.forEach((point) => covered?.add(`${entityId}:${point}`));
            } else endpoints.forEach((point) => addPoint(entityId, point, covered));
            constraintRules(entity.edgeConstraints?.[index]).forEach((rule) => items.push({
                id: `rule:${entityId}:${index}:${rule.id}`, label: labels[rule.type], entityId, index, ruleId: rule.id,
            }));
        };

        if (selectedEdges.value.length) {
            const covered = new Set<string>();
            selectedEdges.value.forEach(({ entityId, index }) => addEdge(entityId, index, covered));
        } else selectedShapes.value.forEach((entityId) => {
            const entity = document.value.entities.find((candidate) => candidate.id === entityId);
            if (!entity?.points) return;
            const covered = new Set<string>();
            const edges = new Set([...Object.keys(entity.edgeConstraints || {}).map(Number), ...(entity.constraintEdges || [])]);
            edges.forEach((index) => addEdge(entityId, index, covered));
            entity.lockedPoints?.forEach((index) => addPoint(entityId, index, covered));
        });
        items.forEach((item) => {
            if (!item.ruleId) return;
            const entity = document.value.entities.find((candidate) => candidate.id === item.entityId);
            const rule = constraintRules(entity?.edgeConstraints?.[item.index]).find((candidate) => candidate.id === item.ruleId);
            if (rule?.type === 'angle') item.label = `角度 ${Number(((rule.angle || 0) * 180 / Math.PI).toFixed(2))}°`;
        });
        return items;
    });
    const constraintLimit = ref(readConstraintLimit());

    return {
        sketchMode, sketchType, sketchCurves, sketchSides, selectedSketchSegment, sketchPoints,
        sketchDepth, selectedSketchPoint, editingSketchId, trimmedSelection,
        selectedSketchSegments, selectedShapes, selectedEdges, selectedPoints, activeConstraintRule, hoverConstraintRule,
        activeConstraintRuleData, sketchLockedPoints, sketchSectorAngle, sketchOpen,
        sketchProfileStartAngle, sketchAppendMode, sketchSelectionTool, constraintLimit,
        sketchGuideSnapEnabled, selectedSketchGuideId, sketchGesture, sketchClosed, selectedPointLocked, constraintSegmentCount,
        constraintAnchorSelection, rememberConstraintEdges, rememberConstraintShapes, clearConstraintAnchorSelection,
        selectionLocked, selectionLengthLocked, horizontalConstraintActive, verticalConstraintActive,
        autoConstraintActive, selectedConstraintRuleItems, tangentConstraintAvailable, concentricConstraintAvailable,
    };
}

export type SketchState = ReturnType<typeof useSketchState>;
