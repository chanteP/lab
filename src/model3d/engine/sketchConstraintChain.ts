import { constraintRules, straightConstraintSegment } from './sketchConstraints';
import type { ModelDocument, ModelEntity, Point2, SketchEdgeConstraint, SketchElementRef, TrimmedSelection } from '../types';

/** Continuous sketch-constraint propagation without Vue or viewport dependencies. */
export const SKETCH_CONSTRAINT_TOLERANCE = 0.0001;
export function constraintResidual(document: ModelDocument, entity: ModelEntity, index: number, rule: SketchEdgeConstraint) {
    if (!entity.points) return Number.POSITIVE_INFINITY;
    const a = entity.points[index], b = entity.points[(index + 1) % entity.points.length];
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    const type = rule.type === 'auto' ? (Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical') : rule.type;
    if (type === 'horizontal') return Math.abs(dy);
    if (type === 'vertical') return Math.abs(dx);
    if (type === 'length') return rule.length! > 0 ? Math.abs(length - rule.length!) : Number.POSITIVE_INFINITY;

    const reference = rule.reference && document.entities.find((item) => item.id === rule.reference!.entityId);
    const referenceIndex = rule.reference?.index;
    const referenceA = reference?.points?.[referenceIndex!], referenceB = reference?.points?.[(referenceIndex! + 1) % reference.points.length];
    if (!referenceA || !referenceB) return Number.POSITIVE_INFINITY;
    if (type === 'equal') return Math.abs(length - Math.hypot(referenceB[0] - referenceA[0], referenceB[1] - referenceA[1]));
    const referenceAngle = Math.atan2(referenceB[1] - referenceA[1], referenceB[0] - referenceA[0]) + (type === 'perpendicular' ? Math.PI / 2 : 0);
    const currentAngle = Math.atan2(dy, dx);
    return Math.abs(Math.sin(currentAngle - referenceAngle)) * length;
}
export function constraintPriorityIndices(entity: ModelEntity, softAnchors: SketchElementRef[]) {
    return new Set(softAnchors.filter((anchor) => anchor.entityId === entity.id).map((anchor) => anchor.index));
}
export function enforceEntityConstraints(document: ModelDocument, entity: ModelEntity, softAnchors: SketchElementRef[], preferEndpointA: boolean, trimmedSelection: TrimmedSelection | null) {
    if (!entity.points) return true;
    const originalPoints = entity.points.map((point) => [...point] as Point2);
    const priority = constraintPriorityIndices(entity, softAnchors);
    const anchored = new Set([...(entity.lockedPoints || []), ...priority]);

    for (const [key, constraints] of Object.entries(entity.edgeConstraints || {})) {
        for (const rule of constraintRules(constraints)) {
            if (entity.shapeConstraint === 'orthogonal' && rule.type === 'perpendicular') continue;
            const index = Number(key), aIndex = index, bIndex = (index + 1) % entity.points.length;
            if (constraintResidual(document, entity, index, rule) <= SKETCH_CONSTRAINT_TOLERANCE) continue;
            const a = entity.points[aIndex], b = entity.points[bIndex];
            const reference = rule.reference && document.entities.find((item) => item.id === rule.reference!.entityId);
            const referenceIndex = rule.reference?.index;
            const referenceA = reference?.points?.[referenceIndex!], referenceB = reference?.points?.[(referenceIndex! + 1) % reference.points.length];
            const type = rule.type === 'auto' ? (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'horizontal' : 'vertical') : rule.type;

            // A referenced rule may be satisfied from the other end of the chain without moving fixed/current points.
            if (anchored.has(aIndex) && anchored.has(bIndex)) {
                if (rule.reference) continue;
                return false;
            }
            const adjustA = anchored.has(aIndex) ? false : anchored.has(bIndex) ? true : preferEndpointA;
            const anchor = adjustA ? b : a;
            const moving = adjustA ? a : b;
            if (type === 'horizontal') moving[1] = anchor[1];
            else if (type === 'vertical') moving[0] = anchor[0];
            else if ((type === 'equal' || type === 'length') && (type === 'length' || referenceA && referenceB)) {
                const length = type === 'length' ? rule.length! : Math.hypot(referenceB![0] - referenceA![0], referenceB![1] - referenceA![1]);
                if (Math.hypot(moving[0] - anchor[0], moving[1] - anchor[1]) < SKETCH_CONSTRAINT_TOLERANCE) return false;
                const angle = Math.atan2(moving[1] - anchor[1], moving[0] - anchor[0]);
                moving[0] = anchor[0] + Math.cos(angle) * length;
                moving[1] = anchor[1] + Math.sin(angle) * length;
            } else if ((type === 'parallel' || type === 'perpendicular') && referenceA && referenceB) {
                const base = Math.atan2(referenceB[1] - referenceA[1], referenceB[0] - referenceA[0]) + (type === 'perpendicular' ? Math.PI / 2 : 0);
                const current = Math.atan2(moving[1] - anchor[1], moving[0] - anchor[0]);
                const desired = base + Math.round(Math.atan2(Math.sin(current - base), Math.cos(current - base)) / Math.PI) * Math.PI;
                const length = Math.hypot(moving[0] - anchor[0], moving[1] - anchor[1]);
                moving[0] = anchor[0] + Math.cos(desired) * length;
                moving[1] = anchor[1] + Math.sin(desired) * length;
            }
            if (!moving.every(Number.isFinite)) return false;
        }
    }

    // Incoming rules let a preserved target edge drive its reference instead of forcing its other endpoint to move.
    for (const source of document.entities) {
        if (source.id === entity.id || !source.points) continue;
        for (const [key, constraints] of Object.entries(source.edgeConstraints || {})) {
            for (const rule of constraintRules(constraints)) {
                if (rule.reference?.entityId !== entity.id) continue;
                const sourceIndex = Number(key), referenceIndex = rule.reference.index;
                if (constraintResidual(document, source, sourceIndex, rule) <= SKETCH_CONSTRAINT_TOLERANCE) continue;
                const aIndex = referenceIndex, bIndex = (referenceIndex + 1) % entity.points.length;
                const a = entity.points[aIndex], b = entity.points[bIndex];
                const sourceA = source.points[sourceIndex], sourceB = source.points[(sourceIndex + 1) % source.points.length];
                if (!a || !b || !sourceA || !sourceB) return false;
                if (anchored.has(aIndex) && anchored.has(bIndex)) continue;

                const adjustA = anchored.has(aIndex) ? false : anchored.has(bIndex) ? true : preferEndpointA;
                const anchor = adjustA ? b : a;
                const moving = adjustA ? a : b;
                if (rule.type === 'equal') {
                    const length = Math.hypot(sourceB[0] - sourceA[0], sourceB[1] - sourceA[1]);
                    const angle = Math.atan2(moving[1] - anchor[1], moving[0] - anchor[0]);
                    moving[0] = anchor[0] + Math.cos(angle) * length;
                    moving[1] = anchor[1] + Math.sin(angle) * length;
                } else if (rule.type === 'parallel' || rule.type === 'perpendicular') {
                    const base = Math.atan2(sourceB[1] - sourceA[1], sourceB[0] - sourceA[0]) + (rule.type === 'perpendicular' ? Math.PI / 2 : 0);
                    const current = Math.atan2(moving[1] - anchor[1], moving[0] - anchor[0]);
                    const desired = base + Math.round(Math.atan2(Math.sin(current - base), Math.cos(current - base)) / Math.PI) * Math.PI;
                    const length = Math.hypot(moving[0] - anchor[0], moving[1] - anchor[1]);
                    moving[0] = anchor[0] + Math.cos(desired) * length;
                    moving[1] = anchor[1] + Math.sin(desired) * length;
                }
                if (!moving.every(Number.isFinite)) return false;
            }
        }
    }

    if (entity.shapeConstraint === 'orthogonal' && entity.points.length === 4) {
        const [a, b, d] = entity.points;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const directionLength = Math.hypot(dx, dy);
        const equalRule = Array.from({ length: 4 }, (_, index) => constraintRules(entity.edgeConstraints?.[index]).find((rule) => rule.type === 'equal' && rule.reference)).find(Boolean);
        const reference = equalRule && document.entities.find((item) => item.id === equalRule.reference!.entityId);
        const referenceIndex = equalRule?.reference?.index;
        const referenceA = reference?.points?.[referenceIndex!], referenceB = reference?.points?.[(referenceIndex! + 1) % reference.points.length];
        const firstLength = referenceA && referenceB ? Math.hypot(referenceB[0] - referenceA[0], referenceB[1] - referenceA[1]) : directionLength;
        const draggedEqualEdge = trimmedSelection?.entityId === entity.id && !!equalRule;
        if (draggedEqualEdge) {
            const index = trimmedSelection!.index;
            const targetA = entity.points[index], targetB = entity.points[(index + 1) % 4];
            const targetDx = targetB[0] - targetA[0], targetDy = targetB[1] - targetA[1];
            const originalA = originalPoints[index], originalB = originalPoints[(index + 1) % 4], originalNext = originalPoints[(index + 2) % 4];
            const originalDx = originalB[0] - originalA[0], originalDy = originalB[1] - originalA[1];
            const sign = Math.sign(-originalDy * (originalNext[0] - originalB[0]) + originalDx * (originalNext[1] - originalB[1])) || 1;

            // Preserve the target edge chosen by the candidate solver and rebuild only the other two square corners.
            if (Math.hypot(targetDx, targetDy) > SKETCH_CONSTRAINT_TOLERANCE) {
                const offset: Point2 = [-targetDy * sign, targetDx * sign];
                entity.points[(index + 2) % 4] = [targetB[0] + offset[0], targetB[1] + offset[1]];
                entity.points[(index + 3) % 4] = [targetA[0] + offset[0], targetA[1] + offset[1]];
            }
        } else if (directionLength > 0.000001 && firstLength > 0.000001) {
            const secondLength = referenceA && referenceB ? Math.hypot(referenceB[0] - referenceA[0], referenceB[1] - referenceA[1]) : Math.hypot(d[0] - b[0], d[1] - b[1]);
            const sign = Math.sign(dx * (d[1] - b[1]) - dy * (d[0] - b[0])) || 1;
            const perpendicular: Point2 = [-dy / directionLength * sign, dx / directionLength * sign];
            if (secondLength > 0.000001) {
                const nextB: Point2 = [a[0] + dx / directionLength * firstLength, a[1] + dy / directionLength * firstLength];
                entity.points[0] = a;
                entity.points[1] = nextB;
                entity.points[2] = [nextB[0] + perpendicular[0] * secondLength, nextB[1] + perpendicular[1] * secondLength];
                entity.points[3] = [a[0] + perpendicular[0] * secondLength, a[1] + perpendicular[1] * secondLength];
            }
        }
    }
    if ([...anchored].some((index) => originalPoints[index] && Math.hypot(entity.points![index][0] - originalPoints[index][0], entity.points![index][1] - originalPoints[index][1]) > SKETCH_CONSTRAINT_TOLERANCE)) return false;

    Object.entries(entity.curves || {}).forEach(([key, curve]) => {
        const index = Number(key);
        if (entity.shapeConstraint !== 'orthogonal' && !straightConstraintSegment(originalPoints, entity.curves || {}, index)) return;
        const a = entity.points![index], b = entity.points![(index + 1) % entity.points!.length];
        curve.c1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
        curve.c2 = [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3];
    });
    return true;
}
export function changedConstraintPointCount(source: ModelDocument, target: ModelDocument) {
    let count = 0;
    target.entities.forEach((entity) => {
        const original = source.entities.find((item) => item.id === entity.id);
        entity.points?.forEach((point, index) => {
            const before = original?.points?.[index];
            if (before && Math.hypot(point[0] - before[0], point[1] - before[1]) > SKETCH_CONSTRAINT_TOLERANCE) count++;
        });
    });
    return count;
}
export function runConstraintChain(document: ModelDocument, rootId: string | null, softAnchors: SketchElementRef[], preferEndpointA: boolean, limit: number, trimmedSelection: TrimmedSelection | null): 'ok' | 'limit' | 'conflict' {
    const queue = rootId ? [rootId] : document.entities.filter((entity) => entity.edgeConstraints).map((entity) => entity.id);
    const visited = new Set<string>();
    while (queue.length) {
        if (visited.size >= limit) return 'limit';
        const entityId = queue.shift()!;
        if (visited.has(entityId)) continue;
        const entity = document.entities.find((item) => item.id === entityId);
        if (!entity) continue;
        visited.add(entityId);
        if (!enforceEntityConstraints(document, entity, softAnchors, preferEndpointA, trimmedSelection)) return 'conflict';

        const related = new Set<string>();
        Object.values(entity.edgeConstraints || {}).forEach((value) => constraintRules(value).forEach((rule) => {
            if (rule.reference) related.add(rule.reference.entityId);
        }));
        document.entities.forEach((candidate) => Object.values(candidate.edgeConstraints || {}).forEach((value) => constraintRules(value).forEach((rule) => {
            if (rule.reference?.entityId === entityId) related.add(candidate.id);
        })));
        related.forEach((id) => { if (!visited.has(id)) queue.push(id); });
    }
    for (const entityId of visited) {
        const entity = document.entities.find((item) => item.id === entityId);
        if (!entity) continue;
        for (const [key, constraints] of Object.entries(entity.edgeConstraints || {})) {
            if (constraintRules(constraints).some((rule) => constraintResidual(document, entity, Number(key), rule) > SKETCH_CONSTRAINT_TOLERANCE)) {
                return 'conflict';
            }
        }
    }
    return 'ok';
}
