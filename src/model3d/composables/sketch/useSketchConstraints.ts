import { useMessage } from 'naive-ui';
import type { Viewport } from '../../engine/Viewport';
import { sketchConstraintAnchorLevels, solveWithSketchConstraintCandidates, type SketchConstraintOperation } from '../../engine/sketchConstraintChain';
import {
    constraintRules, entityConstraintSegment, upsertSketchConstraintRule, type SketchConstraintType,
} from '../../engine/sketchConstraints';
import { uid } from '../../utils/id';
import { borderEditingPoints, borderSegments } from '../../engine/sketchBorders';
import { cloneDocument, type ModelDocument, type ModelEntity, type Point2, type SketchElementRef } from '../../types';
import type { SketchState } from './useSketchState';
import { convertSemanticShapeToConstrainedPolygon } from '../../engine/sketchShapes';
import { inferSketchTangentMode } from '../../engine/sketchGeometricConstraints';
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
        constraintAnchorSelection, rememberConstraintEdges,
        sketchLockedPoints, sketchSectorAngle, sketchOpen,
        sketchProfileStartAngle, selectedConstraintRuleItems, constraintLimit, sketchGesture,
        tangentConstraintAvailable, concentricConstraintAvailable,
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
    function enforceSketchConstraints(rootId = editingSketchId.value, before = cloneDocument(document.value), onRollback?: () => void, operation?: SketchConstraintOperation) {
        const attempted = cloneDocument(document.value);
        const levels = sketchConstraintAnchorLevels(attempted, currentConstraintAnchors(), constraintAnchorSelection.edges, trimmedSelection.value, constraintAnchorSelection.shapeIds);
        const solved = solveWithSketchConstraintCandidates(attempted, before, rootId, levels, constraintLimit.value, operation);
        if (solved.result === 'ok') {
            document.value.entities = solved.document.entities;
            syncLocalSketchFromDocument();
            return true;
        }

        document.value.entities = before.entities;
        onRollback?.();
        syncLocalSketchFromDocument();
        sketchGesture.rolledBack = isTransforming();
        message.warning(solved.result === 'limit' ? `约束关联超过 ${constraintLimit.value} 个元素，本次操作已回滚` : '约束链无法同时满足固定元素，本次操作已回滚');
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
        rememberConstraintEdges(selectedEdges.value);
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
    function applyGeometricConstraint(type: 'tangent' | 'concentric') {
        const available = type === 'tangent' ? tangentConstraintAvailable.value : concentricConstraintAvailable.value;
        if (!available) return message.warning(type === 'tangent' ? '请选择直线与圆/椭圆，或两个圆形' : '请选择至少两个带中心点的形状');
        const selected = selectedEdges.value.length ? selectedEdges.value : selectedShapes.value.map((entityId) => ({ entityId, index: 0 }));
        const before = cloneDocument(document.value);
        const cancel = selected.some(({ entityId, index }) => {
            const entity = document.value.entities.find((item) => item.id === entityId);
            return constraintRules(entity?.edgeConstraints?.[index]).some((rule) => rule.type === type);
        });
        pushHistory();
        if (cancel) {
            selected.forEach(({ entityId, index }) => {
                const entity = document.value.entities.find((item) => item.id === entityId);
                if (!entity?.edgeConstraints) return;
                const remaining = constraintRules(entity.edgeConstraints[index]).filter((rule) => rule.type !== type);
                if (remaining.length) entity.edgeConstraints[index] = remaining;
                else delete entity.edgeConstraints[index];
            });
            refreshSketch();
            return;
        }
        const reference = selected[0];
        selected.slice(1).forEach(({ entityId, index }) => {
            const entity = document.value.entities.find((item) => item.id === entityId)!;
            upsertSketchConstraintRule(entity, index, {
                id: uid(), type, reference,
                tangentMode: type === 'tangent' ? inferSketchTangentMode(entity, index, document.value.entities.find((item) => item.id === reference.entityId)!, reference.index) : undefined,
            });
        });
        if (!enforceSketchConstraints(editingSketchId.value || reference.entityId, before)) {
            popHistory();
            refreshSketch();
            return;
        }
        syncLocalSketchFromDocument();
        viewport()?.refreshSketchFaces();
        refreshSketch();
    }

    function applySketchConstraint(type: SketchConstraintType) {
        if (type === 'tangent' || type === 'concentric') return applyGeometricConstraint(type);
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
