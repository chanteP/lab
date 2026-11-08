import type { ImageMask, MaskShape } from './types';

function drawShape(context: CanvasRenderingContext2D, shape: MaskShape, width: number, height: number) {
    context.save();
    context.globalCompositeOperation = shape.mode === 'subtract' ? 'destination-out' : 'source-over';
    context.fillStyle = 'white'; context.strokeStyle = 'white';
    if (shape.type === 'brush') {
        if (!shape.points.length) { context.restore(); return; }
        const diameter = shape.size / 100 * Math.min(width, height);
        context.globalAlpha = shape.flow / 100 * shape.density / 100;
        context.lineWidth = diameter; context.lineCap = 'round'; context.lineJoin = 'round';
        context.filter = `blur(${Math.max(0, diameter * shape.feather / 200)}px)`;
        context.beginPath();
        shape.points.forEach((point, index) => {
            const x = point.x * width, y = point.y * height;
            if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        if (shape.points.length === 1) context.lineTo(shape.points[0].x * width + .01, shape.points[0].y * height);
        context.stroke();
    } else if (shape.type === 'linear') {
        const x1 = shape.start.x * width, y1 = shape.start.y * height, x2 = shape.end.x * width, y2 = shape.end.y * height;
        const gradient = context.createLinearGradient(x1, y1, x2, y2), feather = Math.max(.01, shape.feather / 100);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(Math.max(0, .5 - feather / 2), 'rgba(255,255,255,1)');
        gradient.addColorStop(Math.min(1, .5 + feather / 2), 'rgba(255,255,255,0)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    } else {
        const radius = Math.max(shape.radiusX * width, shape.radiusY * height);
        if (radius <= 0) { context.restore(); return; }
        context.translate(shape.center.x * width, shape.center.y * height);
        context.scale(shape.radiusX * width / radius, shape.radiusY * height / radius);
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
        const inner = Math.max(0, 1 - shape.feather / 100);
        gradient.addColorStop(0, 'white'); gradient.addColorStop(inner, 'white'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient; context.fillRect(-radius, -radius, radius * 2, radius * 2);
    }
    context.restore();
}

export function rasterizeMask(mask: ImageMask, width: number, height: number): Uint8Array {
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, width); canvas.height = Math.max(1, height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const shape of mask.shapes) drawShape(context, shape, canvas.width, canvas.height);
    if (mask.inverted) {
        context.globalCompositeOperation = 'difference'; context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data, alpha = new Uint8Array(canvas.width * canvas.height * 4);
    for (let i = 0; i < rgba.length; i += 4) { alpha[i] = alpha[i + 1] = alpha[i + 2] = rgba[i + 3]; alpha[i + 3] = 255; }
    return alpha;
}
