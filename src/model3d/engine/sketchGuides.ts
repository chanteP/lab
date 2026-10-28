import { entityProfileClosed, profilePoints } from './profiles';
import type { ModelEntity, Point2 } from '../types';

export type SketchGuideReference =
    | { kind: 'point'; entityId: string; index: number; point: Point2 }
    | { kind: 'line'; entityId: string; index: number; a: Point2; b: Point2 }
    | { kind: 'origin'; id: 'world' | 'plane'; point: Point2 };

export interface SketchGuideMatch {
    point: Point2;
    a: Point2;
    b: Point2;
    reference: SketchGuideReference;
    distance: number;
}

export interface SketchGuideRequest {
    entities: ModelEntity[];
    point: Point2;
    edgeStart?: Point2;
    excludeEntityId?: string | null;
    excludePoint?: { entityId: string; index: number };
    origins?: { id: 'world' | 'plane'; point: Point2 }[];
    threshold: number;
}

type Candidate = SketchGuideMatch;

const subtract = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const length = (point: Point2) => Math.hypot(point[0], point[1]);
const normalize = (point: Point2): Point2 => {
    const size = length(point) || 1;
    return [point[0] / size, point[1] / size];
};

function projectToLine(point: Point2, origin: Point2, direction: Point2): Point2 {
    const delta = subtract(point, origin);
    const distance = delta[0] * direction[0] + delta[1] * direction[1];
    return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance];
}

function straightSegments(entity: ModelEntity) {
    const type = entity.profileType || 'polygon';
    if (!['polygon', 'rectangle', 'regular', 'line'].includes(type)) return [];
    const points = type === 'regular' ? profilePoints(type, entity.points || [], 64, undefined, entity.sides) : entity.points || [];
    const closed = entityProfileClosed(entity);
    const count = closed ? points.length : points.length - 1;
    return Array.from({ length: Math.max(0, count) }, (_, index) => ({
        index,
        a: points[index],
        b: points[(index + 1) % points.length],
        curve: entity.curves?.[index],
    })).filter(({ a, b, curve }) => {
        if (!a || !b || length(subtract(b, a)) < 0.0001) return false;
        if (!curve) return true;
        const direction = subtract(b, a);
        return [curve.c1, curve.c2].every((control) => Math.abs(direction[0] * (control[1] - a[1]) - direction[1] * (control[0] - a[0])) < 0.0001);
    });
}

/** Collect semantic source points and straight edges; tessellated curves never become references. */
function references(entities: ModelEntity[], excludeEntityId?: string | null, excludePoint?: SketchGuideRequest['excludePoint']) {
    const points: Extract<SketchGuideReference, { kind: 'point' }>[] = [];
    const lines: Extract<SketchGuideReference, { kind: 'line' }>[] = [];
    entities.forEach((entity) => {
        if (entity.id === excludeEntityId) return;
        (entity.points || []).forEach((point, index) => {
            if (excludePoint?.entityId !== entity.id || excludePoint.index !== index) points.push({ kind: 'point', entityId: entity.id, index, point });
        });
        straightSegments(entity).forEach(({ index, a, b }) => lines.push({ kind: 'line', entityId: entity.id, index, a, b }));
    });
    return { points, lines };
}

/** Return only the nearest screen-space match, or no guide when the pointer leaves the snap threshold. */
export function matchSketchGuide(request: SketchGuideRequest): SketchGuideMatch | null {
    const { point, edgeStart, threshold, excludeEntityId, excludePoint } = request;
    const refs = references(request.entities, excludeEntityId, excludePoint);
    const candidates: Candidate[] = [];
    const pointReferences: Extract<SketchGuideReference, { kind: 'point' | 'origin' }>[] = [
        ...refs.points,
        ...(request.origins || []).map((origin) => ({ kind: 'origin' as const, id: origin.id, point: origin.point })),
    ];
    pointReferences.forEach((reference) => {
        const vertical: Point2 = [reference.point[0], point[1]];
        candidates.push({ point: vertical, a: reference.point, b: [reference.point[0], reference.point[1] + 1], reference, distance: Math.abs(point[0] - reference.point[0]) });
        const horizontal: Point2 = [point[0], reference.point[1]];
        candidates.push({ point: horizontal, a: reference.point, b: [reference.point[0] + 1, reference.point[1]], reference, distance: Math.abs(point[1] - reference.point[1]) });
    });
    if (edgeStart) refs.lines.forEach((reference) => {
        const direction = normalize(subtract(reference.b, reference.a));
        [direction, [-direction[1], direction[0]] as Point2].forEach((axis) => {
            const projected = projectToLine(point, edgeStart, axis);
            candidates.push({
                point: projected,
                a: edgeStart,
                b: [edgeStart[0] + axis[0], edgeStart[1] + axis[1]],
                reference,
                distance: length(subtract(point, projected)),
            });
        });
    });
    const match = candidates.filter((candidate) => candidate.distance <= threshold).sort((a, b) => a.distance - b.distance)[0];
    return match ? { ...match, point: match.point.map((value) => Math.round(value * 10) / 10) as Point2 } : null;
}
