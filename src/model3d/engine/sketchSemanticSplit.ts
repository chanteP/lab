import { profilePoints } from './profiles';
import { cloneEntity } from '../utils/entity';
import type { ModelEntity, Point2 } from '../types';

/** Semantic shapes become independent open lines after a Bezier edge has been edited. */
export function splitSemanticShapeToLines(source: ModelEntity, createId: () => string): ModelEntity[] {
    const type = source.profileType;
    if (!['rectangle', 'regular'].includes(type || '')) return [];
    const points = type === 'regular'
        ? profilePoints('regular', source.points || [], 64, undefined, source.sides)
        : (source.points || []).map((point) => [...point] as Point2);
    if (points.length < 2) return [];
    const lines = points.map((a, index) => {
        const b = points[(index + 1) % points.length];
        const entity = cloneEntity(source);
        entity.id = createId();
        entity.profileType = 'line';
        entity.open = true;
        entity.points = [[...a], [...b]];
        entity.curves = source.curves?.[index] ? { 0: JSON.parse(JSON.stringify(source.curves[index])) } : {};
        entity.analyticCurves = source.analyticCurves?.[index] ? { 0: JSON.parse(JSON.stringify(source.analyticCurves[index])) } : {};
        delete entity.parts;
        delete entity.sides;
        delete entity.sectorAngle;
        if (source.constraintEdges?.includes(index)) entity.constraintEdges = [0];
        else delete entity.constraintEdges;
        delete entity.edgeConstraints;
        entity.lockedPoints = [index, (index + 1) % points.length]
            .map((point, pointIndex) => source.lockedPoints?.includes(point) ? pointIndex : -1)
            .filter((pointIndex) => pointIndex >= 0);
        if (!entity.lockedPoints.length) delete entity.lockedPoints;
        delete entity.controlPoints;
        delete entity.trimmed;
        delete entity.standardShape;
        delete entity.profileStartAngle;
        return entity;
    });

    // Rules and references belong to logical edges, so split lines keep both on edge zero.
    lines.forEach((entity, index) => {
        const rules = source.edgeConstraints?.[index];
        if (!rules) return;
        const remap = (reference: { entityId: string; index: number } | undefined) => {
            if (reference?.entityId !== source.id) return reference ? { ...reference } : undefined;
            return lines[reference.index] ? { entityId: lines[reference.index].id, index: 0 } : undefined;
        };
        entity.edgeConstraints = {
            0: (Array.isArray(rules) ? rules : [rules]).map((rule) => ({
                ...JSON.parse(JSON.stringify(rule)), ...(rule.reference ? { reference: remap(rule.reference) } : {}),
            })),
        };
    });
    return lines;
}
