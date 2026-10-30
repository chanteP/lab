import * as THREE from 'three';
import type { ModelEntity, Point2, SketchCurve } from '../types';
import { curvePoints } from './sketchCurves';

export type ProfileType = 'polygon' | 'rectangle' | 'circle' | 'ellipse' | 'regular' | 'arc' | 'line';
export type ProfileCurves = Record<number, { c1: Point2; c2: Point2 }>;

export function profileClosed(type: ProfileType) { return type !== 'arc' && type !== 'line'; }
export function entityProfileClosed(entity: Pick<ModelEntity, 'open' | 'profileType'>) { return !entity.open && profileClosed(entity.profileType || 'polygon'); }

// Source points stay semantic: circle = center + circumference, arc = start + mid + end.
export function profileArcCenter(source: Point2[]): Point2 | null {
    if (source.length < 3) return null;
    const [a, b, c] = source;
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 0.000001) return null;
    const aa = a[0] ** 2 + a[1] ** 2, bb = b[0] ** 2 + b[1] ** 2, cc = c[0] ** 2 + c[1] ** 2;
    return [
        (aa * (b[1] - c[1]) + bb * (c[1] - a[1]) + cc * (a[1] - b[1])) / d,
        (aa * (c[0] - b[0]) + bb * (a[0] - c[0]) + cc * (b[0] - a[0])) / d,
    ];
}

export function profileEllipsePoint(center: Point2, edge: Point2, vertical: Point2, angle: number, scale = 1): Point2 {
    const dx = edge[0] - center[0], dy = edge[1] - center[1];
    const rx = Math.hypot(dx, dy) * scale;
    const ry = Math.hypot(vertical[0] - center[0], vertical[1] - center[1]) * scale;
    const rotation = Math.atan2(dy, dx);
    const orientation = Math.sign(dx * (vertical[1] - center[1]) - dy * (vertical[0] - center[0])) || 1;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [
        center[0] + rx * cos * Math.cos(rotation) - orientation * ry * sin * Math.sin(rotation),
        center[1] + rx * cos * Math.sin(rotation) + orientation * ry * sin * Math.cos(rotation),
    ];
}

// Sector handles use the ellipse's parameter angle, not the pointer's world-plane angle.
export function profileEllipseAngle(center: Point2, edge: Point2, vertical: Point2, point: Point2) {
    const rotation = Math.atan2(edge[1] - center[1], edge[0] - center[0]);
    const dx = point[0] - center[0], dy = point[1] - center[1];
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const orientation = Math.sign((edge[0] - center[0]) * (vertical[1] - center[1]) - (edge[1] - center[1]) * (vertical[0] - center[0])) || 1;
    return Math.atan2(orientation * (-sin * dx + cos * dy), cos * dx + sin * dy);
}

export function profilePoints(type: ProfileType, source: Point2[], segments = 64, curves?: ProfileCurves, sides = 3, sectorAngle = 360, open = false, startAngle?: number, analyticCurves?: Record<number, SketchCurve>): Point2[] {
    if (curves && Object.keys(curves).length || analyticCurves && Object.keys(analyticCurves).length) return profileShape(type, source, segments, curves, sides, sectorAngle, open, startAngle, analyticCurves).getPoints(segments).map((point) => [point.x, point.y]);
    if (type === 'circle' && source.length >= 2) {
        const [center, edge] = source;
        const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
        const start = startAngle ?? Math.atan2(edge[1] - center[1], edge[0] - center[0]);
        const travel = Math.min(360, Math.max(0, sectorAngle)) / 360 * Math.PI * 2;
        const points: Point2[] = Array.from({ length: segments + 1 }, (_, index): Point2 => {
            const angle = start + index / segments * travel;
            return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
        });
        return sectorAngle < 360 ? (open ? points : [[...center] as Point2, ...points]) : points.slice(0, -1);
    }
    if ((type === 'ellipse' || type === 'regular') && source.length >= 2) {
        const [center, edge] = source;
        if (type === 'regular') {
            const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
            const rotation = Math.atan2(edge[1] - center[1], edge[0] - center[0]);
            return Array.from({ length: sides }, (_, index) => {
                const angle = rotation + index / sides * Math.PI * 2;
                return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
            });
        }
        const vertical = source[2] || [center[0], center[1] + Math.abs(edge[1] - center[1])];
        const start = startAngle ?? 0;
        const travel = Math.min(360, Math.max(0, sectorAngle)) / 360 * Math.PI * 2;
        const points: Point2[] = Array.from({ length: segments + 1 }, (_, index): Point2 => {
            const angle = start + index / segments * travel;
            return profileEllipsePoint(center, edge, vertical, angle);
        });
        return sectorAngle < 360 ? (open ? points : [[...center] as Point2, ...points]) : points.slice(0, -1);
    }
    if (type === 'arc' && source.length >= 3) {
        const [a, b, c] = source;
        const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
        if (Math.abs(d) < 0.000001) return source;
        const aa = a[0] ** 2 + a[1] ** 2, bb = b[0] ** 2 + b[1] ** 2, cc = c[0] ** 2 + c[1] ** 2;
        const center: Point2 = [
            (aa * (b[1] - c[1]) + bb * (c[1] - a[1]) + cc * (a[1] - b[1])) / d,
            (aa * (c[0] - b[0]) + bb * (a[0] - c[0]) + cc * (b[0] - a[0])) / d,
        ];
        const radius = Math.hypot(a[0] - center[0], a[1] - center[1]);
        const start = Math.atan2(a[1] - center[1], a[0] - center[0]);
        const middle = Math.atan2(b[1] - center[1], b[0] - center[0]);
        const end = Math.atan2(c[1] - center[1], c[0] - center[0]);
        const ccw = (from: number, to: number) => (to - from + Math.PI * 2) % (Math.PI * 2);
        const clockwiseTravel = ccw(end, start);
        const passesMiddle = ccw(end, middle) <= clockwiseTravel;
        const travel = passesMiddle ? -clockwiseTravel : ccw(start, end);
        return Array.from({ length: segments + 1 }, (_, index) => {
            const angle = start + travel * index / segments;
            return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
        });
    }
    return source;
}

export function profileShape(type: ProfileType, source: Point2[], segments = 64, curves?: ProfileCurves, sides = 3, sectorAngle = 360, open = false, startAngle?: number, analyticCurves?: Record<number, SketchCurve>) {
    if ((curves && Object.keys(curves).length || analyticCurves && Object.keys(analyticCurves).length) && source.length > 1) {
        const shape = new THREE.Shape();
        shape.moveTo(...source[0]);
        const append = (index: number, point: Point2) => {
            const analytic = analyticCurves?.[index];
            if (analytic?.kind === 'cubic') {
                shape.bezierCurveTo(analytic.c1[0], analytic.c1[1], analytic.c2[0], analytic.c2[1], point[0], point[1]);
                return;
            }
            if (analytic) {
                // Sampling is only for Three.js geometry; the logical border remains analytic.
                curvePoints(analytic, 0, 1, segments).slice(1).forEach((sample) => shape.lineTo(...sample));
                return;
            }
            const curve = curves?.[index];
            if (curve) shape.bezierCurveTo(curve.c1[0], curve.c1[1], curve.c2[0], curve.c2[1], point[0], point[1]);
            else shape.lineTo(...point);
        };
        for (let index = 1; index < source.length; index++) append(index - 1, source[index]);
        if (profileClosed(type) && !open) {
            append(source.length - 1, source[0]);
            shape.closePath();
        }
        return shape;
    }
    const points = profilePoints(type, source, segments, undefined, sides, sectorAngle, open, startAngle);
    const shape = new THREE.Shape();
    if (!points.length) return shape;
    shape.moveTo(...points[0]);
    points.slice(1).forEach((point) => shape.lineTo(...point));
    if (profileClosed(type) && !open) shape.closePath();
    return shape;
}
