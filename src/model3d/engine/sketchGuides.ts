import { entityProfileClosed, profilePoints } from './profiles';
import type { ModelEntity, ModelFolder, Point2 } from '../types';

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

export interface SketchGuideResult {
    point: Point2;
    matches: SketchGuideMatch[];
}

export interface SketchGuideRequest {
    entities: ModelEntity[];
    folders?: ModelFolder[];
    point: Point2;
    edgeStart?: Point2;
    excludeEntityId?: string | null;
    excludeEntityIds?: string[];
    excludePoint?: { entityId: string; index: number };
    origins?: { id: 'world' | 'plane'; point: Point2 }[];
    threshold: number;
}

type Candidate = SketchGuideMatch & { axis?: 'horizontal' | 'vertical'; priority: number };

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
        if (entity.controlPoints) {
            const index = points.indexOf(a);
            const next = (index + 1) % points.length;
            if (!entity.controlPoints.includes(index) || !entity.controlPoints.includes(next)) return false;
        }
        if (!curve) return true;
        const direction = subtract(b, a);
        return [curve.c1, curve.c2].every((control) => Math.abs(direction[0] * (control[1] - a[1]) - direction[1] * (control[0] - a[0])) < 0.0001);
    });
}

/** Collect semantic source points and straight edges; tessellated curves never become references. */
function references(entities: ModelEntity[], folders: ModelFolder[] = [], excluded = new Set<string>(), excludePoint?: SketchGuideRequest['excludePoint']) {
    const points: Extract<SketchGuideReference, { kind: 'point' }>[] = [];
    const lines: Extract<SketchGuideReference, { kind: 'line' }>[] = [];
    entities.forEach((entity) => {
        if (excluded.has(entity.id)) return;
        const controls = entity.controlPoints || (entity.points || []).map((_, index) => index);
        controls.forEach((index) => {
            const point = entity.points?.[index];
            if (point && (excludePoint?.entityId !== entity.id || excludePoint.index !== index)) points.push({ kind: 'point', entityId: entity.id, index, point });
        });
        if ((entity.profileType || 'polygon') === 'rectangle' && (entity.points?.length || 0) === 4) {
            const [a, , c] = entity.points!;
            points.push({ kind: 'point', entityId: entity.id, index: -1, point: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] });
        }
        straightSegments(entity).forEach(({ index, a, b }) => lines.push({ kind: 'line', entityId: entity.id, index, a, b }));
    });
    folders.forEach((folder) => {
        if (excluded.has(folder.id)) return;
        folder.sketchCorners?.forEach((point, index) => points.push({ kind: 'point', entityId: folder.id, index, point }));
    });
    return { points, lines };
}

/** Snap to a guide intersection when both axes are near; otherwise keep the nearest single match. */
export function matchSketchGuide(request: SketchGuideRequest): SketchGuideResult | null {
    const { point, edgeStart, threshold, excludeEntityId, excludePoint } = request;
    const excluded = new Set([...(request.excludeEntityIds || []), ...(excludeEntityId ? [excludeEntityId] : [])]);
    const refs = references(request.entities, request.folders, excluded, excludePoint);
    const candidates: Candidate[] = [];
    const pointReferences: Extract<SketchGuideReference, { kind: 'point' | 'origin' }>[] = [
        ...refs.points,
        ...(request.origins || []).map((origin) => ({ kind: 'origin' as const, id: origin.id, point: origin.point })),
    ];
    pointReferences.forEach((reference) => {
        candidates.push({ point: [...reference.point], a: reference.point, b: [reference.point[0] + 1, reference.point[1]], reference, distance: length(subtract(point, reference.point)), priority: 0 });
        const vertical: Point2 = [reference.point[0], point[1]];
        candidates.push({ point: vertical, a: reference.point, b: [reference.point[0], reference.point[1] + 1], reference, distance: Math.abs(point[0] - reference.point[0]), axis: 'vertical', priority: 2 });
        const horizontal: Point2 = [point[0], reference.point[1]];
        candidates.push({ point: horizontal, a: reference.point, b: [reference.point[0] + 1, reference.point[1]], reference, distance: Math.abs(point[1] - reference.point[1]), axis: 'horizontal', priority: 2 });
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
                priority: 1,
            });
        });
    });
    const eligible = candidates.filter((candidate) => candidate.distance <= threshold).sort((a, b) => a.priority - b.priority || a.distance - b.distance);
    if (!eligible.length) return null;
    const exact = eligible.find((candidate) => candidate.priority === 0 && candidate.distance <= Math.min(1, threshold * 0.25));
    if (exact) return { point: [...exact.point], matches: [exact] };
    const bestPriority = (eligible.find((candidate) => candidate.priority > 0) || eligible[0]).priority;
    const bestCandidates = eligible.filter((candidate) => candidate.priority === bestPriority);
    const vertical = eligible.find((candidate) => candidate.axis === 'vertical' && candidate.priority === bestPriority);
    const horizontal = eligible.find((candidate) => candidate.axis === 'horizontal' && candidate.priority === bestPriority);
    const matches = vertical && horizontal ? [vertical, horizontal] : bestCandidates.slice(0, 1);
    if (!matches.length) return null;

    const snappedPoint = vertical && horizontal ? [vertical.point[0], horizontal.point[1]] : matches[0].point;
    return {
        point: snappedPoint.map((value) => Math.round(value * 1000000) / 1000000) as Point2,
        matches: matches.map(({ axis: _axis, ...match }) => match),
    };
}
