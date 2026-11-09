import type { Adjustments, Curves, MixerColor } from '../types';
import { MIXER_COLORS } from '../types';
import { evaluateCurve } from './curve';

export const BASIC_ADJUSTMENT_KEYS = ['temperature', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'saturation'] as const;
export type AdjustmentSection = 'basic' | 'curve' | 'effects' | 'grading' | 'mixer' | 'calibration' | 'optics';
export type MaskAdjustmentSection = Exclude<AdjustmentSection, 'optics'>;
export const ADJUSTMENT_SECTIONS: AdjustmentSection[] = ['basic', 'curve', 'effects', 'grading', 'mixer', 'calibration', 'optics'];
export const MASK_ADJUSTMENT_SECTIONS: MaskAdjustmentSection[] = ['basic', 'curve', 'effects', 'grading', 'mixer', 'calibration'];
export const ADJUSTMENT_SECTION_LABELS: Record<AdjustmentSection, string> = {
    basic: '基本', curve: '曲线', effects: '效果', grading: '颜色分级', mixer: '混色器', calibration: '校准', optics: '光学',
};

export const defaultCurves = (): Curves => ({
    rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    r: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    g: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    b: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
});

export const createDefaultAdjustments = (): Adjustments => ({
    temperature: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0,
    whites: 0, blacks: 0, vibrance: 0, saturation: 0,
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
    effects: { texture: 0, clarity: 0, dehaze: 0, vignette: 0, vignetteMidpoint: 50, grain: 0, grainSize: 25, grainRoughness: 50 },
    optics: { distortion: 0, chromaticAberration: 0 },
});

export function cloneAdjustments(value: Adjustments): Adjustments {
    // Vue reactive proxies cannot be passed to structuredClone; adjustments are plain JSON data.
    return JSON.parse(JSON.stringify(value));
}

export function mergeAdjustments(base: Adjustments, patch: Partial<Adjustments>): Adjustments {
    const result = cloneAdjustments(base);
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (key === 'curves') Object.assign(result.curves, value as Adjustments['curves']);
        else if (key === 'mixer') {
            const mixer = value as Adjustments['mixer'];
            for (const color of MIXER_COLORS) if (mixer[color]) Object.assign(result.mixer[color], mixer[color]);
        } else if (key === 'grading') {
            const grading = value as Adjustments['grading'];
            for (const range of ['shadows', 'midtones', 'highlights'] as const) {
                if (grading[range]) Object.assign(result.grading[range], grading[range]);
            }
            if (grading.blending !== undefined) result.grading.blending = grading.blending;
            if (grading.balance !== undefined) result.grading.balance = grading.balance;
        } else if (key === 'calibration' || key === 'effects' || key === 'optics') Object.assign(result[key], value);
        else (result as unknown as Record<string, unknown>)[key] = value;
    }
    return result;
}

export function hasAdjustments(value: Adjustments): boolean {
    return JSON.stringify(value) !== JSON.stringify(createDefaultAdjustments());
}

export function resetAdjustmentSection(value: Adjustments, section: AdjustmentSection): Adjustments {
    const defaults = createDefaultAdjustments();
    if (section === 'basic') {
        for (const key of BASIC_ADJUSTMENT_KEYS) value[key] = defaults[key];
    } else if (section === 'curve') value.curves = defaults.curves;
    else if (section === 'effects') value.effects = defaults.effects;
    else if (section === 'grading') value.grading = defaults.grading;
    else if (section === 'mixer') value.mixer = defaults.mixer;
    else if (section === 'calibration') value.calibration = defaults.calibration;
    else value.optics = defaults.optics;
    return value;
}

export function withAdjustmentSectionsReset(value: Adjustments, sections: Iterable<AdjustmentSection>): Adjustments {
    const result = cloneAdjustments(value);
    for (const section of sections) resetAdjustmentSection(result, section);
    return result;
}

export function hasSectionAdjustments(value: Adjustments, section: AdjustmentSection): boolean {
    const defaults = createDefaultAdjustments();
    if (section === 'basic') return BASIC_ADJUSTMENT_KEYS.some((key) => value[key] !== defaults[key]);
    return JSON.stringify(value[section]) !== JSON.stringify(defaults[section]);
}

export function blendAdjustments(base: Adjustments, target: Adjustments, amount: number): Adjustments {
    const t = Math.max(0, Math.min(1, amount));
    if (t === 0) return cloneAdjustments(base);
    if (t === 1) return cloneAdjustments(target);
    const result = cloneAdjustments(base), lerp = (a: number, b: number) => a + (b - a) * t;
    const scalars = ['temperature', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'saturation'] as const;
    for (const key of scalars) result[key] = lerp(base[key], target[key]);
    for (const channel of ['rgb', 'r', 'g', 'b'] as const) {
        result.curves[channel] = Array.from({ length: 17 }, (_, i) => {
            const x = i / 16;
            return { x, y: lerp(evaluateCurve(base.curves[channel], x), evaluateCurve(target.curves[channel], x)) };
        });
    }
    for (const color of MIXER_COLORS) for (const key of ['hue', 'saturation', 'luminance'] as const) result.mixer[color][key] = lerp(base.mixer[color][key], target.mixer[color][key]);
    for (const range of ['shadows', 'midtones', 'highlights'] as const) {
        for (const key of ['hue', 'saturation', 'luminance'] as const) result.grading[range][key] = lerp(base.grading[range][key], target.grading[range][key]);
    }
    result.grading.blending = lerp(base.grading.blending, target.grading.blending);
    result.grading.balance = lerp(base.grading.balance, target.grading.balance);
    for (const key of Object.keys(result.calibration) as (keyof Adjustments['calibration'])[]) result.calibration[key] = lerp(base.calibration[key], target.calibration[key]);
    for (const key of Object.keys(result.effects) as (keyof Adjustments['effects'])[]) result.effects[key] = lerp(base.effects[key], target.effects[key]);
    for (const key of Object.keys(result.optics) as (keyof Adjustments['optics'])[]) result.optics[key] = lerp(base.optics[key], target.optics[key]);
    return result;
}
