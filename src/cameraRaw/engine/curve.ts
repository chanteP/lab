import type { Point } from '../types';

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function normalizePoints(points: Point[]): Point[] {
    const sorted = points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })).sort((a, b) => a.x - b.x);
    if (!sorted.length || sorted[0].x !== 0) sorted.unshift({ x: 0, y: 0 });
    if (sorted[sorted.length - 1].x !== 1) sorted.push({ x: 1, y: 1 });
    return sorted.filter((p, i) => i === 0 || p.x > sorted[i - 1].x);
}

// Fritsch-Carlson monotone cubic interpolation: smooth like ACR without introducing overshoot.
export function evaluateCurve(points: Point[], x: number): number {
    const p = normalizePoints(points);
    if (x <= 0) return p[0].y;
    if (x >= 1) return p[p.length - 1].y;
    const d = p.slice(1).map((v, i) => (v.y - p[i].y) / (v.x - p[i].x));
    const m = p.map((_, i) => {
        if (i === 0) return d[0];
        if (i === p.length - 1) return d[d.length - 1];
        if (d[i - 1] * d[i] <= 0) return 0;
        const h0 = p[i].x - p[i - 1].x, h1 = p[i + 1].x - p[i].x, w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
        return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    });
    for (let i = 0; i < d.length; i++) {
        if (Math.abs(d[i]) < 1e-8) { m[i] = m[i + 1] = 0; continue; }
        const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
        if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    const i = p.findIndex((v, index) => index < p.length - 1 && x <= p[index + 1].x);
    const h = p[i + 1].x - p[i].x, t = (x - p[i].x) / h;
    return clamp01((2 * t ** 3 - 3 * t ** 2 + 1) * p[i].y + (t ** 3 - 2 * t ** 2 + t) * h * m[i]
        + (-2 * t ** 3 + 3 * t ** 2) * p[i + 1].y + (t ** 3 - t ** 2) * h * m[i + 1]);
}

export function createCurveLut(points: Point[], size = 256): Uint8Array {
    return Uint8Array.from({ length: size }, (_, i) => Math.round(evaluateCurve(points, i / (size - 1)) * 255));
}
