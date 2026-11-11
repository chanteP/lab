import type { ModelDocument, ModelEntity, Point2, SketchCurve, SketchProfilePart } from '../types';
import { cloneEntity } from '../utils/entity';
import { uid } from '../utils/id';
import { cloneProfilePart, translateProfilePart } from './sketchAdvanced';

export interface LinearPatternValue {
    count: number;
    direction: Point2;
    spacing: number;
}

export interface LinearPatternReference {
    points: Point2[];
    edges: { a: Point2; b: Point2 }[];
}

export interface LinearPatternSnap {
    direction: Point2;
    endpoint: Point2;
    kind: 'axis' | 'edge' | 'point' | null;
    target?: Point2;
}

const normalize = (point: Point2): Point2 => {
    const length = Math.hypot(point[0], point[1]);
    return length > 1e-9 ? [point[0] / length, point[1] / length] : [1, 0];
};

/** Each step is a new copy; the selected source is deliberately not included. */
export function linearPatternCopies(source: SketchProfilePart[], value: LinearPatternValue): SketchProfilePart[] {
    const direction = normalize(value.direction);
    return Array.from({ length: Math.max(0, Math.round(value.count)) }, (_, index) => (index + 1) * value.spacing)
        .flatMap((distance) => source.map((part) => translateProfilePart(cloneProfilePart(part), [direction[0] * distance, direction[1] * distance])));
}

/** Snap direction by screen-space perpendicular error, prioritizing exact reference points. */
export function snapLinearPatternDirection(origin: Point2, pointer: Point2, references: LinearPatternReference, threshold: number): LinearPatternSnap {
    const delta: Point2 = [pointer[0] - origin[0], pointer[1] - origin[1]];
    const distance = Math.hypot(delta[0], delta[1]);
    if (distance < 1e-9) return { direction: [1, 0], endpoint: [...pointer], kind: null };
    const rawDirection = normalize(delta);
    let best: { direction: Point2; kind: LinearPatternSnap['kind']; error: number; priority: number; target?: Point2 } = {
        direction: rawDirection, kind: null, error: Infinity, priority: Infinity,
    };
    const consider = (direction: Point2, kind: LinearPatternSnap['kind'], priority: number, target?: Point2) => {
        const unit = normalize(direction);
        const along = delta[0] * unit[0] + delta[1] * unit[1];
        if (along <= 0) return;
        const error = Math.abs(delta[0] * unit[1] - delta[1] * unit[0]);
        if (error > threshold || priority > best.priority || (priority === best.priority && error >= best.error)) return;
        best = { direction: unit, kind, error, priority, target };
    };
    references.points.forEach((point) => {
        if (Math.hypot(pointer[0] - point[0], pointer[1] - point[1]) <= threshold
            && Math.hypot(point[0] - origin[0], point[1] - origin[1]) > 1e-7) {
            best = { direction: normalize([point[0] - origin[0], point[1] - origin[1]]), kind: 'point', error: 0, priority: -1, target: point };
        }
    });
    ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Point2[]).forEach((direction) => consider(direction, 'axis', 0));
    references.edges.forEach(({ a, b }) => {
        const direction: Point2 = [b[0] - a[0], b[1] - a[1]];
        consider(direction, 'edge', 1, b);
        consider([-direction[0], -direction[1]], 'edge', 1, a);
    });
    return {
        direction: best.direction,
        endpoint: best.target && best.kind === 'point' ? [...best.target] : [origin[0] + best.direction[0] * distance, origin[1] + best.direction[1] * distance],
        kind: best.kind, target: best.target,
    };
}

function translateCurve(curve: SketchCurve, delta: Point2): SketchCurve {
    const move = (point: Point2): Point2 => [point[0] + delta[0], point[1] + delta[1]];
    if (curve.kind === 'line') return { ...curve, a: move(curve.a), b: move(curve.b) };
    if (curve.kind === 'cubic') return { ...curve, a: move(curve.a), c1: move(curve.c1), c2: move(curve.c2), b: move(curve.b) };
    return { ...curve, center: move(curve.center) };
}

export function patternEntityName(document: ModelDocument, source: ModelEntity, pending: ModelEntity[]) {
    const base = source.name.trim().replace(/\s+\d+$/, '') || '草图';
    const entities = [...document.entities, ...pending];
    let index = 1;
    entities.forEach((entity) => {
        const match = entity.name.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`));
        if (match) index = Math.max(index, Number(match[1]) + 1);
    });
    while (entities.some((entity) => entity.name === `${base} ${index}`)) index++;
    return `${base} ${index}`;
}

/** Clone complete sketch data, including semantic handles, constraints and analytic curves. */
export function linearPatternEntities(document: ModelDocument, sourceIds: string[], value: LinearPatternValue): ModelEntity[] {
    const direction = normalize(value.direction);
    const pending: ModelEntity[] = [];
    sourceIds.forEach((sourceId) => {
        const source = document.entities.find((entity) => entity.id === sourceId && entity.kind === 'sketch');
        if (!source) return;
        for (let copy = 1; copy <= Math.round(value.count); copy++) {
            const delta: Point2 = [direction[0] * value.spacing * copy, direction[1] * value.spacing * copy];
            const entity = cloneEntity(source);
            entity.id = uid();
            entity.name = patternEntityName(document, source, pending);
            entity.points = source.points?.map(([x, y]) => [x + delta[0], y + delta[1]] as Point2);
            entity.parts = source.parts?.map((part) => translateProfilePart(cloneProfilePart(part), delta));
            Object.values(entity.curves || {}).forEach((curve) => {
                curve.c1 = [curve.c1[0] + delta[0], curve.c1[1] + delta[1]];
                curve.c2 = [curve.c2[0] + delta[0], curve.c2[1] + delta[1]];
            });
            Object.entries(entity.analyticCurves || {}).forEach(([index, curve]) => { entity.analyticCurves![Number(index)] = translateCurve(curve, delta); });
            Object.values(entity.edgeConstraints || {}).forEach((rules) => (Array.isArray(rules) ? rules : [rules]).forEach((rule) => {
                if (rule.reference?.entityId === source.id) rule.reference.entityId = entity.id;
            }));
            pending.push(entity);
        }
    });
    return pending;
}
