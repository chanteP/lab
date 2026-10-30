import type { ModelEntity, Point2, SketchEdgeConstraint } from '../types';
import type { ProfileCurves } from './profiles';

export type SketchConstraintType = 'auto' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'equal' | 'length';

export interface SketchConstraintResult {
    points: Point2[];
    curves: ProfileCurves;
    changed: boolean;
}

const EPSILON = 0.000001;
const clonePoints = (points: Point2[]) => points.map((point) => [...point] as Point2);
const distance = (a: Point2, b: Point2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function fixedLengthRule(entity: ModelEntity, index: number) {
    const value = entity.edgeConstraints?.[index];
    const rules = Array.isArray(value) ? value : value ? [value] : [];
    return rules.find((rule): rule is SketchEdgeConstraint & { length: number } => rule.type === 'length' && !!rule.length && rule.length > EPSILON);
}

function projectToCircle(point: Point2, center: Point2, radius: number): Point2 {
    const angle = Math.atan2(point[1] - center[1], point[0] - center[0]);
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
}

/** Keep a dragged endpoint on its adjacent fixed-length edges, including circle intersections at corners. */
export function projectSketchPointToFixedLengths(entity: ModelEntity, index: number, point: Point2, closed: boolean): Point2 {
    if (!entity.points?.[index]) return point;
    const previous = index > 0 ? index - 1 : closed ? entity.points.length - 1 : -1;
    const nextRule = fixedLengthRule(entity, index);
    const previousRule = previous >= 0 ? fixedLengthRule(entity, previous) : undefined;
    const nextCenter = entity.points[(index + 1) % entity.points.length];
    const previousCenter = previous >= 0 ? entity.points[previous] : undefined;

    if (nextRule && nextCenter && previousRule && previousCenter) {
        const dx = nextCenter[0] - previousCenter[0], dy = nextCenter[1] - previousCenter[1];
        const centerDistance = Math.hypot(dx, dy);
        if (centerDistance < EPSILON) return projectToCircle(point, previousCenter, previousRule.length);
        const along = (previousRule.length ** 2 - nextRule.length ** 2 + centerDistance ** 2) / (2 * centerDistance);
        const heightSquared = previousRule.length ** 2 - along ** 2;
        if (heightSquared < -EPSILON) return point;
        const height = Math.sqrt(Math.max(0, heightSquared));
        const base: Point2 = [previousCenter[0] + along * dx / centerDistance, previousCenter[1] + along * dy / centerDistance];
        const candidates: Point2[] = [
            [base[0] - height * dy / centerDistance, base[1] + height * dx / centerDistance],
            [base[0] + height * dy / centerDistance, base[1] - height * dx / centerDistance],
        ];
        return candidates.sort((a, b) => distance(a, point) - distance(b, point))[0];
    }
    if (nextRule && nextCenter) return projectToCircle(point, nextCenter, nextRule.length);
    if (previousRule && previousCenter) return projectToCircle(point, previousCenter, previousRule.length);
    return point;
}

function segmentIndices(index: number, count: number): [number, number] {
    return [index, (index + 1) % count];
}

export function straightConstraintSegment(points: Point2[], curves: ProfileCurves, index: number) {
    const [aIndex, bIndex] = segmentIndices(index, points.length);
    const a = points[aIndex], b = points[bIndex];
    if (!a || !b || distance(a, b) < EPSILON) return false;
    const curve = curves[index];
    if (!curve) return true;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return [curve.c1, curve.c2].every((point) => Math.abs(dx * (point[1] - a[1]) - dy * (point[0] - a[0])) < EPSILON);
}

function rotate(point: Point2, angle: number): Point2 {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
}

function nearestAngle(current: number, base: number) {
    return base + Math.round(angleDelta(base, current) / Math.PI) * Math.PI;
}

/** Solve all selected edges together and reject conflicting or fully locked selections without partial edits. */
export function solveSketchConstraints(
    source: Point2[],
    sourceCurves: ProfileCurves,
    segments: number[],
    lockedPoints: number[],
    type: SketchConstraintType,
    closed = false,
): SketchConstraintResult | null {
    const selected = [...new Set(segments)].filter((index) => straightConstraintSegment(source, sourceCurves, index));
    if (!selected.length || selected.length !== new Set(segments).size) return null;
    if (['parallel', 'perpendicular', 'equal'].includes(type) && selected.length < 2) return null;

    const points = clonePoints(source);
    const curves = JSON.parse(JSON.stringify(sourceCurves)) as ProfileCurves;
    const anchored = new Set(lockedPoints);
    const reference = selected[0];
    const [referenceA, referenceB] = segmentIndices(reference, points.length);
    if (['parallel', 'perpendicular', 'equal'].includes(type)) {
        anchored.add(referenceA);
        anchored.add(referenceB);
    }
    const referenceLength = distance(source[referenceA], source[referenceB]);
    const referenceAngle = Math.atan2(source[referenceB][1] - source[referenceA][1], source[referenceB][0] - source[referenceA][0]);
    const targets = ['parallel', 'perpendicular', 'equal'].includes(type) ? selected.slice(1) : selected;

    const applyAxis = (index: number, horizontal: boolean) => {
        const [aIndex, bIndex] = segmentIndices(index, points.length);
        const a = points[aIndex], b = points[bIndex];
        const axis = horizontal ? 1 : 0;
        const error = b[axis] - a[axis];
        const freeA = !anchored.has(aIndex), freeB = !anchored.has(bIndex);
        if (freeA && freeB) {
            a[axis] += error / 2;
            b[axis] -= error / 2;
        } else if (freeA) a[axis] = b[axis];
        else if (freeB) b[axis] = a[axis];
    };

    const applyAngle = (index: number, perpendicular: boolean) => {
        const [aIndex, bIndex] = segmentIndices(index, points.length);
        const a = points[aIndex], b = points[bIndex];
        const currentAngle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const base = referenceAngle + (perpendicular ? Math.PI / 2 : 0);
        const desired = nearestAngle(currentAngle, base);
        const delta = angleDelta(currentAngle, desired);
        const direction = rotate([b[0] - a[0], b[1] - a[1]], delta);
        const freeA = !anchored.has(aIndex), freeB = !anchored.has(bIndex);
        if (freeA && freeB) {
            const center: Point2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            points[aIndex] = [center[0] - direction[0] / 2, center[1] - direction[1] / 2];
            points[bIndex] = [center[0] + direction[0] / 2, center[1] + direction[1] / 2];
        } else if (freeA) points[aIndex] = [b[0] - direction[0], b[1] - direction[1]];
        else if (freeB) points[bIndex] = [a[0] + direction[0], a[1] + direction[1]];
    };

    const applyEqual = (index: number) => {
        const [aIndex, bIndex] = segmentIndices(index, points.length);
        const a = points[aIndex], b = points[bIndex];
        const currentLength = distance(a, b);
        if (currentLength < EPSILON) return;
        const direction: Point2 = [(b[0] - a[0]) / currentLength * referenceLength, (b[1] - a[1]) / currentLength * referenceLength];
        const freeA = !anchored.has(aIndex), freeB = !anchored.has(bIndex);
        if (freeA && freeB) {
            const center: Point2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            points[aIndex] = [center[0] - direction[0] / 2, center[1] - direction[1] / 2];
            points[bIndex] = [center[0] + direction[0] / 2, center[1] + direction[1] / 2];
        } else if (freeA) points[aIndex] = [b[0] - direction[0], b[1] - direction[1]];
        else if (freeB) points[bIndex] = [a[0] + direction[0], a[1] + direction[1]];
    };

    for (let iteration = 0; iteration < 40; iteration++) {
        targets.forEach((index) => {
            if (type === 'parallel' || type === 'perpendicular') applyAngle(index, type === 'perpendicular');
            else if (type === 'equal') applyEqual(index);
            else {
                const [aIndex, bIndex] = segmentIndices(index, points.length);
                const a = points[aIndex], b = points[bIndex];
                const horizontal = type === 'horizontal' || (type === 'auto' && Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]));
                applyAxis(index, horizontal);
            }
        });
    }

    const residual = (index: number) => {
        const [aIndex, bIndex] = segmentIndices(index, points.length);
        const a = points[aIndex], b = points[bIndex];
        if (type === 'horizontal') return Math.abs(b[1] - a[1]);
        if (type === 'vertical') return Math.abs(b[0] - a[0]);
        if (type === 'auto') return Math.min(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0]));
        if (type === 'equal') return Math.abs(distance(a, b) - referenceLength);
        const currentAngle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const base = referenceAngle + (type === 'perpendicular' ? Math.PI / 2 : 0);
        return Math.abs(Math.sin(angleDelta(currentAngle, nearestAngle(currentAngle, base)))) * distance(a, b);
    };
    if (targets.some((index) => residual(index) > 0.0001)) return null;
    const edgeCount = closed ? points.length : points.length - 1;
    for (let index = 0; index < edgeCount; index++) {
        const [aIndex, bIndex] = segmentIndices(index, points.length);
        if (distance(points[aIndex], points[bIndex]) < EPSILON) return null;
    }
    if (closed && points.length >= 3) {
        const area = points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point[0] * next[1] - next[0] * point[1];
        }, 0) / 2;
        if (Math.abs(area) < EPSILON) return null;
    }
    lockedPoints.forEach((index) => {
        if (points[index] && distance(points[index], source[index]) > EPSILON) points[index] = [...source[index]];
    });

    const changed = points.some((point, index) => distance(point, source[index]) > EPSILON);
    Object.entries(curves).forEach(([key, curve]) => {
        const index = Number(key);
        const [aIndex, bIndex] = segmentIndices(index, points.length);
        if (selected.includes(index)) {
            const a = points[aIndex], b = points[bIndex];
            curve.c1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
            curve.c2 = [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3];
        } else {
            curve.c1 = [curve.c1[0] + points[aIndex][0] - source[aIndex][0], curve.c1[1] + points[aIndex][1] - source[aIndex][1]];
            curve.c2 = [curve.c2[0] + points[bIndex][0] - source[bIndex][0], curve.c2[1] + points[bIndex][1] - source[bIndex][1]];
        }
    });
    return { points, curves, changed };
}
