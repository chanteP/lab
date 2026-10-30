import { INTERACTION } from '../config/const';
import type { Point2, SketchCurve } from '../types';

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Range = { curve: SketchCurve; start: number; end: number };
const TAU = Math.PI * 2;

export function curvePoint(curve: SketchCurve, t: number): Point2 {
    const clamped = Math.max(0, Math.min(1, t));
    if (curve.kind === 'line') return [curve.a[0] + (curve.b[0] - curve.a[0]) * clamped, curve.a[1] + (curve.b[1] - curve.a[1]) * clamped];
    if (curve.kind === 'cubic') {
        const u = 1 - clamped, a = u ** 3, b = 3 * u ** 2 * clamped, c = 3 * u * clamped ** 2, d = clamped ** 3;
        return [
            a * curve.a[0] + b * curve.c1[0] + c * curve.c2[0] + d * curve.b[0],
            a * curve.a[1] + b * curve.c1[1] + c * curve.c2[1] + d * curve.b[1],
        ];
    }
    const angle = curve.startAngle + (curve.endAngle - curve.startAngle) * clamped;
    const cos = Math.cos(angle), sin = Math.sin(angle), rotationCos = Math.cos(curve.rotation), rotationSin = Math.sin(curve.rotation);
    return [
        curve.center[0] + curve.radiusX * cos * rotationCos - curve.orientation * curve.radiusY * sin * rotationSin,
        curve.center[1] + curve.radiusX * cos * rotationSin + curve.orientation * curve.radiusY * sin * rotationCos,
    ];
}

export function reverseCurve(curve: SketchCurve): SketchCurve {
    if (curve.kind === 'line') return { ...curve, a: [...curve.b], b: [...curve.a] };
    if (curve.kind === 'cubic') return { ...curve, a: [...curve.b], c1: [...curve.c2], c2: [...curve.c1], b: [...curve.a] };
    return { ...curve, startAngle: curve.endAngle, endAngle: curve.startAngle };
}

export function sliceCurve(curve: SketchCurve, start: number, end: number): SketchCurve {
    if (start <= 0 && end >= 1) return curve;
    if (curve.kind === 'line') return { ...curve, a: curvePoint(curve, start), b: curvePoint(curve, end) };
    if (curve.kind === 'ellipse') {
        const travel = curve.endAngle - curve.startAngle;
        return { ...curve, startAngle: curve.startAngle + travel * start, endAngle: curve.startAngle + travel * end };
    }
    const split = (a: Point2, c1: Point2, c2: Point2, b: Point2, t: number) => {
        const lerp = (p: Point2, q: Point2): Point2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const p0 = lerp(a, c1), p1 = lerp(c1, c2), p2 = lerp(c2, b), p3 = lerp(p0, p1), p4 = lerp(p1, p2), p5 = lerp(p3, p4);
        return { left: { a, c1: p0, c2: p3, b: p5 }, right: { a: p5, c1: p4, c2: p2, b } };
    };
    const right = split(curve.a, curve.c1, curve.c2, curve.b, start).right;
    const localEnd = start >= 1 ? 1 : (end - start) / (1 - start);
    const part = split(right.a, right.c1, right.c2, right.b, localEnd).left;
    return { kind: 'cubic', ...part };
}

/** Render samples only. Logical selection and intersections use the analytic curve itself. */
export function curvePoints(curve: SketchCurve, start = 0, end = 1, segments = 64): Point2[] {
    if (curve.kind === 'line') return [curvePoint(curve, start), curvePoint(curve, end)];
    const count = Math.max(1, Math.round(segments * Math.max(0, end - start)));
    return Array.from({ length: count + 1 }, (_, index) => curvePoint(curve, start + (end - start) * index / count));
}

function boundsOf(points: Point2[]): Bounds {
    return {
        minX: Math.min(...points.map((point) => point[0])), maxX: Math.max(...points.map((point) => point[0])),
        minY: Math.min(...points.map((point) => point[1])), maxY: Math.max(...points.map((point) => point[1])),
    };
}

function curveBounds(curve: SketchCurve, start: number, end: number): Bounds {
    if (curve.kind === 'line') return boundsOf([curvePoint(curve, start), curvePoint(curve, end)]);
    if (curve.kind === 'cubic') {
        const part = sliceCurve(curve, start, end) as Extract<SketchCurve, { kind: 'cubic' }>;
        return boundsOf([part.a, part.c1, part.c2, part.b]);
    }
    const travel = curve.endAngle - curve.startAngle;
    if (Math.abs(travel) < 1e-12) return boundsOf([curvePoint(curve, start)]);
    const from = curve.startAngle + travel * start, to = curve.startAngle + travel * end;
    const low = Math.min(from, to), high = Math.max(from, to);
    const rotationCos = Math.cos(curve.rotation), rotationSin = Math.sin(curve.rotation);
    const candidates = [
        Math.atan2(-curve.orientation * curve.radiusY * rotationSin, curve.radiusX * rotationCos),
        Math.atan2(curve.orientation * curve.radiusY * rotationCos, curve.radiusX * rotationSin),
    ].flatMap((angle) => [angle, angle + Math.PI]);
    const angles = [from, to];
    candidates.forEach((base) => {
        for (let angle = base + Math.ceil((low - base) / TAU) * TAU; angle <= high + 1e-12; angle += TAU) {
            if (angle >= low - 1e-12) angles.push(angle);
        }
    });
    const points = angles.map((angle) => curvePoint(curve, (angle - curve.startAngle) / travel));
    return boundsOf(points);
}

function overlaps(a: Bounds, b: Bounds, tolerance: number) {
    return a.minX <= b.maxX + tolerance && a.maxX >= b.minX - tolerance && a.minY <= b.maxY + tolerance && a.maxY >= b.minY - tolerance;
}


function curveDerivative(curve: SketchCurve, t: number): Point2 {
    if (curve.kind === 'line') return [curve.b[0] - curve.a[0], curve.b[1] - curve.a[1]];
    if (curve.kind === 'cubic') {
        const u = 1 - t;
        return [
            3 * u * u * (curve.c1[0] - curve.a[0]) + 6 * u * t * (curve.c2[0] - curve.c1[0]) + 3 * t * t * (curve.b[0] - curve.c2[0]),
            3 * u * u * (curve.c1[1] - curve.a[1]) + 6 * u * t * (curve.c2[1] - curve.c1[1]) + 3 * t * t * (curve.b[1] - curve.c2[1]),
        ];
    }
    const angle = curve.startAngle + (curve.endAngle - curve.startAngle) * t;
    const travel = curve.endAngle - curve.startAngle;
    const cos = Math.cos(angle), sin = Math.sin(angle), rotationCos = Math.cos(curve.rotation), rotationSin = Math.sin(curve.rotation);
    return [
        (-curve.radiusX * sin * rotationCos - curve.orientation * curve.radiusY * cos * rotationSin) * travel,
        (-curve.radiusX * sin * rotationSin + curve.orientation * curve.radiusY * cos * rotationCos) * travel,
    ];
}

function refineIntersection(first: SketchCurve, second: SketchCurve, initialFirst: number, initialSecond: number) {
    let firstT = initialFirst, secondT = initialSecond;
    for (let iteration = 0; iteration < 12; iteration++) {
        const a = curvePoint(first, firstT), b = curvePoint(second, secondT);
        const fx = a[0] - b[0], fy = a[1] - b[1];
        if (Math.hypot(fx, fy) < 0.000001) break;
        const da = curveDerivative(first, firstT), db = curveDerivative(second, secondT);
        const determinant = da[0] * -db[1] - -db[0] * da[1];
        if (Math.abs(determinant) < 1e-10) break;
        const firstDelta = (-fx * -db[1] + -db[0] * fy) / determinant;
        const secondDelta = (-da[0] * fy + fx * da[1]) / determinant;
        firstT = Math.max(0, Math.min(1, firstT + firstDelta));
        secondT = Math.max(0, Math.min(1, secondT + secondDelta));
    }
    return { first: firstT, second: secondT };
}

/** Adaptive analytic-curve intersection; no fixed polyline conversion is used for logic. */
export function curveIntersections(first: SketchCurve, second: SketchCurve): { first: number; second: number }[] {
    if (first.kind === 'line' && second.kind === 'line') {
        const r = [first.b[0] - first.a[0], first.b[1] - first.a[1]], s = [second.b[0] - second.a[0], second.b[1] - second.a[1]];
        const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];
        const denominator = cross(r, s);
        if (Math.abs(denominator) < 1e-10) return [];
        const delta = [second.a[0] - first.a[0], second.a[1] - first.a[1]];
        const t = cross(delta, s) / denominator, u = cross(delta, r) / denominator;
        return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8 ? [{ first: Math.max(0, Math.min(1, t)), second: Math.max(0, Math.min(1, u)) }] : [];
    }
    const tolerance = INTERACTION.sketchIntersectionTolerance;
    const results: { first: number; second: number }[] = [];
    const visit = (a: Range, b: Range, depth: number) => {
        if (!overlaps(curveBounds(a.curve, a.start, a.end), curveBounds(b.curve, b.start, b.end), tolerance)) return;
        const spanA = a.end - a.start, spanB = b.end - b.start;
        if (depth >= 16 || spanA < 0.0001 && spanB < 0.0001) {
            const result = refineIntersection(a.curve, b.curve, (a.start + a.end) / 2, (b.start + b.end) / 2);
            const pa = curvePoint(a.curve, result.first), pb = curvePoint(b.curve, result.second);
            if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) <= tolerance * 2) results.push(result);
            return;
        }
        if (spanA > spanB * 1.5) {
            const middle = (a.start + a.end) / 2;
            visit({ ...a, end: middle }, b, depth + 1);
            visit({ ...a, start: middle }, b, depth + 1);
        } else if (spanB > spanA * 1.5) {
            const middle = (b.start + b.end) / 2;
            visit(a, { ...b, end: middle }, depth + 1);
            visit(a, { ...b, start: middle }, depth + 1);
        } else {
            const middleA = (a.start + a.end) / 2, middleB = (b.start + b.end) / 2;
            [{ ...a, end: middleA }, { ...a, start: middleA }].forEach((nextA) => {
                [{ ...b, end: middleB }, { ...b, start: middleB }].forEach((nextB) => visit(nextA, nextB, depth + 1));
            });
        }
    };
    visit({ curve: first, start: 0, end: 1 }, { curve: second, start: 0, end: 1 }, 0);
    // t=0 and t=1 are the same point on a closed ellipse; keep one hit or a phantom arc appears.
    const closed = (curve: SketchCurve) => curve.kind === 'ellipse' && Math.abs(Math.abs(curve.endAngle - curve.startAngle) - TAU) < 1e-8;
    const sameT = (a: number, b: number, curve: SketchCurve) => Math.abs(a - b) < 0.001 || closed(curve) && Math.abs(Math.abs(a - b) - 1) < 0.001;
    return results.filter((result, index) => results.findIndex((other) => sameT(other.first, result.first, first) && sameT(other.second, result.second, second)) === index);
}

export function nearestCurveT(curve: SketchCurve, point: Point2) {
    const seeds = Array.from({ length: 17 }, (_, index) => index / 16);
    const ranked = seeds.map((t) => {
        const value = curvePoint(curve, t);
        return { t, distance: Math.hypot(value[0] - point[0], value[1] - point[1]) };
    }).sort((a, b) => a.distance - b.distance).slice(0, 3);
    let best = ranked[0];
    ranked.forEach(({ t }) => {
        let start = Math.max(0, t - 1 / 16), end = Math.min(1, t + 1 / 16);
        for (let iteration = 0; iteration < 36; iteration++) {
            const left = start + (end - start) / 3, right = end - (end - start) / 3;
            const a = curvePoint(curve, left), b = curvePoint(curve, right);
            const distanceA = Math.hypot(a[0] - point[0], a[1] - point[1]);
            const distanceB = Math.hypot(b[0] - point[0], b[1] - point[1]);
            if (distanceA < distanceB) end = right;
            else start = left;
        }
        const candidateT = (start + end) / 2, candidate = curvePoint(curve, candidateT);
        const distance = Math.hypot(candidate[0] - point[0], candidate[1] - point[1]);
        if (distance < best.distance) best = { t: candidateT, distance };
    });
    return best.t;
}

export function translateCurve(curve: SketchCurve, delta: Point2): SketchCurve {
    const move = (point: Point2): Point2 => [point[0] + delta[0], point[1] + delta[1]];
    if (curve.kind === 'line') return { ...curve, a: move(curve.a), b: move(curve.b) };
    if (curve.kind === 'cubic') return { ...curve, a: move(curve.a), c1: move(curve.c1), c2: move(curve.c2), b: move(curve.b) };
    return { ...curve, center: move(curve.center) };
}
