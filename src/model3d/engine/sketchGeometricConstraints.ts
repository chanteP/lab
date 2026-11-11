import type { ModelEntity, Point2, SketchEdgeConstraint, SketchElementRef } from '../types';
import { entityConstraintSegment } from './sketchConstraints';
import { standardShapeCenter } from './sketchWholeShapeSnap';

export type SketchConstraintGeometry =
    | { kind: 'line'; a: Point2; b: Point2 }
    | { kind: 'ellipse'; center: Point2; radiusX: number; radiusY: number; rotation: number };

const EPSILON = 1e-9;
const distance = (a: Point2, b: Point2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Semantic circle/ellipse borders and ordinary straight borders share one constraint descriptor. */
export function sketchConstraintGeometry(entity: ModelEntity, index: number): SketchConstraintGeometry | null {
    const type = entity.profileType || 'polygon';
    const points = entity.points || [];
    if (['circle', 'ellipse'].includes(type) && points.length >= 2) {
        const sector = (entity.sectorAngle ?? 360) < 359.999;
        if (index !== (sector ? 1 : 0)) return null;
        const center = points[0], edge = points[1], vertical = points[2] || [center[0], center[1] + 1];
        const radiusX = distance(center, edge), radiusY = type === 'circle' ? radiusX : distance(center, vertical);
        if (Math.min(radiusX, radiusY) < EPSILON) return null;
        return { kind: 'ellipse', center: [...center], radiusX, radiusY, rotation: type === 'circle' ? 0 : Math.atan2(edge[1] - center[1], edge[0] - center[0]) };
    }
    const analytic = entity.analyticCurves?.[index];
    if (analytic?.kind === 'ellipse') return {
        kind: 'ellipse', center: [...analytic.center], radiusX: analytic.radiusX, radiusY: analytic.radiusY, rotation: analytic.rotation,
    };
    if (!entityConstraintSegment(entity, index)) return null;
    return { kind: 'line', a: [...points[index]], b: [...points[(index + 1) % points.length]] };
}

export function sketchConstraintCenter(entity: ModelEntity): Point2 | null {
    if (['circle', 'ellipse'].includes(entity.profileType || '')) return entity.points?.[0] ? [...entity.points[0]] : null;
    return standardShapeCenter(entity);
}

export function sketchGeometricSelection(documentEntities: ModelEntity[], selection: SketchElementRef[]) {
    const refs = selection.map((ref) => ({ ref, entity: documentEntities.find((entity) => entity.id === ref.entityId) })).filter((item) => !!item.entity);
    const geometries = refs.map(({ entity, ref }) => sketchConstraintGeometry(entity!, ref.index));
    return {
        tangent: refs.length >= 2 && refs.length === selection.length && geometries.every(Boolean) && geometries.some((geometry) => geometry?.kind === 'ellipse'),
        concentric: refs.length >= 2 && refs.length === selection.length && refs.every(({ entity }) => !!sketchConstraintCenter(entity!)),
    };
}

function support(ellipse: Extract<SketchConstraintGeometry, { kind: 'ellipse' }>, normal: Point2) {
    const ux = Math.cos(ellipse.rotation), uy = Math.sin(ellipse.rotation);
    const u = normal[0] * ux + normal[1] * uy;
    const v = -normal[0] * uy + normal[1] * ux;
    return Math.hypot(ellipse.radiusX * u, ellipse.radiusY * v);
}

function lineTangent(line: Extract<SketchConstraintGeometry, { kind: 'line' }>, ellipse: Extract<SketchConstraintGeometry, { kind: 'ellipse' }>) {
    const dx = line.b[0] - line.a[0], dy = line.b[1] - line.a[1], length = Math.hypot(dx, dy);
    if (length < EPSILON) return null;
    const normal: Point2 = [-dy / length, dx / length];
    return Math.abs(normal[0] * (ellipse.center[0] - line.a[0]) + normal[1] * (ellipse.center[1] - line.a[1])) - support(ellipse, normal);
}

function ellipsePairTangent(a: Extract<SketchConstraintGeometry, { kind: 'ellipse' }>, b: Extract<SketchConstraintGeometry, { kind: 'ellipse' }>, mode: 'external' | 'internal') {
    const dx = b.center[0] - a.center[0], dy = b.center[1] - a.center[1], centerDistance = Math.hypot(dx, dy);
    if (centerDistance < EPSILON) return null;
    const direction: Point2 = [dx / centerDistance, dy / centerDistance];
    const radiusA = support(a, direction), radiusB = support(b, direction);
    return centerDistance - (mode === 'external' ? radiusA + radiusB : Math.abs(radiusA - radiusB));
}

export function inferSketchTangentMode(entity: ModelEntity, index: number, reference: ModelEntity, referenceIndex: number): 'external' | 'internal' | undefined {
    const a = sketchConstraintGeometry(entity, index), b = sketchConstraintGeometry(reference, referenceIndex);
    if (a?.kind !== 'ellipse' || b?.kind !== 'ellipse') return undefined;
    const centerDistance = distance(a.center, b.center);
    const direction: Point2 = centerDistance > EPSILON ? [(b.center[0] - a.center[0]) / centerDistance, (b.center[1] - a.center[1]) / centerDistance] : [1, 0];
    return centerDistance < support(a, direction) + support(b, direction) ? 'internal' : 'external';
}

/** Residual consumed by the same iterative document solver as line constraints. */
export function sketchGeometricResidual(entity: ModelEntity, index: number, rule: SketchEdgeConstraint, reference: ModelEntity, referenceIndex: number) {
    if (rule.type === 'concentric') {
        const a = sketchConstraintCenter(entity), b = sketchConstraintCenter(reference);
        return a && b ? distance(a, b) : null;
    }
    if (rule.type !== 'tangent') return null;
    const a = sketchConstraintGeometry(entity, index), b = sketchConstraintGeometry(reference, referenceIndex);
    if (!a || !b) return null;
    if (a.kind === 'line' && b.kind === 'ellipse') return lineTangent(a, b);
    if (a.kind === 'ellipse' && b.kind === 'line') return lineTangent(b, a);
    if (a.kind === 'ellipse' && b.kind === 'ellipse') return ellipsePairTangent(a, b, rule.tangentMode || 'external');
    return null;
}
