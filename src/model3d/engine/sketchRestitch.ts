import type { Point2 } from '../types';
import type { ProfileCurves } from './profiles';

export interface RestitchEdge {
    a: Point2;
    b: Point2;
    points: Point2[];
    c1?: Point2;
    c2?: Point2;
}

export interface RestitchPath {
    points: Point2[];
    controlPoints: number[];
    curves: ProfileCurves;
    closed: boolean;
}

type OrderedEdge = { index: number; forward: boolean };

const key = (point: Point2) => `${Math.round(point[0] * 10)},${Math.round(point[1] * 10)}`;
const length = (point: Point2) => Math.hypot(point[0], point[1]);

/** Join degree-two nodes into continuous paths before extracting the remaining closed cycles. */
export function restitchSketchEdges(edges: RestitchEdge[]): RestitchPath[] {
    edges = edges.filter((edge) => key(edge.a) !== key(edge.b) && length([edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]]) > 1e-8);
    const adjacency = new Map<string, number[]>();
    edges.forEach((edge, index) => {
        [key(edge.a), key(edge.b)].forEach((node) => adjacency.set(node, [...adjacency.get(node) || [], index]));
    });
    const used = new Set<number>();

    const assemble = (ordered: OrderedEdge[], closed: boolean): RestitchPath => {
        const points: Point2[] = [];
        const controlPoints: number[] = [];
        const curves: ProfileCurves = {};
        ordered.forEach(({ index, forward }) => {
            const edge = edges[index];
            controlPoints.push(points.length);
            if (edge.c1 && edge.c2) {
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
        return { points, controlPoints: [...new Set(controlPoints)], curves, closed };
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
            const incoming = forward ? [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]] : [edge.a[0] - edge.b[0], edge.a[1] - edge.b[1]];
            next = candidates.sort((aIndex, bIndex) => {
                const score = (index: number) => {
                    const candidate = edges[index];
                    const forwardCandidate = key(candidate.a) === current;
                    const outgoing = forwardCandidate
                        ? [candidate.b[0] - candidate.a[0], candidate.b[1] - candidate.a[1]]
                        : [candidate.a[0] - candidate.b[0], candidate.a[1] - candidate.b[1]];
                    return (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / ((length(incoming) * length(outgoing)) || 1);
                };
                return score(bIndex) - score(aIndex);
            })[0];
        }
        return { ordered, closed: closed && ordered.length >= 2 };
    };

    const paths: RestitchPath[] = [];
    [...adjacency.keys()].forEach((node) => {
        if ((adjacency.get(node)?.length || 0) === 2) return;
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
