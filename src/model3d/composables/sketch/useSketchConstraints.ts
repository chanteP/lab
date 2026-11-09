import { useMessage } from 'naive-ui';
import type { Viewport } from '../../engine/Viewport';
import { runConstraintChain, type SketchConstraintOperation } from '../../engine/sketchConstraintChain';
import {
    constraintRules, entityConstraintSegment, upsertSketchConstraintRule, type SketchConstraintType,
} from '../../engine/sketchConstraints';
import { uid } from '../../utils/id';
import { borderEditingPoints, borderSegments } from '../../engine/sketchBorders';
import { cloneDocument, type ModelDocument, type ModelEntity, type Point2, type SketchElementRef } from '../../types';
import type { SketchState } from './useSketchState';
import { convertSemanticShapeToConstrainedPolygon } from '../../engine/sketchShapes';
import type { Ref } from 'vue';

interface SketchConstraintsOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    state: SketchState;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    popHistory: () => void;
    refreshSketch: () => void;
    syncTrimmedEntity: (points: Point2[]) => void;
    isTransforming: () => boolean;
}

/** Constraint UI actions, document rollback and draft/entity synchronization. */
export function useSketchConstraints(options: SketchConstraintsOptions) {
    const {
        document, selectedIds, state, viewport, message, pushHistory, popHistory, refreshSketch, syncTrimmedEntity, isTransforming,
    } = options;
    const {
        sketchType, sketchCurves, sketchSides, sketchPoints, selectedSketchPoint, editingSketchId,
        trimmedSelection, selectedShapes, selectedEdges, selectedPoints, activeConstraintRule,
        sketchLockedPoints, sketchSectorAngle, sketchOpen,
        sketchProfileStartAngle, selectedConstraintRuleItems, constraintLimit, sketchGesture,
    } = state;
    function ensureShapeConstraints(entity: ModelEntity) {
        convertSemanticShapeToConstrainedPolygon(entity);
    }
    function syncLocalSketchFromDocument() {
        const entity = document.value.entities.find((item) => item.id === editingSketchId.value);
        if (!entity?.points) return;
        if (trimmedSelection.value) {
            const start = trimmedSelection.value.index;
            sketchPoints.value = trimmedSelection.value.kind === 'line'
                ? [[...entity.points[start]], [...entity.points[(start + 1) % entity.points.length]]]
                : entity.points.slice(start, start + trimmedSelection.value.sourceCount + 1).map((point) => [...point]);
            const segment = borderSegments(entity).find((item) => item.index === trimmedSelection.value?.index);
            if (segment?.curve) {
                // Cubic synchronization must also keep semantic endpoints, not restore render samples.
                sketchPoints.value = borderEditingPoints(segment);
                const curve = segment.curve.kind === 'cubic' ? segment.curve : undefined;
                sketchCurves.value = curve ? { 0: { c1: [...curve.c1], c2: [...curve.c2] } } : {};
                return;
            }
            const curve = trimmedSelection.value.kind === 'line' ? entity.curves?.[start] : undefined;
            sketchCurves.value = curve ? { 0: { c1: [...curve.c1], c2: [...curve.c2] } } : {};
            return;
        }
        sketchPoints.value = entity.points.map((point) => [...point]);
        sketchCurves.value = JSON.parse(JSON.stringify(entity.curves || {}));
        sketchLockedPoints.value = [...(entity.lockedPoints || [])];
    }
    function currentConstraintAnchors() {
        if (sketchGesture.anchors.length) return sketchGesture.anchors.map((anchor) => ({ ...anchor }));
        return editingSketchId.value && selectedSketchPoint.value >= 0 ? [{ entityId: editingSketchId.value, index: absoluteSketchPointIndex(selectedSketchPoint.value) }] : [];
    }
    function absoluteSketchPointIndex(index: number) {
        // A trimmed border uses local endpoint indices; selection and constraint refs always use entity indices.
        const selection = trimmedSelection.value;
        return selection ? selection.index + (index ? selection.sourceCount : 0) : index;
    }
    function constraintAnchorLevels(): SketchElementRef[][] {
        const points = currentConstraintAnchors();
        const edges: SketchElementRef[] = [];
        selectedEdges.value.forEach(({ entityId, index }) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            if (!entity?.points) return;
            edges.push({ entityId, index }, { entityId, index: (index + 1) % entity.points.length });
        });
        const unique = (anchors: SketchElementRef[]) => [...new Map(anchors.map((anchor) => [`${anchor.entityId}:${anchor.index}`, anchor])).values()];
        // Current points outrank selected borders; the last attempt lets the constraint chain move freely.
        if (points.length) return edges.length ? [unique([...points, ...edges]), unique(points), []] : [unique(points), []];
        if (edges.length) return [unique(edges), []];
        return [[]];
    }
    function enforceSketchConstraints(rootId = editingSketchId.value, before = cloneDocument(document.value), onRollback?: () => void, operation?: SketchConstraintOperation) {
        const attempted = cloneDocument(document.value);
        let failure: 'limit' | 'conflict' = 'conflict';

        // Try stronger preservation first; an explicit dimension operation remains exact at every level.
        for (const anchors of constraintAnchorLevels()) {
            document.value.entities = cloneDocument(attempted).entities;
            const result = runConstraintChain(document.value, rootId, anchors, constraintLimit.value, operation, before);
            if (result === 'limit') {
                failure = 'limit';
                break;
            }
            if (result !== 'ok') continue;
            syncLocalSketchFromDocument();
            return true;
        }

        document.value.entities = before.entities;
        onRollback?.();
        syncLocalSketchFromDocument();
        sketchGesture.rolledBack = isTransforming();
        message.warning(failure === 'limit' ? `约束关联超过 ${constraintLimit.value} 个元素，本次操作已回滚` : '约束链无法同时满足固定元素，本次操作已回滚');
        return false;
    }
    function syncEditingSketch(operation?: SketchConstraintOperation) {
        const before = sketchGesture.before || cloneDocument(document.value);
        if (trimmedSelection.value) {
            const sourceCount = trimmedSelection.value.sourceCount;
            syncTrimmedEntity(sketchPoints.value);
            if (!enforceSketchConstraints(editingSketchId.value, before, () => { if (trimmedSelection.value) trimmedSelection.value.sourceCount = sourceCount; }, operation)) return;
            syncLocalSketchFromDocument();
            return;
        }
        if (!editingSketchId.value) return;
        const item = document.value.entities.find((entity) => entity.id === editingSketchId.value);
        if (item) { item.points = sketchPoints.value.map((point) => [...point]); item.profileType = sketchType.value; item.curves = JSON.parse(JSON.stringify(sketchCurves.value)); item.sides = sketchSides.value; item.lockedPoints = [...sketchLockedPoints.value]; item.sectorAngle = sketchSectorAngle.value; item.open = sketchOpen.value; item.profileStartAngle = sketchProfileStartAngle.value; }
        if (!enforceSketchConstraints(editingSketchId.value, before, undefined, operation)) return;
        syncLocalSketchFromDocument();
    }
    function selectConstraintRule(entityId: string, index: number, ruleId: string) {
        activeConstraintRule.value = { entityId, index, ruleId };
        selectedPoints.value = [];
        selectedShapes.value = [];
        selectedEdges.value = [{ entityId, index }];
        selectedIds.value = [entityId];
        viewport()?.setActiveConstraintRule(activeConstraintRule.value);
        refreshSketch();
    }
    function deleteSelectedConstraintRule(id: string) {
        const selection = selectedConstraintRuleItems.value.find((item) => item.id === id);
        const entity = selection && document.value.entities.find((item) => item.id === selection.entityId);
        if (!selection || !entity) return;
        pushHistory();
        if (selection.lock) {
            const indices = selection.lock === 'edge' && entity.points ? [selection.index, (selection.index + 1) % entity.points.length] : [selection.index];
            entity.lockedPoints = (entity.lockedPoints || []).filter((index) => !indices.includes(index));
            if (selection.lock === 'edge') entity.constraintEdges = (entity.constraintEdges || []).filter((index) => index !== selection.index);
            if (selection.entityId === editingSketchId.value) sketchLockedPoints.value = [...(entity.lockedPoints || [])];
        } else if (entity.edgeConstraints) {
            const remaining = constraintRules(entity.edgeConstraints[selection.index]).filter((rule) => rule.id !== selection.ruleId);
            if (remaining.length) entity.edgeConstraints[selection.index] = remaining;
            else delete entity.edgeConstraints[selection.index];
        }
        if (activeConstraintRule.value?.entityId === selection.entityId && activeConstraintRule.value.index === selection.index && activeConstraintRule.value.ruleId === selection.ruleId) {
            activeConstraintRule.value = null;
            viewport()?.setActiveConstraintRule(null);
        }
        refreshSketch();
    }
    function applySketchConstraint(type: SketchConstraintType) {
        const selected = selectedEdges.value;
        if (!selected.length) return;
        const before = cloneDocument(document.value);
        activeConstraintRule.value = null;
        viewport()?.setActiveConstraintRule(null);
        const cancel = selected.every(({ entityId, index }) => {
            const constraint = document.value.entities.find((entity) => entity.id === entityId)?.edgeConstraints?.[index];
            return constraintRules(constraint).some((rule) => rule.type === type || (type === 'auto' && ['horizontal', 'vertical'].includes(rule.type)));
        });
        if (cancel) {
            pushHistory();
            selected.forEach(({ entityId, index }) => {
                const entity = document.value.entities.find((entity) => entity.id === entityId);
                if (!entity?.edgeConstraints) return;
                const remaining = constraintRules(entity.edgeConstraints[index]).filter((rule) => rule.type !== type && !(type === 'auto' && ['horizontal', 'vertical'].includes(rule.type)));
                if (remaining.length) entity.edgeConstraints[index] = remaining;
                else delete entity.edgeConstraints[index];
            });
            refreshSketch();
            return;
        }
        const valid = selected.every(({ entityId, index }) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            return !!entity?.points && entityConstraintSegment(entity, index);
        });
        if (!valid) return message.warning('约束需要两个不重合的边端点');
        if (['parallel', 'perpendicular', 'equal'].includes(type) && selected.length < 2) {
            return message.warning('请先选择至少两条边');
        }

        // Save rules before solving: an already satisfied association is still a persistent constraint.
        pushHistory();
        const reference = selected[0];
        selected.forEach(({ entityId, index }) => {
            if (['parallel', 'perpendicular', 'equal'].includes(type) && entityId === reference.entityId && index === reference.index) return;
            const entity = document.value.entities.find((item) => item.id === entityId)!;
            const a = entity.points![index], b = entity.points![(index + 1) % entity.points!.length];
            const resolved = type === 'auto' ? (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'horizontal' : 'vertical') : type;
            upsertSketchConstraintRule(entity, index, {
                id: uid(), type: resolved,
                reference: ['parallel', 'perpendicular', 'equal'].includes(type) ? reference : undefined,
                length: type === 'length' ? Math.hypot(b[0] - a[0], b[1] - a[1]) : undefined,
            });
        });
        if (!enforceSketchConstraints(editingSketchId.value, before)) {
            popHistory();
            refreshSketch();
            return;
        }
        syncLocalSketchFromDocument();
        viewport()?.refreshSketchFaces();
        refreshSketch();
    }
    function toggleSketchPointLock() {
        const grouped = new Map<string, number[]>();
        const add = (entityId: string, indices: number[]) => grouped.set(entityId, [...new Set([...grouped.get(entityId) || [], ...indices])]);
        selectedPoints.value.forEach(({ entityId, index }) => add(entityId, [index]));
        if (!selectedPoints.value.length) selectedEdges.value.forEach(({ entityId, index }) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            if (entity?.points) add(entityId, [index, (index + 1) % entity.points.length]);
        });
        if (!selectedPoints.value.length && !selectedEdges.value.length) selectedShapes.value.forEach((entityId) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            if (entity?.points) add(entityId, entity.points.map((_, index) => index));
        });
        if (!grouped.size) return;
        const locked = [...grouped].every(([entityId, indices]) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            return indices.every((index) => entity?.lockedPoints?.includes(index));
        });
        pushHistory();
        grouped.forEach((indices, entityId) => {
            const entity = document.value.entities.find((item) => item.id === entityId)!;
            const current = entity.lockedPoints || [];
            entity.lockedPoints = locked ? current.filter((index) => !indices.includes(index)) : [...new Set([...current, ...indices])];
            if (selectedEdges.value.length || selectedShapes.value.length) {
                const currentEdges = entity.constraintEdges || [];
                entity.constraintEdges = locked ? currentEdges.filter((index) => !indices.includes(index)) : [...new Set([...currentEdges, ...indices])];
            }
            if (entityId === editingSketchId.value) sketchLockedPoints.value = [...entity.lockedPoints];
        });
        refreshSketch();
    }

    return {
        ensureShapeConstraints, syncLocalSketchFromDocument, absoluteSketchPointIndex, enforceSketchConstraints,
        syncEditingSketch, selectConstraintRule, deleteSelectedConstraintRule,
        applySketchConstraint, toggleSketchPointLock,
    };
}

export type SketchConstraints = ReturnType<typeof useSketchConstraints>;
