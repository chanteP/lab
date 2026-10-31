import { entityProfileClosed, profilePoints } from './profiles';
import type { ModelEntity, Point2, SketchProfilePart } from '../types';

export type SymmetryMode = 'mirror' | 'rotate';
export type PointTransform = (point: Point2) => Point2;

/** One ray per sector; opposite rays naturally form a cross for even counts. */
export function symmetryRayAngles(count: number, offset: number): number[] {
    return Array.from({ length: count }, (_, index) => offset + index * 360 / count);
}

const EPSILON = 1e-7;

export function cloneProfilePart(part: SketchProfilePart): SketchProfilePart {
    return { points: part.points.map((point) => [...point]), closed: part.closed };
}

/** Convert semantic circles/curves to render polygons before clipping and radial transforms. */
export function entityProfileParts(entity: ModelEntity): SketchProfilePart[] {
    if (entity.parts?.length) return entity.parts.map(cloneProfilePart);
    const points = profilePoints(
        entity.profileType || 'polygon', entity.points || [], 64, entity.curves, entity.sides,
        entity.sectorAngle, entity.open, entity.profileStartAngle, entity.analyticCurves,
    );
    return points.length >= 2 ? [{ points: points.map((point) => [...point]), closed: entityProfileClosed(entity) }] : [];
}

export function profilePartCenter(part: SketchProfilePart): Point2 {
    if (!part.points.length) return [0, 0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    part.points.forEach(([x, y]) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    });
    return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export function profilePartsCenter(parts: SketchProfilePart[]): Point2 {
    const points = parts.flatMap((part) => part.points);
    return profilePartCenter({ points, closed: false });
}

export function mapProfilePart(part: SketchProfilePart, transform: PointTransform): SketchProfilePart {
    return { points: part.points.map(transform), closed: part.closed };
}

export function translateProfilePart(part: SketchProfilePart, delta: Point2): SketchProfilePart {
    return mapProfilePart(part, ([x, y]) => [x + delta[0], y + delta[1]]);
}

export function rotateProfilePart(part: SketchProfilePart, center: Point2, degrees: number): SketchProfilePart {
    const angle = degrees * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return mapProfilePart(part, ([x, y]) => {
        const dx = x - center[0], dy = y - center[1];
        return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
    });
}

export function scaleProfilePart(part: SketchProfilePart, center: Point2, scale: number): SketchProfilePart {
    return mapProfilePart(part, ([x, y]) => [center[0] + (x - center[0]) * scale, center[1] + (y - center[1]) * scale]);
}

export function clockwiseRotation(degrees: number): PointTransform {
    const angle = degrees * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return ([x, y]) => [cos * x + sin * y, -sin * x + cos * y];
}

export function reflection(degrees: number): PointTransform {
    const angle = degrees * Math.PI / 180;
    const x = Math.sin(angle), y = Math.cos(angle);
    return ([px, py]) => {
        const projection = 2 * (px * x + py * y);
        return [projection * x - px, projection * y - py];
    };
}

function inverseMatrixTransform(transform: PointTransform): PointTransform {
    const ox = transform([0, 0]), ax = transform([1, 0]), ay = transform([0, 1]);
    const a = ax[0] - ox[0], b = ay[0] - ox[0], c = ax[1] - ox[1], d = ay[1] - ox[1];
    const determinant = a * d - b * c;
    return ([x, y]) => {
        const px = x - ox[0], py = y - ox[1];
        return [(d * px - b * py) / determinant, (-c * px + a * py) / determinant];
    };
}

/** Map the selected wedge to every wedge; alternating reflection keeps each divider a mirror axis. */
export function symmetryTransform(index: number, count: number, mode: SymmetryMode): PointTransform {
    const step = 360 / count;
    if (mode === 'rotate' || index % 2 === 0) return clockwiseRotation(index * step);
    return reflection((index + 1) * step / 2);
}

function ray(degrees: number): Point2 {
    const angle = degrees * Math.PI / 180;
    return [Math.sin(angle), Math.cos(angle)];
}

function cross(a: Point2, b: Point2) { return a[0] * b[1] - a[1] * b[0]; }

function clipPolygonHalfPlane(points: Point2[], boundary: Point2, sign: 1 | -1): Point2[] {
    const inside = (point: Point2) => sign * cross(boundary, point) >= -EPSILON;
    const result: Point2[] = [];
    for (let index = 0; index < points.length; index++) {
        const a = points[index], b = points[(index + 1) % points.length];
        const aInside = inside(a), bInside = inside(b);
        if (aInside) result.push([...a]);
        if (aInside === bInside) continue;
        const denominator = sign * cross(boundary, [b[0] - a[0], b[1] - a[1]]);
        if (Math.abs(denominator) < EPSILON) continue;
        const t = -sign * cross(boundary, a) / denominator;
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return result.filter((point, index) => !index || Math.hypot(point[0] - result[index - 1][0], point[1] - result[index - 1][1]) > EPSILON);
}

function clipLineHalfPlane(a: Point2, b: Point2, boundary: Point2, sign: 1 | -1): [Point2, Point2] | null {
    const delta: Point2 = [b[0] - a[0], b[1] - a[1]];
    const start = sign * cross(boundary, a), direction = sign * cross(boundary, delta);
    let min = 0, max = 1;
    if (Math.abs(direction) < EPSILON) return start >= -EPSILON ? [a, b] : null;
    const intersection = -start / direction;
    if (direction > 0) min = Math.max(min, intersection);
    else max = Math.min(max, intersection);
    if (max - min <= EPSILON) return null;
    return [
        [a[0] + delta[0] * min, a[1] + delta[1] * min],
        [a[0] + delta[0] * max, a[1] + delta[1] * max],
    ];
}

/** Clip against two infinite divider rays; content outside the selected wedge is discarded. */
export function clipProfileToSector(part: SketchProfilePart, count: number, offset: number, selected: number): SketchProfilePart[] {
    const start = ray(offset + selected * 360 / count);
    const end = ray(offset + (selected + 1) * 360 / count);
    if (part.closed) {
        const points = clipPolygonHalfPlane(clipPolygonHalfPlane(part.points, start, -1), end, 1);
        return points.length >= 3 ? [{ points, closed: true }] : [];
    }
    const result: SketchProfilePart[] = [];
    let current: Point2[] = [];
    for (let index = 0; index < part.points.length - 1; index++) {
        const clipped = clipLineHalfPlane(part.points[index], part.points[index + 1], start, -1);
        const segment = clipped && clipLineHalfPlane(clipped[0], clipped[1], end, 1);
        if (!segment) {
            if (current.length >= 2) result.push({ points: current, closed: false });
            current = [];
            continue;
        }
        if (current.length && Math.hypot(current[current.length - 1][0] - segment[0][0], current[current.length - 1][1] - segment[0][1]) > EPSILON) {
            if (current.length >= 2) result.push({ points: current, closed: false });
            current = [];
        }
        if (!current.length) current.push(segment[0]);
        current.push(segment[1]);
    }
    if (current.length >= 2) result.push({ points: current, closed: false });
    return result;
}

export function radialSymmetry(parts: SketchProfilePart[], count: number, offset: number, selected: number, mode: SymmetryMode): SketchProfilePart[] {
    const clipped = parts.flatMap((part) => clipProfileToSector(part, count, offset, selected));
    const normalize = inverseMatrixTransform(symmetryTransform(selected, count, mode));
    const source = clipped.map((part) => mapProfilePart(part, normalize));
    return Array.from({ length: count }, (_, index) => {
        const transform = symmetryTransform(index, count, mode);
        return source.map((part) => mapProfilePart(part, transform));
    }).flat();
}

export function sectorAtPoint(point: Point2, count: number, offset: number): number {
    const degrees = (Math.atan2(point[0], point[1]) * 180 / Math.PI + 360) % 360;
    return Math.floor(((degrees - offset + 360) % 360) / (360 / count)) % count;
}

function pointSegmentDistance(point: Point2, a: Point2, b: Point2) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)) : 0;
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

export function hitProfilePart(part: SketchProfilePart, point: Point2, tolerance = 0.5): boolean {
    if (part.points.length < 2) return false;
    const count = part.closed ? part.points.length : part.points.length - 1;
    for (let index = 0; index < count; index++) {
        if (pointSegmentDistance(point, part.points[index], part.points[(index + 1) % part.points.length]) <= tolerance) return true;
    }
    if (!part.closed) return false;
    let inside = false;
    for (let i = 0, j = part.points.length - 1; i < part.points.length; j = i++) {
        const a = part.points[i], b = part.points[j];
        if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}
