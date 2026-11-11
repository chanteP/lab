import { borderSegments } from './sketchBorders';
import { constraintRules } from './sketchConstraints';
import { cloneEntity } from '../utils/entity';
import type { ModelEntity, Point2, SketchCurve } from '../types';

export interface SketchEntityFragment {
    sourceIndex: number;
    points: Point2[];
    curve?: { c1: Point2; c2: Point2 };
    analyticCurve?: SketchCurve;
}

/** Remove selected semantic points/whole borders and return surviving source-indexed fragments. */
export function deleteSketchEntityItems(source: ModelEntity, pointIndices: number[], edgeIndices: number[]) {
    const entity = cloneEntity(source);
    const originalPoints = source.points || [];
    const removedPoints = new Set(pointIndices.filter((index) => index >= 0 && index < originalPoints.length));
    if (removedPoints.size && ['circle', 'ellipse', 'regular', 'arc'].includes(source.profileType || '')) return { source: entity, fragments: [] as SketchEntityFragment[] };
    if (originalPoints.length - removedPoints.size < (originalPoints.length ? 2 : 0)) return { source: entity, fragments: [] as SketchEntityFragment[] };

    const pointMap = originalPoints.map((_, index) => removedPoints.has(index) ? null : index - [...removedPoints].filter((removed) => removed < index).length);
    if (removedPoints.size && entity.points) {
        entity.points = entity.points.filter((_, index) => !removedPoints.has(index));
        entity.lockedPoints = source.lockedPoints?.map((index) => pointMap[index]).filter((index): index is number => index !== null && index !== undefined);
        entity.controlPoints = source.controlPoints?.map((index) => pointMap[index]).filter((index): index is number => index !== null && index !== undefined);
        entity.constraintEdges = source.constraintEdges?.map((index) => pointMap[index]).filter((index): index is number => index !== null && index !== undefined);
        const removedEdge = (index: number) => removedPoints.has(index) || removedPoints.has((index + 1) % originalPoints.length);
        const remapRecord = <T>(record: Record<number, T> | undefined) => Object.fromEntries(Object.entries(record || {}).flatMap(([key, value]) => {
            const oldIndex = Number(key), index = pointMap[oldIndex];
            return index !== null && index !== undefined && !removedEdge(oldIndex) ? [[index, value]] : [];
        }));
        entity.curves = remapRecord(source.curves);
        entity.analyticCurves = remapRecord(source.analyticCurves);
        entity.edgeConstraints = Object.fromEntries(Object.entries(source.edgeConstraints || {}).flatMap(([key, input]) => {
            const oldIndex = Number(key), index = pointMap[oldIndex];
            if (index === null || index === undefined || removedEdge(oldIndex)) return [];
            const rules = constraintRules(input).flatMap((rule) => {
                if (!rule.reference || rule.reference.entityId !== source.id) return [{ ...rule }];
                const reference = pointMap[rule.reference.index];
                return reference !== null && reference !== undefined && !removedEdge(rule.reference.index) ? [{ ...rule, reference: { entityId: source.id, index: reference } }] : [];
            });
            return rules.length ? [[index, rules]] : [];
        }));
        delete entity.standardShape;
    }

    const selectedEdges = new Set(edgeIndices.filter((oldIndex) => !removedPoints.size || (!removedPoints.has(oldIndex) && !removedPoints.has((oldIndex + 1) % originalPoints.length)))
        .map((index) => removedPoints.size ? pointMap[index] : index).filter((index): index is number => index !== null && index !== undefined));
    const fragments: SketchEntityFragment[] = [];
    const addSegment = (segment: ReturnType<typeof borderSegments>[number], sourceIndex = segment.index) => {
        if (selectedEdges.has(sourceIndex)) return;
        fragments.push({
            sourceIndex, points: segment.points.map((point) => [...point] as Point2),
            curve: segment.curve?.kind === 'cubic' ? { c1: [...segment.curve.c1], c2: [...segment.curve.c2] } : undefined,
            analyticCurve: segment.curve ? JSON.parse(JSON.stringify(segment.curve)) : undefined,
        });
    };
    borderSegments(entity).forEach((segment) => {
        const indices = Array.from({ length: segment.sourceCount }, (_, offset) => segment.index + offset);
        if (!indices.some((index) => selectedEdges.has(index))) {
            addSegment(segment);
            return;
        }
        indices.forEach((sourceIndex) => {
            if (selectedEdges.has(sourceIndex)) return;
            const a = entity.points?.[sourceIndex], b = entity.points?.[(sourceIndex + 1) % (entity.points?.length || 0)];
            if (!a || !b) return;
            const curve = entity.analyticCurves?.[sourceIndex] || (entity.curves?.[sourceIndex] ? {
                kind: 'cubic' as const, a: [...a] as Point2, c1: [...entity.curves![sourceIndex].c1] as Point2,
                c2: [...entity.curves![sourceIndex].c2] as Point2, b: [...b] as Point2,
            } : undefined);
            addSegment({ entityId: entity.id, index: sourceIndex, sourceCount: 1, points: curve ? [a, b] : [[...a], [...b]], closed: false, curve }, sourceIndex);
        });
    });
    return { source: entity, fragments };
}
