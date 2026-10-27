import * as THREE from 'three';
import type { Point2 } from './types';

export type ProfileType = 'polygon' | 'rectangle' | 'circle' | 'arc';

export function profileClosed(type: ProfileType) { return type !== 'arc'; }

// Source points stay semantic: circle = center + circumference, arc = start + mid + end.
export function profilePoints(type: ProfileType, source: Point2[], segments = 64): Point2[] {
    if (type === 'circle' && source.length >= 2) {
        const [center, edge] = source;
        const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
        return Array.from({ length: segments }, (_, index) => {
            const angle = index / segments * Math.PI * 2;
            return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
        });
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

export function profileShape(type: ProfileType, source: Point2[], segments = 64) {
    const points = profilePoints(type, source, segments);
    const shape = new THREE.Shape();
    if (!points.length) return shape;
    shape.moveTo(...points[0]);
    points.slice(1).forEach((point) => shape.lineTo(...point));
    if (profileClosed(type)) shape.closePath();
    return shape;
}
