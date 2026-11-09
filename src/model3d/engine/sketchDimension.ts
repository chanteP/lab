import { profileArcCenter, type ProfileCurves } from './profiles';
import type { Point2 } from '../types';
import type { SketchDimension } from './Viewport';

export type SketchDimensionOperation = {
    index: number;
    length: number;
    direction: Point2;
    preserve: 'start' | 'center';
};

export type SketchDimensionEdit = {
    points: Point2[];
    curves: ProfileCurves;
    sectorAngle: number;
    operation?: SketchDimensionOperation;
};

function setRadius(center: Point2, edge: Point2, radius: number): Point2 {
    const angle = Math.atan2(edge[1] - center[1], edge[0] - center[0]);
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
}

/** Applies one overlay dimension to semantic points and describes the intent for constraint solving. */
export function editSketchDimension(source: Point2[], sourceCurves: ProfileCurves, sourceSectorAngle: number, target: SketchDimension, value: number): SketchDimensionEdit {
    const points = source.map((point) => [...point] as Point2);
    const curves: ProfileCurves = {};
    Object.entries(sourceCurves).forEach(([key, curve]) => curves[Number(key)] = { c1: [...curve.c1], c2: [...curve.c2] });
    let sectorAngle = sourceSectorAngle;
    let operation: SketchDimensionOperation | undefined;

    if (target.kind === 'angle') sectorAngle = Math.min(360, value);
    else if (target.kind === 'segment' && target.index !== undefined) {
        const index = target.index, next = (index + 1) % points.length;
        const a = points[index], b = points[next];
        if (a && b) {
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (length > 0) {
                operation = { index, length: value, direction: [(b[0] - a[0]) / length, (b[1] - a[1]) / length], preserve: 'start' };
                points[next] = setRadius(a, b, value);
            }
        }
    } else if ((target.kind === 'width' || target.kind === 'height') && points.length === 4) {
        const index = target.kind === 'width' ? 0 : 1, next = index + 1;
        const a = points[index], b = points[next];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length > 0) {
            operation = { index, length: value, direction: [(b[0] - a[0]) / length, (b[1] - a[1]) / length], preserve: 'center' };
            const axis = target.kind === 'width' ? 0 : 1;
            const center = (points[0][axis] + points[2][axis]) / 2;
            points.forEach((point) => point[axis] = center + (point[axis] < center ? -value / 2 : value / 2));
        }
    } else if (target.kind === 'radius' && points[0] && points[1]) points[1] = setRadius(points[0], points[1], value);
    else if (target.kind === 'radiusX' && points[0] && points[1]) points[1] = setRadius(points[0], points[1], value);
    else if (target.kind === 'radiusY' && points[0] && points[2]) points[2] = setRadius(points[0], points[2], value);
    else if (target.kind === 'control' && target.index !== undefined && target.handle) {
        const curve = curves[target.index] as ProfileCurves[number] | undefined;
        const anchor = target.handle === 1 ? points[target.index] : points[(target.index + 1) % points.length];
        const key = target.handle === 1 ? 'c1' : 'c2';
        if (curve && anchor) curve[key] = setRadius(anchor, curve[key], value);
    } else if (target.kind === 'arcRadius') {
        const center = profileArcCenter(points);
        if (center) points.forEach((point, index) => points[index] = setRadius(center, point, value));
    }
    return { points, curves, sectorAngle, operation };
}
