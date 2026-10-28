import * as THREE from 'three';
import { entityProfileClosed, profilePoints } from './profiles';
import type { ModelEntity, Point2 } from './types';

export interface BorderSegment {
    entityId: string;
    index: number;
    points: Point2[];
    closed: boolean;
}

export function borderSegments(entity: ModelEntity): BorderSegment[] {
    const type = entity.profileType || 'polygon';
    const source = entity.points || [];
    const closed = entityProfileClosed(entity) && (entity.sectorAngle ?? 360) >= 359.999;
    if (['polygon', 'rectangle', 'regular'].includes(type)) {
        const points = type === 'regular' ? profilePoints(type, source, 64, undefined, entity.sides) : source;
        if (points.length < 2) return [];
        const count = closed ? points.length : points.length - 1;
        return Array.from({ length: count }, (_, index) => {
            const a = points[index], b = points[(index + 1) % points.length];
            const curve = entity.curves?.[index];
            const samples = curve ? new THREE.CubicBezierCurve(new THREE.Vector2(...a), new THREE.Vector2(...curve.c1), new THREE.Vector2(...curve.c2), new THREE.Vector2(...b)).getPoints(24).map((point) => [point.x, point.y] as Point2) : [a, b];
            return { entityId: entity.id, index, points: samples, closed: false };
        });
    }
    const points = profilePoints(type, source, 64, entity.curves, entity.sides, entity.sectorAngle, entity.open, entity.profileStartAngle);
    if (points.length < 2) return [];
    return [{ entityId: entity.id, index: 0, points: closed ? [...points, points[0]] : points, closed }];
}

function cross(a: Point2, b: Point2) { return a[0] * b[1] - a[1] * b[0]; }
function sub(a: Point2, b: Point2): Point2 { return [a[0] - b[0], a[1] - b[1]]; }

function intersectLines(a: Point2, b: Point2, c: Point2, d: Point2) {
    const r = sub(b, a), s = sub(d, c);
    const denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-8) return null;
    const delta = sub(c, a);
    const t = cross(delta, s) / denominator;
    const u = cross(delta, r) / denominator;
    const epsilon = 1e-6;
    return t > epsilon && t < 1 - epsilon && u >= -epsilon && u <= 1 + epsilon ? t : null;
}

function pointAt(segment: BorderSegment, t: number): Point2 {
    const scaled = THREE.MathUtils.clamp(t, 0, 1) * (segment.points.length - 1);
    const index = Math.min(segment.points.length - 2, Math.floor(scaled));
    const fraction = scaled - index;
    const a = segment.points[index], b = segment.points[index + 1];
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

export function nearestBorderT(segment: BorderSegment, point: Point2) {
    let bestDistance = Infinity, bestT = 0;
    for (let index = 0; index < segment.points.length - 1; index++) {
        const a = segment.points[index], b = segment.points[index + 1];
        const ab = sub(b, a);
        const length = ab[0] ** 2 + ab[1] ** 2;
        const local = length ? THREE.MathUtils.clamp(((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1]) / length, 0, 1) : 0;
        const projected: Point2 = [a[0] + ab[0] * local, a[1] + ab[1] * local];
        const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
        if (distance < bestDistance) { bestDistance = distance; bestT = (index + local) / (segment.points.length - 1); }
    }
    return bestT;
}

export function borderInterval(segment: BorderSegment, all: BorderSegment[], point: Point2) {
    const ts = new Set<number>([0, 1]);
    for (let i = 0; i < segment.points.length - 1; i++) {
        const a = segment.points[i], b = segment.points[i + 1];
        all.forEach((other) => {
            if (other.entityId === segment.entityId && other.index === segment.index) return;
            for (let j = 0; j < other.points.length - 1; j++) {
                const t = intersectLines(a, b, other.points[j], other.points[j + 1]);
                if (t !== null) ts.add((i + t) / (segment.points.length - 1));
            }
        });
    }
    const sorted = [...ts].sort((a, b) => a - b);
    const current = nearestBorderT(segment, point);
    const index = Math.max(0, Math.min(sorted.length - 2, sorted.findIndex((value, i) => i < sorted.length - 1 && current >= value && current <= sorted[i + 1])));
    return { start: sorted[index], end: sorted[index + 1], empty: sorted.length > 2 };
}

export function sliceBorder(segment: BorderSegment, start: number, end: number): Point2[] {
    if (start <= 0 && end >= 1) return segment.points.map((point) => [...point]);
    const points: Point2[] = [pointAt(segment, start)];
    const first = Math.ceil(start * (segment.points.length - 1));
    const last = Math.floor(end * (segment.points.length - 1));
    for (let index = first; index <= last; index++) points.push(segment.points[index]);
    points.push(pointAt(segment, end));
    return points;
}

export function splitCubic(a: Point2, c1: Point2, c2: Point2, b: Point2, t: number) {
    const lerp = (p: Point2, q: Point2): Point2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const p0 = lerp(a, c1), p1 = lerp(c1, c2), p2 = lerp(c2, b), p3 = lerp(p0, p1), p4 = lerp(p1, p2), p5 = lerp(p3, p4);
    return { left: { a, c1: p0, c2: p3, b: p5 }, right: { a: p5, c1: p4, c2: p2, b } };
}
