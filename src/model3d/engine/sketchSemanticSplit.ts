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
    return points.map((a, index) => {
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
        delete entity.constraintEdges;
        delete entity.edgeConstraints;
        delete entity.lockedPoints;
        delete entity.controlPoints;
        delete entity.trimmed;
        delete entity.profileStartAngle;
        return entity;
    });
}
