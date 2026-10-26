import type { Adjustments, Curves, MixerColor } from '../types';
import { MIXER_COLORS } from '../types';

export const defaultCurves = (): Curves => ({
    rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    r: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    g: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    b: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
});

export const createDefaultAdjustments = (): Adjustments => ({
    temperature: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0,
    whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
    curves: defaultCurves(),
    mixer: Object.fromEntries(MIXER_COLORS.map((color) => [color, { hue: 0, saturation: 0, luminance: 0 }])) as Adjustments['mixer'],
    grading: {
        shadows: { hue: 0, saturation: 0, luminance: 0 },
        midtones: { hue: 0, saturation: 0, luminance: 0 },
        highlights: { hue: 0, saturation: 0, luminance: 0 }, blending: 50, balance: 0,
    },
    calibration: {
        shadowTint: 0, redHue: 0, redSaturation: 0, greenHue: 0,
        greenSaturation: 0, blueHue: 0, blueSaturation: 0,
    },
    optics: { distortion: 0, chromaticAberration: 0, vignette: 0, midpoint: 50 },
});

export function cloneAdjustments(value: Adjustments): Adjustments {
    // Vue reactive proxies cannot be passed to structuredClone; adjustments are plain JSON data.
    return JSON.parse(JSON.stringify(value));
}

export function mergeAdjustments(base: Adjustments, patch: Partial<Adjustments>): Adjustments {
    const result = cloneAdjustments(base);
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (key === 'curves') Object.assign(result.curves, value);
        else if (key === 'mixer') {
            for (const color of MIXER_COLORS) if (value[color]) Object.assign(result.mixer[color], value[color]);
        } else if (key === 'grading') {
            for (const range of ['shadows', 'midtones', 'highlights'] as const) {
                if (value[range]) Object.assign(result.grading[range], value[range]);
            }
            if (value.blending !== undefined) result.grading.blending = value.blending;
            if (value.balance !== undefined) result.grading.balance = value.balance;
        } else if (key === 'calibration' || key === 'optics') Object.assign(result[key], value);
        else (result as Record<string, unknown>)[key] = value;
    }
    return result;
}

export function hasAdjustments(value: Adjustments): boolean {
    return JSON.stringify(value) !== JSON.stringify(createDefaultAdjustments());
}
