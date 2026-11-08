import type { Adjustments } from '../../types';
import { cloneAdjustments, createDefaultAdjustments } from '../adjustments';
import { evaluateCurve } from '../curve';
import type { ImageMask, MaskShape, MaskTool } from './types';

export function createMask(index: number, shape: MaskShape): ImageMask {
    return {
        id: crypto.randomUUID(), name: `蒙版 ${index}`, visible: true, inverted: false,
        amount: 100, overlay: true, shapes: [shape], adjustments: createDefaultAdjustments(),
    };
}

export function createShape(tool: MaskTool, x: number, y: number, mode: 'add' | 'subtract' = 'add'): MaskShape {
    const base = { id: crypto.randomUUID(), mode, feather: 50 };
    if (tool === 'brush') return { ...base, type: tool, points: [{ x, y }], size: 20, flow: 100, density: 100 };
    if (tool === 'linear') return { ...base, type: tool, start: { x, y }, end: { x: Math.min(1, x + .25), y: Math.min(1, y + .25) } };
    return { ...base, type: tool, center: { x, y }, radiusX: .15, radiusY: .15 };
}

// Local sliders are deltas from their neutral values. Curves are composed by
// sampling base→local, so a neutral local adjustment is truly a no-op.
export function combineMaskAdjustments(base: Adjustments, local: Adjustments): Adjustments {
    const defaults = createDefaultAdjustments(), result = cloneAdjustments(base);
    const add = (key: 'temperature' | 'tint' | 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks' | 'vibrance' | 'saturation') => { (result as unknown as Record<string, number>)[key] = base[key] + local[key] - defaults[key]; };
    for (const key of ['temperature', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'saturation'] as const) add(key);
    for (const channel of ['rgb', 'r', 'g', 'b'] as const) {
        if (JSON.stringify(local.curves[channel]) === JSON.stringify(defaults.curves[channel])) continue;
        result.curves[channel] = Array.from({ length: 17 }, (_, index) => {
            const x = index / 16, y = evaluateCurve(local.curves[channel], evaluateCurve(base.curves[channel], x));
            return { x, y: Math.max(0, Math.min(1, y)) };
        });
    }
    for (const color of Object.keys(result.mixer) as (keyof Adjustments['mixer'])[]) {
        for (const key of ['hue', 'saturation', 'luminance'] as const) result.mixer[color][key] = base.mixer[color][key] + local.mixer[color][key];
    }
    for (const range of ['shadows', 'midtones', 'highlights'] as const) {
        for (const key of ['hue', 'saturation', 'luminance'] as const) result.grading[range][key] = base.grading[range][key] + local.grading[range][key];
    }
    result.grading.blending = base.grading.blending + local.grading.blending - defaults.grading.blending;
    result.grading.balance = base.grading.balance + local.grading.balance;
    for (const key of Object.keys(result.calibration) as (keyof Adjustments['calibration'])[]) result.calibration[key] = base.calibration[key] + local.calibration[key];
    for (const key of Object.keys(result.effects) as (keyof Adjustments['effects'])[]) result.effects[key] = base.effects[key] + local.effects[key] - defaults.effects[key];
    for (const key of Object.keys(result.optics) as (keyof Adjustments['optics'])[]) result.optics[key] = base.optics[key] + local.optics[key];
    return result;
}
