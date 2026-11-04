import type { Point2, SketchProfilePart } from '../types';

export interface ImportedSvgElement {
    name: string;
    profileType: 'polygon' | 'rectangle' | 'circle' | 'ellipse' | 'line';
    points: Point2[];
    parts?: SketchProfilePart[];
    open: boolean;
}

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const multiply = (left: Matrix, right: Matrix): Matrix => ({
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
});
const apply = (matrix: Matrix, point: Point2): Point2 => [
    matrix.a * point[0] + matrix.c * point[1] + matrix.e,
    matrix.b * point[0] + matrix.d * point[1] + matrix.f,
];
const number = (element: Element, name: string, fallback = 0) => Number(element.getAttribute(name) ?? fallback) || fallback;

function localMatrix(element: Element): Matrix {
    const transform = (element as SVGGraphicsElement).transform?.baseVal.consolidate()?.matrix;
    return transform ? { a: transform.a, b: transform.b, c: transform.c, d: transform.d, e: transform.e, f: transform.f } : identity;
}

function pathParts(path: SVGPathElement, matrix: Matrix): SketchProfilePart[] {
    const segments = (path.getAttribute('d') || '').match(/[Mm][^Mm]+/g) || [];
    return segments.flatMap((data) => {
        const partPath = path.cloneNode(false) as SVGPathElement;
        partPath.setAttribute('d', data);
        const length = partPath.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) return [];
        const count = Math.min(256, Math.max(12, Math.ceil(length / 3)));
        const points = Array.from({ length: count + 1 }, (_, index) => apply(matrix, (() => {
            const point = partPath.getPointAtLength(length * index / count);
            return [point.x, point.y] as Point2;
        })()));
        return [{ points, closed: /z\s*$/i.test(data.trim()) }];
    });
}

function elementProfile(element: SVGGraphicsElement, matrix: Matrix): Omit<ImportedSvgElement, 'name'> | null {
    const tag = element.tagName.toLowerCase();
    if (tag === 'path') {
        const parts = pathParts(element as SVGPathElement, matrix);
        if (!parts.length) return null;
        return { profileType: 'polygon', points: parts[0].points, parts: parts.length > 1 ? parts : undefined, open: !parts[0].closed };
    }
    if (tag === 'rect') {
        const x = number(element, 'x'), y = number(element, 'y'), width = number(element, 'width'), height = number(element, 'height');
        if (width <= 0 || height <= 0) return null;
        const points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]].map((point) => apply(matrix, point as Point2));
        const axisAligned = Math.abs(matrix.b) + Math.abs(matrix.c) < 1e-8;
        return { profileType: axisAligned ? 'rectangle' : 'polygon', points, open: false };
    }
    if (tag === 'circle' || tag === 'ellipse') {
        const cx = number(element, 'cx'), cy = number(element, 'cy');
        const rx = tag === 'circle' ? number(element, 'r') : number(element, 'rx');
        const ry = tag === 'circle' ? rx : number(element, 'ry');
        if (rx <= 0 || ry <= 0) return null;
        const points = [apply(matrix, [cx, cy]), apply(matrix, [cx + rx, cy]), apply(matrix, [cx, cy + ry])];
        const transformedRx = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
        const transformedRy = Math.hypot(points[2][0] - points[0][0], points[2][1] - points[0][1]);
        return { profileType: Math.abs(transformedRx - transformedRy) < 1e-8 ? 'circle' : 'ellipse', points, open: false };
    }
    if (tag === 'line') {
        return { profileType: 'line', points: [apply(matrix, [number(element, 'x1'), number(element, 'y1')]), apply(matrix, [number(element, 'x2'), number(element, 'y2')])], open: true };
    }
    if (tag === 'polyline' || tag === 'polygon') {
        const values = (element.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
        const points: Point2[] = [];
        for (let index = 0; index + 1 < values.length; index += 2) points.push(apply(matrix, [values[index], values[index + 1]]));
        return points.length >= 2 ? { profileType: 'polygon', points, open: tag === 'polyline' } : null;
    }
    return null;
}

/** Converts SVG primitives to editable sketch semantics and fits the complete viewBox into the current view. */
export function parseSvg(source: string, center: Point2, fitSize: number) {
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = parsed.documentElement as unknown as SVGSVGElement;
    if (svg.tagName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) throw new Error('SVG 文件无法解析');
    const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const box = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
        ? viewBox
        : [0, 0, number(svg, 'width', 100), number(svg, 'height', 100)];
    if (box[2] <= 0 || box[3] <= 0) throw new Error('SVG 缺少有效的 viewBox 或尺寸');
    const scale = Math.max(0.0001, fitSize) / Math.max(box[2], box[3]);
    const map = (point: Point2): Point2 => [
        center[0] + (point[0] - box[0] - box[2] / 2) * scale,
        center[1] - (point[1] - box[1] - box[3] / 2) * scale,
    ];
    const elements: ImportedSvgElement[] = [];
    const visit = (parent: Element, parentMatrix: Matrix) => {
        Array.from(parent.children).forEach((child) => {
            const matrix = multiply(parentMatrix, localMatrix(child));
            if (['g', 'svg', 'a', 'switch'].includes(child.tagName.toLowerCase())) visit(child, matrix);
            else {
                const profile = elementProfile(child as SVGGraphicsElement, matrix);
                if (!profile) return;
                const mapPart = (part: SketchProfilePart): SketchProfilePart => ({ ...part, points: part.points.map(map) });
                elements.push({
                    ...profile,
                    name: child.id || child.tagName.toLowerCase(),
                    points: profile.points.map(map),
                    parts: profile.parts?.map(mapPart),
                });
            }
        });
    };
    visit(svg, identity);
    if (!elements.length) throw new Error('SVG 中没有可转换的图形元素');
    const corners = [
        map([box[0], box[1] + box[3]]),
        map([box[0] + box[2], box[1] + box[3]]),
        map([box[0] + box[2], box[1]]),
        map([box[0], box[1]]),
    ];
    return { elements, corners };
}
