import * as THREE from 'three';
import { entityProfileClosed, profileArcCenter, profilePoints } from './profiles';
import type { ModelEntity, Point2, SketchCurve } from '../types';
import { INTERACTION } from '../config/const';
import { curveIntersections, curvePoint, curvePoints, nearestCurveT, sliceCurve } from './sketchCurves';

export interface BorderSegment {
    entityId: string;
    index: number;
    sourceCount: number;
    points: Point2[];
    closed: boolean;
    curve?: SketchCurve;
}

export function borderEditingPoints(segment: BorderSegment): Point2[] {
    // Cubic handles address semantic endpoints, never the first two render samples.
    if (segment.curve?.kind === 'cubic') return [[...segment.curve.a], [...segment.curve.b]];
    return segment.points.map((point) => [...point]);
}

function analyticProfileCurve(entity: ModelEntity): SketchCurve | null {
    const type = entity.profileType || 'polygon';
    const source = entity.points || [];
    const sectorAngle = entity.sectorAngle ?? 360;
    if (sectorAngle < 359.999 && !entity.open && type !== 'arc') return null;
    if ((type === 'circle' || type === 'ellipse') && source.length >= 2) {
        const [center, edge] = source;
        const dx = edge[0] - center[0], dy = edge[1] - center[1];
        const rotation = type === 'circle' ? 0 : Math.atan2(dy, dx);
        const vertical = source[2] || [center[0], center[1] + Math.abs(dy)];
        const orientation = (type === 'circle' ? 1 : Math.sign(dx * (vertical[1] - center[1]) - dy * (vertical[0] - center[0])) || 1) as 1 | -1;
        const startAngle = entity.profileStartAngle ?? (type === 'ellipse' ? 0 : Math.atan2(dy, dx));
        return {
            kind: 'ellipse', center: [...center], radiusX: Math.hypot(dx, dy),
            radiusY: type === 'circle' ? Math.hypot(dx, dy) : Math.hypot(vertical[0] - center[0], vertical[1] - center[1]),
            rotation, orientation, startAngle, endAngle: startAngle + Math.min(360, Math.max(0, sectorAngle)) / 360 * Math.PI * 2,
        };
    }
    if (type === 'arc' && source.length >= 3) {
        const [a, b, c] = source, center = profileArcCenter(source);
        if (!center) return null;
        const radius = Math.hypot(a[0] - center[0], a[1] - center[1]);
        const startAngle = Math.atan2(a[1] - center[1], a[0] - center[0]);
        const middle = Math.atan2(b[1] - center[1], b[0] - center[0]);
        const end = Math.atan2(c[1] - center[1], c[0] - center[0]);
        const ccw = (from: number, to: number) => (to - from + Math.PI * 2) % (Math.PI * 2);
        const clockwiseTravel = ccw(end, startAngle);
        const travel = ccw(end, middle) <= clockwiseTravel ? -clockwiseTravel : ccw(startAngle, end);
        return { kind: 'ellipse', center, radiusX: radius, radiusY: radius, rotation: 0, orientation: 1, startAngle, endAngle: startAngle + travel };
    }
    return null;
}

export function borderSegments(entity: ModelEntity): BorderSegment[] {
    const type = entity.profileType || 'polygon';
    const source = entity.points || [];
    const closed = entityProfileClosed(entity) && (entity.sectorAngle ?? 360) >= 359.999;
    if (['polygon', 'rectangle', 'regular'].includes(type)) {
        const points = type === 'regular' ? profilePoints(type, source, 64, undefined, entity.sides) : source;
        if (points.length < 2) return [];
        const count = closed ? points.length : points.length - 1;
        const segments: BorderSegment[] = Array.from({ length: count }, (_, index) => {
            const a = points[index], b = points[(index + 1) % points.length];
            const cubic = entity.curves?.[index];
            const curve = entity.analyticCurves?.[index] || (cubic ? { kind: 'cubic', a: [...a], c1: [...cubic.c1], c2: [...cubic.c2], b: [...b] } as SketchCurve : undefined);
            const samples = curve ? curvePoints(curve, 0, 1, 64) : [[...a], [...b]] as Point2[];
            return { entityId: entity.id, index, sourceCount: 1, points: samples, closed: false, curve };
        });
        const groups = segments.reduce<BorderSegment[]>((result, segment) => {
            const previous = result[result.length - 1];
            if (previous && !previous.curve && !segment.curve) {
                const a = previous.points[previous.points.length - 2], b = previous.points[previous.points.length - 1];
                const c = segment.points[0], d = segment.points[1];
                const incoming = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
                const outgoing = new THREE.Vector2(d[0] - c[0], d[1] - c[1]).normalize();
                if (incoming.dot(outgoing) > 1 - 1e-8) {
                    previous.points.push(...segment.points.slice(1));
                    previous.sourceCount += 1;
                    return result;
                }
            }
            result.push({ ...segment, points: segment.points.map((point) => [...point]) });
            return result;
        }, []);
        if (closed && groups.length > 1) {
            const first = groups[0], last = groups[groups.length - 1];
            if (!first.curve && !last.curve) {
                const a = last.points[last.points.length - 2], b = last.points[last.points.length - 1];
                const c = first.points[0], d = first.points[1];
                const incoming = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
                const outgoing = new THREE.Vector2(d[0] - c[0], d[1] - c[1]).normalize();
                if (incoming.dot(outgoing) > 1 - 1e-8) {
                    const merged: BorderSegment = { ...last, points: [...last.points, ...first.points.slice(1)], sourceCount: last.sourceCount + first.sourceCount };
                    groups.splice(0, 1);
                    groups[groups.length - 1] = merged;
                }
            }
        }
        if (closed && groups.length === 1) groups[0].closed = true;
        return groups;
    }
    const curve = analyticProfileCurve(entity);
    const points = curve ? curvePoints(curve) : profilePoints(type, source, 64, entity.curves, entity.sides, entity.sectorAngle ?? 360, entity.open, entity.profileStartAngle, entity.analyticCurves);
    if (points.length < 2) return [];
    return [{ entityId: entity.id, index: 0, sourceCount: 1, points: closed && !curve ? [...points, points[0]] : points, closed, curve }];
}


function cross(a: Point2, b: Point2) { return a[0] * b[1] - a[1] * b[0]; }
function sub(a: Point2, b: Point2): Point2 { return [a[0] - b[0], a[1] - b[1]]; }

function intersectLines(a: Point2, b: Point2, c: Point2, d: Point2) {
    const r = sub(b, a), s = sub(d, c);
    const denominator = cross(r, s);
    const epsilon = 1e-6;
    if (Math.abs(denominator) >= 1e-8) {
        const delta = sub(c, a);
        const t = cross(delta, s) / denominator;
        const u = cross(delta, r) / denominator;
        if (t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon) return THREE.MathUtils.clamp(t, 0, 1);
    }

    // Restitched T-junctions can be slightly offset from the sampled host edge.
    const length = r[0] ** 2 + r[1] ** 2;
    if (!length) return null;
    const tolerance = INTERACTION.sketchIntersectionTolerance;
    for (const point of [c, d]) {
        const t = ((point[0] - a[0]) * r[0] + (point[1] - a[1]) * r[1]) / length;
        const projected: Point2 = [a[0] + r[0] * t, a[1] + r[1] * t];
        const parameterTolerance = tolerance / Math.sqrt(length);
        if (t >= -parameterTolerance && t <= 1 + parameterTolerance && Math.hypot(point[0] - projected[0], point[1] - projected[1]) <= tolerance) {
            return THREE.MathUtils.clamp(t, 0, 1);
        }
    }
    return null;
}

function pointAt(segment: BorderSegment, t: number): Point2 {
    if (segment.curve) return curvePoint(segment.curve, t);
    const scaled = THREE.MathUtils.clamp(t, 0, 1) * (segment.points.length - 1);
    const index = Math.min(segment.points.length - 2, Math.floor(scaled));
    const fraction = scaled - index;
    const a = segment.points[index], b = segment.points[index + 1];
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

export function nearestBorderT(segment: BorderSegment, point: Point2) {
    if (segment.curve) return nearestCurveT(segment.curve, point);
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
    let seamIntersection = false;
    const recordT = (value: number) => {
        ts.add(value);
        if (value <= 1e-6 || value >= 1 - 1e-6) seamIntersection = true;
    };
    const addCurveIntersections = (other: BorderSegment) => {
        if (!segment.curve) return false;
        if (other.curve) {
            curveIntersections(segment.curve, other.curve).forEach((hit) => recordT(hit.first));
            return true;
        }
        for (let index = 0; index < other.points.length - 1; index++) {
            const line: SketchCurve = { kind: 'line', a: other.points[index], b: other.points[index + 1] };
            curveIntersections(segment.curve, line).forEach((hit) => recordT(hit.first));
        }
        return true;
    };
    for (let i = 0; i < segment.points.length - 1; i++) {
        const a = segment.points[i], b = segment.points[i + 1];
        all.forEach((other) => {
            if (other.entityId === segment.entityId && other.index === segment.index) return;
            if (addCurveIntersections(other)) return;
            for (let j = 0; j < other.points.length - 1; j++) {
                if (other.curve) {
                    const line: SketchCurve = { kind: 'line', a, b };
                    curveIntersections(line, other.curve).forEach((hit) => recordT((i + hit.first) / (segment.points.length - 1)));
                } else {
                    const t = intersectLines(a, b, other.points[j], other.points[j + 1]);
                    if (t !== null) recordT((i + t) / (segment.points.length - 1));
                }
            }
        });
        if (segment.curve) break;
    }
    const sorted = [...ts].sort((a, b) => a - b);
    const borderLength = segment.points.reduce((sum, point, index) => index ? sum + Math.hypot(point[0] - segment.points[index - 1][0], point[1] - segment.points[index - 1][1]) : 0, 0);
    const mergeTolerance = 2 * INTERACTION.sketchIntersectionTolerance / Math.max(borderLength, INTERACTION.sketchIntersectionTolerance);
    const merged: number[] = [];
    sorted.forEach((value) => {
        const previous = merged[merged.length - 1];
        if (previous !== undefined && value - previous <= mergeTolerance) {
            if (value === 1) merged[merged.length - 1] = 1;
            return;
        }
        merged.push(value);
    });
    const current = nearestBorderT(segment, point);
    const internalCount = merged.length - 2;
    if (segment.closed && internalCount > 0) {
        // One junction only opens a closed curve; it does not create two selectable arcs.
        if (internalCount === 1 && !seamIntersection) return { start: 0, end: 1, empty: false };
        const first = merged[1], last = merged[merged.length - 2];
        if (internalCount > 1 && (current <= first || current >= last)) return { start: last - 1, end: first, empty: true };
    }
    const index = Math.max(0, Math.min(merged.length - 2, merged.findIndex((value, i) => i < merged.length - 1 && current >= value && current <= merged[i + 1])));
    return { start: merged[index], end: merged[index + 1], empty: merged.length > 2 };
}

export function sliceBorderCurve(segment: BorderSegment, start: number, end: number): { points: Point2[]; curve?: SketchCurve } {
    if (start <= 0 && end >= 1) return { points: segment.points.map((point) => [...point]), curve: segment.curve };
    if (segment.closed && start < 0) {
        const from = start + 1;
        if (Math.abs(from - end) < 1e-9) return { points: segment.points.map((point) => [...point]), curve: segment.curve };
        const before = sliceBorder(segment, from, 1);
        const after = sliceBorder(segment, 0, end);
        return { points: [...before, ...after.slice(1)] };
    }
    if (segment.curve) {
        const curve = sliceCurve(segment.curve, start, end);
        return { curve, points: curvePoints(curve, 0, 1, Math.max(2, segment.points.length - 1)) };
    }
    const points: Point2[] = [pointAt(segment, start)];
    const first = Math.ceil(start * (segment.points.length - 1));
    const last = Math.floor(end * (segment.points.length - 1));
    const append = (point: Point2) => {
        const previous = points[points.length - 1];
        if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-8) points.push([...point]);
    };
    for (let index = first; index <= last; index++) append(segment.points[index]);
    append(pointAt(segment, end));
    return { points };
}

export function sliceBorder(segment: BorderSegment, start: number, end: number): Point2[] {
    return sliceBorderCurve(segment, start, end).points;
}

export function splitCubic(a: Point2, c1: Point2, c2: Point2, b: Point2, t: number) {
    const lerp = (p: Point2, q: Point2): Point2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const p0 = lerp(a, c1), p1 = lerp(c1, c2), p2 = lerp(c2, b), p3 = lerp(p0, p1), p4 = lerp(p1, p2), p5 = lerp(p3, p4);
    return { left: { a, c1: p0, c2: p3, b: p5 }, right: { a: p5, c1: p4, c2: p2, b } };
}
