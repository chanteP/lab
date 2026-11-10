import type { MaskShape } from './types';

export type GradientMaskShape = Exclude<MaskShape, { type: 'brush' }>;

export function smoothstep(start: number, end: number, value: number): number {
    if (start === end) return value < start ? 0 : 1;
    const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
}

// Evaluate coverage numerically so transparent RGB interpolation and 8-bit
// canvas quantization cannot introduce a visible seam in gradient masks.
export function gradientCoverage(shape: GradientMaskShape, x: number, y: number, width: number, height: number): number {
    if (shape.type === 'linear') {
        const x1 = shape.start.x * width, y1 = shape.start.y * height;
        const dx = (shape.end.x - shape.start.x) * width, dy = (shape.end.y - shape.start.y) * height;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared < 1e-8) return 0;
        const position = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
        const feather = Math.max(.01, shape.feather / 100);
        return 1 - smoothstep(.5 - feather / 2, .5 + feather / 2, position);
    }
    const radiusX = Math.abs(shape.radiusX * width), radiusY = Math.abs(shape.radiusY * height);
    if (radiusX < 1e-8 || radiusY < 1e-8) return 0;
    const distance = Math.hypot((x - shape.center.x * width) / radiusX, (y - shape.center.y * height) / radiusY);
    return 1 - smoothstep(Math.max(0, 1 - shape.feather / 100), 1, distance);
}
