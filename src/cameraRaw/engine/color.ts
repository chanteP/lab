import type { Adjustments, Grade, MixerColor } from '../types';

export const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const MIXER_HUE_SCALE = .6;
export const CALIBRATION_HUE_SCALE = .2;
export const luminance = (rgb: number[]) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;

export function hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

export function hslToRgb(h: number, s: number, l = 0.5): number[] {
    h = ((h % 360) + 360) % 360 / 360;
    s = clamp(s);
    if (!s) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

export function rgbToHsl(rgb: number[]): number[] {
    const [r, g, b] = rgb, max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return [h, s, l];
}

export function calibrationMatrix(a: Adjustments['calibration']): number[] {
    const primaries = [
        { hue: a.redHue, saturation: a.redSaturation, base: [1, 0, 0] },
        { hue: a.greenHue, saturation: a.greenSaturation, base: [0, 1, 0] },
        { hue: a.blueHue, saturation: a.blueSaturation, base: [0, 0, 1] },
    ];
    const columns = primaries.map(({ hue, saturation, base }) => {
        const [h, s, l] = rgbToHsl(base);
        const rotated = hslToRgb(h + hue * CALIBRATION_HUE_SCALE, s, l), amount = 1 + saturation / 100;
        return rotated.map((v) => l + (v - l) * amount);
    });
    // Column-major for GLSL mat3.
    return [columns[0][0], columns[0][1], columns[0][2], columns[1][0], columns[1][1], columns[1][2], columns[2][0], columns[2][1], columns[2][2]];
}

export const MIXER_CENTERS: Record<MixerColor, number> = {
    red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 225, purple: 275, magenta: 315,
};

export function applyMixer(rgb: number[], mixer: Adjustments['mixer']): number[] {
    const [h, s, l] = rgbToHsl(rgb);
    let hue = h, saturation = s, lightness = l;
    for (const [name, center] of Object.entries(MIXER_CENTERS) as [MixerColor, number][]) {
        const distance = Math.min(Math.abs(h - center), 360 - Math.abs(h - center));
        const weight = clamp(1 - distance / 45);
        const adj = mixer[name];
        hue += adj.hue * MIXER_HUE_SCALE * weight;
        saturation *= 1 + adj.saturation / 100 * weight;
        lightness += adj.luminance / 200 * weight;
    }
    return hslToRgb(hue, clamp(saturation), clamp(lightness));
}

export function gradeFor(range: Grade): number[] {
    const color = hslToRgb(range.hue, range.saturation / 100, 0.5);
    return color.map((v) => (v - 0.5) * range.saturation / 100);
}

export function whiteBalance(rgb: number[], temperature: number, tint: number): number[] {
    const t = temperature / 100, g = tint / 100;
    return [rgb[0] * (1 + t * .35), rgb[1] * (1 - Math.abs(t) * .04 + g * .18), rgb[2] * (1 - t * .35)];
}

export function applyTone(rgb: number[], a: Adjustments): number[] {
    let out = whiteBalance(rgb, a.temperature, a.tint).map((v) => v * 2 ** a.exposure);
    const l = luminance(out);
    const shadowWeight = 1 - clamp(l * 2), highlightWeight = clamp((l - .5) * 2);
    out = out.map((v) => v + a.shadows / 100 * shadowWeight * .35 + a.highlights / 100 * highlightWeight * .3);
    out = out.map((v) => v + a.whites / 100 * .35 * clamp(l * 2) + a.blacks / 100 * .3 * (1 - clamp(l * 2)));
    out = out.map((v) => (v - .18) * (1 + a.contrast / 100) + .18 + a.effects.dehaze / 100 * (luminance(out) - .5) * .35);
    const avg = (out[0] + out[1] + out[2]) / 3, max = Math.max(...out), min = Math.min(...out), sat = max ? (max - min) / max : 0;
    const saturation = 1 + a.saturation / 100 + a.vibrance / 100 * (1 - sat);
    return out.map((v) => clamp(avg + (v - avg) * saturation));
}

export function opticsCoordinate(x: number, y: number, distortion: number, midpoint = 50): [number, number] {
    const dx = x - .5, dy = y - .5, r2 = dx * dx + dy * dy;
    const scale = 1 + distortion / 100 * r2 * (1.5 - midpoint / 100);
    return [.5 + dx * scale, .5 + dy * scale];
}
