import { useMessage } from 'naive-ui';
import type { Viewport } from '../../engine/Viewport';
import { entityProfileClosed } from '../../engine/profiles';
import {
    changedConstraintPointCount, runConstraintChain, SKETCH_CONSTRAINT_TOLERANCE,
} from '../../engine/sketchConstraintChain';
import {
    constraintRules, solveSketchConstraints, straightConstraintSegment, type SketchConstraintType,
} from '../../engine/sketchConstraints';
import { uid } from '../../utils/id';
import type { ProfileCurves } from '../../engine/profiles';
import { borderEditingPoints, borderSegments } from '../../engine/sketchBorders';
import { cloneDocument, type ModelDocument, type ModelEntity, type Point2, type SketchElementRef } from '../../types';
import type { SketchState } from './useSketchState';
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
        activeConstraintRuleData, sketchLockedPoints, sketchSectorAngle, sketchOpen,
        sketchProfileStartAngle, selectedConstraintRuleItems, constraintLimit, sketchGesture,
    } = state;
    function ensureShapeConstraints(entity: ModelEntity) {
        if (entity.trimmed) return;
        if (entity.profileType === 'rectangle') {
            if (!entity.shapeConstraint) {
                entity.shapeConstraint = 'orthogonal';
                const constraints = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [index, { id: uid(), type: 'perpendicular', reference: { entityId: entity.id, index: (index + 3) % 4 } }]));
                entity.edgeConstraints = { ...constraints, ...(entity.edgeConstraints || {}) };
            }
        } else if (entity.profileType === 'regular') entity.shapeConstraint = 'equal';
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
        const current = currentConstraintAnchors();
        if (!current.length) return [[]];
        const counterparts = new Map<string, SketchElementRef>();
        const shape = new Map<string, SketchElementRef>();
        current.forEach((anchor) => {
            const entity = document.value.entities.find((item) => item.id === anchor.entityId);
            if (!entity?.points) return;
            entity.points.forEach((_, index) => shape.set(`${entity.id}:${index}`, { entityId: entity.id, index }));

            // Logical-edge editing has exactly one counterpart: the other endpoint of the selected border.
            if (trimmedSelection.value?.entityId === entity.id) {
                const start = trimmedSelection.value.index;
                const end = start + trimmedSelection.value.sourceCount;
                const counterpart = anchor.index === start ? end : anchor.index === end ? start : -1;
                if (counterpart >= 0) counterparts.set(`${entity.id}:${counterpart}`, { entityId: entity.id, index: counterpart });
                return;
            }
            const previous = anchor.index > 0 ? anchor.index - 1 : entityProfileClosed(entity) ? entity.points.length - 1 : -1;
            const next = anchor.index < entity.points.length - 1 || entityProfileClosed(entity) ? (anchor.index + 1) % entity.points.length : -1;
            if (previous >= 0) counterparts.set(`${entity.id}:${previous}`, { entityId: entity.id, index: previous });
            if (next >= 0) counterparts.set(`${entity.id}:${next}`, { entityId: entity.id, index: next });
        });

        const key = (anchors: SketchElementRef[]) => anchors.map((anchor) => `${anchor.entityId}:${anchor.index}`).sort().join('|');
        const unique = (anchors: SketchElementRef[]) => [...new Map(anchors.map((anchor) => [`${anchor.entityId}:${anchor.index}`, anchor])).values()];
        const withoutCounterparts = [...shape.values()].filter((anchor) => !counterparts.has(`${anchor.entityId}:${anchor.index}`));
        const levels = [
            [...shape.values()],
            unique([...current, ...counterparts.values()]),
            unique([...current, ...withoutCounterparts]),
            current,
            [],
        ];
        return [...new Map(levels.map((anchors) => [key(anchors), anchors])).values()];
    }
    function enforceSketchConstraints(rootId = editingSketchId.value, before = cloneDocument(document.value), onRollback?: () => void) {
        const attempted = cloneDocument(document.value);
        let failure: 'limit' | 'conflict' = 'conflict';

        // Try stronger preservation first; endpoint direction variants break ties by changed vertex count.
        for (const anchors of constraintAnchorLevels()) {
            let best: { document: ModelDocument; changed: number } | null = null;
            for (const preferEndpointA of [false, true]) {
                document.value.entities = cloneDocument(attempted).entities;
                const result = runConstraintChain(document.value, rootId, anchors, preferEndpointA, constraintLimit.value, trimmedSelection.value);
                if (result === 'limit') {
                    failure = 'limit';
                    break;
                }
                if (result !== 'ok') continue;
                const candidate = cloneDocument(document.value);
                const changed = changedConstraintPointCount(attempted, candidate);
                if (!best || changed < best.changed) best = { document: candidate, changed };
            }
            if (best) {
                document.value.entities = best.document.entities;
                syncLocalSketchFromDocument();
                return true;
            }
        }

        document.value.entities = before.entities;
        onRollback?.();
        syncLocalSketchFromDocument();
        sketchGesture.rolledBack = isTransforming();
        message.warning(failure === 'limit' ? `约束关联超过 ${constraintLimit.value} 个元素，本次操作已回滚` : '约束链无法同时满足固定元素，本次操作已回滚');
        return false;
    }
    function syncEditingSketch() {
        const before = sketchGesture.before || cloneDocument(document.value);
        if (trimmedSelection.value) {
            const sourceCount = trimmedSelection.value.sourceCount;
            syncTrimmedEntity(sketchPoints.value);
            if (!enforceSketchConstraints(editingSketchId.value, before, () => { if (trimmedSelection.value) trimmedSelection.value.sourceCount = sourceCount; })) return;
            syncLocalSketchFromDocument();
            return;
        }
        if (!editingSketchId.value) return;
        const item = document.value.entities.find((entity) => entity.id === editingSketchId.value);
        if (item) { item.points = sketchPoints.value.map((point) => [...point]); item.profileType = sketchType.value; item.curves = JSON.parse(JSON.stringify(sketchCurves.value)); item.sides = sketchSides.value; item.lockedPoints = [...sketchLockedPoints.value]; item.sectorAngle = sketchSectorAngle.value; item.open = sketchOpen.value; item.profileStartAngle = sketchProfileStartAngle.value; }
        if (!enforceSketchConstraints(editingSketchId.value, before)) return;
        syncLocalSketchFromDocument();
    }
    function selectConstraintRule(entityId: string, index: number, ruleId: string) {
        activeConstraintRule.value = { entityId, index, ruleId };
        selectedPoints.value = [];
        selectedShapes.value = [];
        selectedEdges.value = [{ entityId, index }];
        selectedIds.value = [entityId];
        viewport()?.setActiveConstraintRule(activeConstraintRule.value, activeConstraintRuleData.value?.reference || null);
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
                const entity = document.value.entities.find((item) => item.id === entityId);
                if (entity?.edgeConstraints) {
                    const remaining = constraintRules(entity.edgeConstraints[index]).filter((rule) => rule.type !== type && !(type === 'auto' && ['horizontal', 'vertical'].includes(rule.type)));
                    if (remaining.length) entity.edgeConstraints[index] = remaining;
                    else delete entity.edgeConstraints[index];
                }
            });
            refreshSketch();
            return;
        }
        if (type === 'length') {
            const valid = selected.every(({ entityId, index }) => {
                const entity = document.value.entities.find((item) => item.id === entityId);
                if (!entity?.points || !straightConstraintSegment(entity.points, entity.curves || {}, index)) return false;
                const a = entity.points[index], b = entity.points[(index + 1) % entity.points.length];
                return Math.hypot(b[0] - a[0], b[1] - a[1]) > SKETCH_CONSTRAINT_TOLERANCE;
            });
            if (!valid) return message.warning('固定长度仅适用于非零长度的直线');
            pushHistory();
            selected.forEach(({ entityId, index }) => {
                const entity = document.value.entities.find((item) => item.id === entityId)!;
                const rules = constraintRules(entity.edgeConstraints?.[index]);
                if (rules.some((rule) => rule.type === 'length')) return;
                const a = entity.points![index], b = entity.points![(index + 1) % entity.points!.length];
                rules.push({ id: uid(), type: 'length', length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
                entity.edgeConstraints = { ...(entity.edgeConstraints || {}), [index]: rules };
            });
            refreshSketch();
            return;
        }
        const reference = selected[0];
        const referenceEntity = document.value.entities.find((entity) => entity.id === reference.entityId);
        if (!referenceEntity?.points) return;
        const grouped = new Map<string, number[]>();
        selected.forEach(({ entityId, index }) => grouped.set(entityId, [...grouped.get(entityId) || [], index]));
        const changes = new Map<string, { points: Point2[]; curves: ProfileCurves }>();

        for (const [entityId, indices] of grouped) {
            const entity = document.value.entities.find((item) => item.id === entityId);
            if (!entity?.points) return message.warning('当前点或边无法同时满足该约束，草图未修改');
            if (entityId === reference.entityId && indices.length === 1 && ['parallel', 'perpendicular', 'equal'].includes(type)) continue;
            if (entityId === reference.entityId || ['auto', 'horizontal', 'vertical'].includes(type)) {
                const result = solveSketchConstraints(entity.points, entity.curves || {}, indices, entity.lockedPoints || [], type, entityProfileClosed(entity));
                if (!result) return message.warning('当前点或边无法同时满足该约束，草图未修改');
                if (result.changed) changes.set(entityId, { points: result.points, curves: result.curves });
                continue;
            }
            for (const index of indices) {
                const referencePoints = [referenceEntity.points[reference.index], referenceEntity.points[(reference.index + 1) % referenceEntity.points.length]];
                const sourceCurves = Object.fromEntries(Object.entries(entity.curves || {}).map(([key, curve]) => [Number(key) + 2, curve]));
                const result = solveSketchConstraints([...referencePoints, ...entity.points], sourceCurves, [0, index + 2], (entity.lockedPoints || []).map((point) => point + 2), type, false);
                if (!result) return message.warning('当前点或边无法同时满足该约束，草图未修改');
                if (result.changed) changes.set(entityId, { points: result.points.slice(2), curves: Object.fromEntries(Object.entries(result.curves).filter(([key]) => Number(key) >= 2).map(([key, curve]) => [Number(key) - 2, curve])) });
            }
        }
        if (!changes.size) return;
        pushHistory();
        changes.forEach((change, entityId) => {
            const entity = document.value.entities.find((item) => item.id === entityId)!;
            entity.points = change.points;
            entity.curves = change.curves;
            if (entityId === editingSketchId.value) {
                sketchPoints.value = change.points.map((point) => [...point]);
                sketchCurves.value = change.curves;
            }
        });
        selected.forEach(({ entityId, index }) => {
            if (['parallel', 'perpendicular', 'equal'].includes(type) && entityId === reference.entityId && index === reference.index) return;
            const entity = document.value.entities.find((item) => item.id === entityId)!;
            const a = entity.points![index], b = entity.points![(index + 1) % entity.points!.length];
            const resolved = type === 'auto' ? (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'horizontal' : 'vertical') : type;
            const rules = constraintRules(entity.edgeConstraints?.[index]);
            const next = { id: uid(), type: resolved, reference: ['parallel', 'perpendicular', 'equal'].includes(type) ? reference : undefined };
            if (!rules.some((rule) => rule.type === next.type && rule.reference?.entityId === next.reference?.entityId && rule.reference?.index === next.reference?.index)) rules.push(next);
            entity.edgeConstraints = { ...(entity.edgeConstraints || {}), [index]: rules };
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
