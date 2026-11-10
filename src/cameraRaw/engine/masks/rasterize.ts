import type { BrushMaskShape, ImageMask, MaskShapeMode } from './types';
import { gradientCoverage } from './gradient';

function drawBrush(context: CanvasRenderingContext2D, shape: BrushMaskShape, width: number, height: number) {
    if (!shape.points.length) return;
    const diameter = shape.size / 100 * Math.min(width, height);
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = shape.flow / 100 * shape.density / 100;
    context.strokeStyle = 'white';
    context.lineWidth = diameter; context.lineCap = 'round'; context.lineJoin = 'round';
    context.filter = `blur(${Math.max(0, diameter * shape.feather / 200)}px)`;
    context.beginPath();
    shape.points.forEach((point, index) => {
        const x = point.x * width, y = point.y * height;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    if (shape.points.length === 1) context.lineTo(shape.points[0].x * width + .01, shape.points[0].y * height);
    context.stroke();
    context.restore();
}

function blendCoverage(previous: number, coverage: number, mode: MaskShapeMode): number {
    return mode === 'subtract' ? previous * (1 - coverage) : coverage + previous * (1 - coverage);
}

export function rasterizeMask(mask: ImageMask, width: number, height: number): Float32Array {
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, width); canvas.height = Math.max(1, height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const values = new Float32Array(canvas.width * canvas.height);

    for (const shape of mask.shapes) {
        if (shape.type === 'brush') {
            context.clearRect(0, 0, canvas.width, canvas.height);
            drawBrush(context, shape, canvas.width, canvas.height);
            const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 0; i < values.length; i++) values[i] = blendCoverage(values[i], rgba[i * 4 + 3] / 255, shape.mode);
            continue;
        }

        const radiusX = shape.type === 'radial' ? Math.abs(shape.radiusX * canvas.width) : canvas.width;
        const radiusY = shape.type === 'radial' ? Math.abs(shape.radiusY * canvas.height) : canvas.height;
        const centerX = shape.type === 'radial' ? shape.center.x * canvas.width : 0;
        const centerY = shape.type === 'radial' ? shape.center.y * canvas.height : 0;
        const minX = Math.max(0, Math.floor(centerX - radiusX)), maxX = Math.min(canvas.width, Math.ceil(centerX + radiusX));
        const minY = Math.max(0, Math.floor(centerY - radiusY)), maxY = Math.min(canvas.height, Math.ceil(centerY + radiusY));
        for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
            const coverage = gradientCoverage(shape, x + .5, y + .5, canvas.width, canvas.height);
            const index = y * canvas.width + x;
            values[index] = blendCoverage(values[index], coverage, shape.mode);
        }
    }

    if (mask.inverted) for (let i = 0; i < values.length; i++) values[i] = 1 - values[i];
    return values;
}
