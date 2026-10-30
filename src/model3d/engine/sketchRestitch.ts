import type { Point2, SketchCurve } from '../types';
import { curveIntersections, curvePoints, reverseCurve, sliceCurve } from './sketchCurves';
import type { ProfileCurves } from './profiles';

export interface RestitchEdge {
    a: Point2;
    b: Point2;
    points: Point2[];
    c1?: Point2;
    c2?: Point2;
    curve?: SketchCurve;
}

export interface RestitchPath {
    points: Point2[];
    controlPoints: number[];
    curves: ProfileCurves;
    analyticCurves: Record<number, SketchCurve>;
    closed: boolean;
}

type OrderedEdge = { index: number; forward: boolean };

const key = (point: Point2) => `${Math.round(point[0] * 10)},${Math.round(point[1] * 10)}`;
const length = (point: Point2) => Math.hypot(point[0], point[1]);

function lineEdge(a: Point2, b: Point2): SketchCurve { return { kind: 'line', a, b }; }

function sliceEdge(edge: RestitchEdge, start: number, end: number): RestitchEdge {
    if (edge.curve) {
        const curve = sliceCurve(edge.curve, start, end);
        const points = curvePoints(curve, 0, 1, Math.max(2, edge.points.length - 1));
        return { ...edge, a: points[0], b: points[points.length - 1], points, curve };
    }
    const pointAt = (t: number): Point2 => {
        const scaled = Math.max(0, Math.min(1, t)) * (edge.points.length - 1);
        const index = Math.min(edge.points.length - 2, Math.floor(scaled)), fraction = scaled - index;
        const a = edge.points[index], b = edge.points[index + 1];
        return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    };
    const points: Point2[] = [pointAt(start)];
    const first = Math.ceil(start * (edge.points.length - 1)), last = Math.floor(end * (edge.points.length - 1));
    for (let index = first; index <= last; index++) {
        const point = edge.points[index], previous = points[points.length - 1];
        if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-8) points.push([...point]);
    }
    const lastPoint = pointAt(end), previous = points[points.length - 1];
    if (Math.hypot(lastPoint[0] - previous[0], lastPoint[1] - previous[1]) > 1e-8) points.push(lastPoint);
    return { ...edge, a: points[0], b: points[points.length - 1], points };
}

/** Split every crossed edge before tracing nodes; an arc endpoint inside another edge is a real junction. */
function splitCrossedEdges(source: RestitchEdge[]) {
    const parameters = source.map(() => new Set<number>([0, 1]));
    const addHits = (first: SketchCurve, firstIndex: number, second: SketchCurve, secondIndex: number, secondStart = 0, secondEnd = 1) => {
        curveIntersections(first, second).forEach((hit) => {
            parameters[firstIndex].add(hit.first);
            parameters[secondIndex].add(secondStart + (secondEnd - secondStart) * hit.second);
        });
    };
    for (let first = 0; first < source.length; first++) {
        for (let second = first + 1; second < source.length; second++) {
            const a = source[first], b = source[second];
            if (a.curve && b.curve) addHits(a.curve, first, b.curve, second);
            else if (a.curve) {
                for (let index = 0; index < b.points.length - 1; index++) addHits(a.curve, first, lineEdge(b.points[index], b.points[index + 1]), second, index / (b.points.length - 1), (index + 1) / (b.points.length - 1));
            } else if (b.curve) {
                for (let index = 0; index < a.points.length - 1; index++) addHits(b.curve, second, lineEdge(a.points[index], a.points[index + 1]), first, index / (a.points.length - 1), (index + 1) / (a.points.length - 1));
            } else {
                for (let i = 0; i < a.points.length - 1; i++) {
                    for (let j = 0; j < b.points.length - 1; j++) {
                        curveIntersections(lineEdge(a.points[i], a.points[i + 1]), lineEdge(b.points[j], b.points[j + 1])).forEach((hit) => {
                            parameters[first].add((i + hit.first) / (a.points.length - 1));
                            parameters[second].add((j + hit.second) / (b.points.length - 1));
                        });
                    }
                }
            }
        }
    }
    return source.flatMap((edge, index) => {
        const sorted = [...parameters[index]].sort((a, b) => a - b);
        return sorted.slice(1).map((end, part) => sliceEdge(edge, sorted[part], end)).filter((part) => part.points.length > 1);
    });
}

/** Join degree-two nodes into continuous paths before extracting the remaining closed cycles. */
export function restitchSketchEdges(edges: RestitchEdge[]): RestitchPath[] {
    edges = splitCrossedEdges(edges).filter((edge) => key(edge.a) !== key(edge.b) && length([edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]]) > 1e-8);
    const adjacency = new Map<string, number[]>();
    edges.forEach((edge, index) => {
        [key(edge.a), key(edge.b)].forEach((node) => adjacency.set(node, [...adjacency.get(node) || [], index]));
    });
    const used = new Set<number>();

    const assemble = (ordered: OrderedEdge[], closed: boolean): RestitchPath => {
        const points: Point2[] = [];
        const controlPoints: number[] = [];
        const curves: ProfileCurves = {};
        const analyticCurves: Record<number, SketchCurve> = {};
        ordered.forEach(({ index, forward }) => {
            const edge = edges[index];
            controlPoints.push(points.length);
            // Keep semantic endpoints plus analytic parameters; never expand curves into render samples here.
            if (edge.curve) {
                points.push([...(forward ? edge.a : edge.b)]);
                const curve = forward ? edge.curve : reverseCurve(edge.curve);
                analyticCurves[points.length - 1] = curve;
                if (curve.kind === 'cubic') curves[points.length - 1] = { c1: [...curve.c1], c2: [...curve.c2] };
            } else if (edge.c1 && edge.c2) {
                points.push([...(forward ? edge.a : edge.b)]);
                curves[points.length - 1] = forward ? { c1: [...edge.c1], c2: [...edge.c2] } : { c1: [...edge.c2], c2: [...edge.c1] };
            } else {
                const samples = forward ? edge.points : [...edge.points].reverse();
                samples.slice(0, -1).forEach((point) => points.push([...point]));
            }
        });
        if (!closed && ordered.length) {
            const last = ordered[ordered.length - 1];
            controlPoints.push(points.length);
            points.push([...(last.forward ? edges[last.index].b : edges[last.index].a)]);
        }
        return { points, controlPoints: [...new Set(controlPoints)], curves, analyticCurves, closed };
    };

    const trace = (first: number, start: string, stopAtJunction: boolean) => {
        const ordered: OrderedEdge[] = [];
        let current = start;
        let next = first;
        let closed = false;
        while (!used.has(next)) {
            const edge = edges[next];
            const forward = key(edge.a) === current;
            ordered.push({ index: next, forward });
            used.add(next);
            current = forward ? key(edge.b) : key(edge.a);
            if (current === start) {
                closed = true;
                break;
            }
            if (stopAtJunction && (adjacency.get(current)?.length || 0) !== 2) break;
            const candidates = (adjacency.get(current) || []).filter((index) => !used.has(index));
            if (!candidates.length) break;
            const incoming = (forward ? [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]] : [edge.a[0] - edge.b[0], edge.a[1] - edge.b[1]]) as Point2;
            next = candidates.sort((aIndex, bIndex) => {
                const score = (index: number) => {
                    const candidate = edges[index];
                    const forwardCandidate = key(candidate.a) === current;
                    const outgoing = (forwardCandidate
                        ? [candidate.b[0] - candidate.a[0], candidate.b[1] - candidate.a[1]]
                        : [candidate.a[0] - candidate.b[0], candidate.a[1] - candidate.b[1]]) as Point2;
                    return (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / ((length(incoming) * length(outgoing)) || 1);
                };
                return score(bIndex) - score(aIndex);
            })[0];
        }
        return { ordered, closed: closed && ordered.length >= 2 };
    };

    const paths: RestitchPath[] = [];
    [...adjacency.keys()].forEach((node) => {
        // Only open endpoints start open chains; junctions may still belong to a closed cycle.
        if ((adjacency.get(node)?.length || 0) !== 1) return;
        (adjacency.get(node) || []).forEach((index) => {
            if (used.has(index)) return;
            const { ordered, closed } = trace(index, node, true);
            if (ordered.length) paths.push(assemble(ordered, closed));
        });
    });
    edges.forEach((_, index) => {
        if (used.has(index)) return;
        const start = key(edges[index].a);
        const { ordered, closed } = trace(index, start, false);
        if (ordered.length) paths.push(assemble(ordered, closed));
    });
    return paths.filter((path) => path.points.length >= 2);
}
