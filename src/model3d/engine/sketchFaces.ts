import { borderSegments } from './sketchBorders';
import type { ModelEntity, Point2 } from '../types';

export interface SketchFace {
    points: Point2[];
}

type Edge = { a: Point2; b: Point2; points: Point2[]; closed: boolean };
type Directed = { edge: number; from: string; to: string; points: Point2[] };

const key = (point: Point2) => `${Math.round(point[0] * 10)},${Math.round(point[1] * 10)}`;
const sub = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point2, b: Point2) => a[0] * b[1] - a[1] * b[0];
const distance = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function intersection(a: Point2, b: Point2, c: Point2, d: Point2) {
    const r = sub(b, a), s = sub(d, c), denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-8) return null;
    const delta = sub(c, a), epsilon = 1e-6;
    const t = cross(delta, s) / denominator, u = cross(delta, r) / denominator;
    return t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon ? t : null;
}

function pointAt(edge: Edge, t: number) {
    const scaled = Math.max(0, Math.min(1, t)) * (edge.points.length - 1);
    const index = Math.min(edge.points.length - 2, Math.floor(scaled));
    const fraction = scaled - index, a = edge.points[index], b = edge.points[index + 1];
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction] as Point2;
}

function slice(edge: Edge, start: number, end: number): Edge {
    const points: Point2[] = [pointAt(edge, start)];
    const append = (point: Point2) => {
        if (distance(points[points.length - 1], point) > 1e-8) points.push([...point]);
    };
    const first = Math.ceil(start * (edge.points.length - 1)), last = Math.floor(end * (edge.points.length - 1));
    for (let index = first; index <= last; index++) append(edge.points[index]);
    append(pointAt(edge, end));
    return { a: points[0], b: points[points.length - 1], points, closed: false };
}

function splitEdges(source: Edge[]) {
    return source.flatMap((edge, edgeIndex) => {
        const ts = new Set<number>([0, 1]);
        for (let i = 0; i < edge.points.length - 1; i++) {
            source.forEach((other, otherIndex) => {
                if (otherIndex === edgeIndex) return;
                for (let j = 0; j < other.points.length - 1; j++) {
                    const t = intersection(edge.points[i], edge.points[i + 1], other.points[j], other.points[j + 1]);
                    if (t !== null) ts.add((i + t) / (edge.points.length - 1));
                }
            });
        }
        const sorted = [...ts].sort((a, b) => a - b);
        if (edge.closed && sorted.length === 2) return [edge];
        return sorted.slice(1).map((end, index) => slice(edge, sorted[index], end)).filter((part) => part.points.length > 1 && distance(part.a, part.b) > 1e-8);
    });
}

/** Find bounded faces with directed half-edges; negative-area walks are the unbounded exterior. */
export function computeSketchFaces(entities: ModelEntity[], planeId: string): SketchFace[] {
    const source = entities.filter((entity) => entity.kind === 'sketch' && entity.planeId === planeId).flatMap((entity) => borderSegments(entity).map((segment) => ({
        a: segment.points[0], b: segment.points[segment.points.length - 1], points: segment.points, closed: segment.closed,
    })));
    const edges = splitEdges(source);
    const directed: Directed[] = edges.flatMap((edge, index) => [
        { edge: index, from: key(edge.a), to: key(edge.b), points: edge.points },
        { edge: index, from: key(edge.b), to: key(edge.a), points: [...edge.points].reverse() },
    ]);
    const adjacency = new Map<string, number[]>();
    directed.forEach((item, index) => adjacency.set(item.from, [...adjacency.get(item.from) || [], index]));
    adjacency.forEach((indices) => indices.sort((aIndex, bIndex) => {
        const angle = (index: number) => {
            const points = directed[index].points;
            return Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]);
        };
        return angle(aIndex) - angle(bIndex);
    }));

    const visited = new Set<number>();
    const faces: SketchFace[] = [];
    directed.forEach((_, start) => {
        if (visited.has(start)) return;
        const walk: number[] = [];
        let current = start;
        while (!visited.has(current)) {
            visited.add(current);
            walk.push(current);
            const item = directed[current];
            const siblings = adjacency.get(item.to) || [];
            const reverse = siblings.indexOf(current ^ 1);
            if (reverse < 0 || !siblings.length) break;
            current = siblings[(reverse - 1 + siblings.length) % siblings.length];
        }
        if (current !== start || walk.length < 2) return;
        const points = walk.flatMap((index) => directed[index].points.slice(0, -1));
        const area = points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point[0] * next[1] - next[0] * point[1];
        }, 0) / 2;
        if (area > 0.0001) faces.push({ points });
    });
    return faces;
}
