import type { ModelDocument, ModelEntity, Point2, SketchCurve, SketchProfilePart } from '../types';
import { cloneEntity } from '../utils/entity';
import { uid } from '../utils/id';
import { cloneProfilePart, rotateProfilePart } from './sketchAdvanced';
import { patternEntityName } from './sketchLinearPattern';

export interface RadialPatternValue { count: number; angle: number }

/** Full circles reserve equal space for the source instead of adding a coincident 360-degree copy. */
export function radialPatternStep(value: RadialPatternValue) {
    return Math.abs(value.angle) >= 359.999 ? value.angle / (Math.round(value.count) + 1) : value.angle / Math.max(1, Math.round(value.count));
}

export function radialPatternCopies(source: SketchProfilePart[], center: Point2, value: RadialPatternValue) {
    const step = radialPatternStep(value);
    return Array.from({ length: Math.max(0, Math.round(value.count)) }, (_, index) => (index + 1) * step)
        .flatMap((angle) => source.map((part) => rotateProfilePart(cloneProfilePart(part), center, angle)));
}

function rotatePoint(point: Point2, center: Point2, angle: number): Point2 {
    const radians = angle * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
    const dx = point[0] - center[0], dy = point[1] - center[1];
    return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
}

function rotateCurve(curve: SketchCurve, center: Point2, angle: number): SketchCurve {
    const move = (point: Point2) => rotatePoint(point, center, angle);
    if (curve.kind === 'line') return { ...curve, a: move(curve.a), b: move(curve.b) };
    if (curve.kind === 'cubic') return { ...curve, a: move(curve.a), c1: move(curve.c1), c2: move(curve.c2), b: move(curve.b) };
    return { ...curve, center: move(curve.center), rotation: curve.rotation + angle * Math.PI / 180 };
}

/** Rotate complete semantic sketch entities and preserve their names, curves and self references. */
export function radialPatternEntities(document: ModelDocument, sourceIds: string[], center: Point2, value: RadialPatternValue) {
    const pending: ModelEntity[] = [];
    const step = radialPatternStep(value);
    sourceIds.forEach((sourceId) => {
        const source = document.entities.find((entity) => entity.id === sourceId && entity.kind === 'sketch');
        if (!source) return;
        for (let copy = 1; copy <= Math.round(value.count); copy++) {
            const angle = step * copy;
            const entity = cloneEntity(source);
            entity.id = uid();
            entity.name = patternEntityName(document, source, pending);
            entity.points = source.points?.map((point) => rotatePoint(point, center, angle));
            entity.parts = source.parts?.map((part) => rotateProfilePart(cloneProfilePart(part), center, angle));
            Object.values(entity.curves || {}).forEach((curve) => {
                curve.c1 = rotatePoint(curve.c1, center, angle);
                curve.c2 = rotatePoint(curve.c2, center, angle);
            });
            Object.entries(entity.analyticCurves || {}).forEach(([index, curve]) => { entity.analyticCurves![Number(index)] = rotateCurve(curve, center, angle); });
            Object.values(entity.edgeConstraints || {}).forEach((rules) => (Array.isArray(rules) ? rules : [rules]).forEach((rule) => {
                if (rule.reference?.entityId === source.id) rule.reference.entityId = entity.id;
            }));
            pending.push(entity);
        }
    });
    return pending;
}

/** Pivot targets are explicit user-visible handles only, never inferred centers or axis projections. */
export function radialPatternCenterReferences(entities: ModelEntity[], planeId: string | null, excludedIds: string[] = []) {
    const excluded = new Set(excludedIds);
    const references: Point2[] = [];
    entities.filter((entity) => entity.kind === 'sketch' && entity.visible && !excluded.has(entity.id) && (!planeId || entity.planeId === planeId)).forEach((entity) => {
        if (entity.parts?.length) {
            entity.parts.forEach((part) => part.points.forEach((point) => references.push([...point])));
            return;
        }
        const controls = entity.controlPoints || (entity.points || []).map((_, index) => index);
        controls.forEach((index) => {
            const point = entity.points?.[index];
            if (point) references.push([...point]);
        });
    });
    return references.filter((point, index) => references.findIndex((candidate) => Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) < 1e-7) === index);
}

export function snapRadialPatternCenter(point: Point2, references: Point2[], threshold: number) {
    let reference: Point2 | null = null;
    let distance = threshold;
    references.forEach((candidate) => {
        const candidateDistance = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
        if (candidateDistance > distance) return;
        reference = candidate;
        distance = candidateDistance;
    });
    return { point: reference ? [...reference] as Point2 : [...point] as Point2, reference: reference ? [...reference] as Point2 : null };
}
