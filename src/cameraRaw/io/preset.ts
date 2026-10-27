import { createDefaultAdjustments, mergeAdjustments } from '../engine/adjustments';
import type { Adjustments, CurveChannel, MixerColor } from '../types';
import { MIXER_COLORS } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (v: string | undefined) => v === undefined ? undefined : Number(v);

function readFields(xml: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const clean = xml.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const match of clean.matchAll(/<crs:([\w]+)(?:\s[^>]*)?>([\s\S]*?)<\/crs:\1>/g)) {
        fields[match[1]] = match[2].replace(/<[^>]+>/g, '').trim();
    }
    for (const match of clean.matchAll(/crs:([\w]+)\s*=\s*["']([^"']*)["']/g)) fields[match[1]] = match[2];
    return fields;
}

function readCurve(value: string | undefined) {
    if (!value) return undefined;
    const values = value.match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const points = [];
    for (let i = 0; i + 1 < values.length; i += 2) points.push({ x: values[i] / 255, y: values[i + 1] / 255 });
    return points.length >= 2 ? points : undefined;
}

export function parsePreset(text: string): Adjustments {
    if (text.trim().startsWith('{')) return mergeAdjustments(createDefaultAdjustments(), JSON.parse(text));
    const f = readFields(text), patch: Record<string, unknown> = {}, mixer: Record<string, unknown> = {};
    const basic: Record<string, string> = {
        temperature: 'Temperature', tint: 'Tint', exposure: 'Exposure2012', contrast: 'Contrast2012',
        highlights: 'Highlights2012', shadows: 'Shadows2012', whites: 'Whites2012', blacks: 'Blacks2012',
        vibrance: 'Vibrance', saturation: 'Saturation',
    };
    for (const [key, field] of Object.entries(basic)) {
        const value = num(f[field]);
        if (value === undefined || !Number.isFinite(value)) continue;
        patch[key] = key === 'temperature' ? Math.max(-100, Math.min(100, (value - 5500) / 100)) : value;
    }
    const curves: Record<string, unknown> = {};
    for (const [channel, name] of Object.entries({ rgb: '', r: 'Red', g: 'Green', b: 'Blue' })) {
        const points = readCurve(f[`ToneCurvePV2012${name}`]);
        if (points) curves[channel] = points;
    }
    if (Object.keys(curves).length) patch.curves = curves;
    for (const color of MIXER_COLORS) {
        const name = cap(color), adj: Record<string, number> = {};
        for (const [key, prefix] of Object.entries({ hue: 'HueAdjustment', saturation: 'SaturationAdjustment', luminance: 'LuminanceAdjustment' })) {
            const value = num(f[`${prefix}${name}`]);
            if (value !== undefined && Number.isFinite(value)) adj[key] = value;
        }
        if (Object.keys(adj).length) mixer[color] = adj;
    }
    if (Object.keys(mixer).length) patch.mixer = mixer;
    const grading: Record<string, unknown> = {};
    for (const [range, prefix] of Object.entries({ shadows: 'Shadow', midtones: 'Midtone', highlights: 'Highlight' })) {
        const adj: Record<string, number> = {};
        for (const [key, suffix, old] of [['hue', 'Hue', 'SplitToning'], ['saturation', 'Sat', 'SplitToning'], ['luminance', 'Lum', '']]) {
            const value = num(f[`ColorGrade${prefix}${suffix}`] ?? (old ? f[`${old}${prefix}${suffix === 'Sat' ? 'Saturation' : suffix}`] : undefined));
            if (value !== undefined && Number.isFinite(value)) adj[key] = value;
        }
        if (Object.keys(adj).length) grading[range] = adj;
    }
    if (Object.keys(grading).length) patch.grading = grading;
    const calibration: Record<string, number> = {};
    const calibrationFields = { shadowTint: 'ShadowTint', redHue: 'RedHue', redSaturation: 'RedSaturation', greenHue: 'GreenHue', greenSaturation: 'GreenSaturation', blueHue: 'BlueHue', blueSaturation: 'BlueSaturation' };
    for (const [key, field] of Object.entries(calibrationFields)) {
        const value = num(f[field]); if (value !== undefined && Number.isFinite(value)) calibration[key] = value;
    }
    if (Object.keys(calibration).length) patch.calibration = calibration;
    const effects: Record<string, number> = {};
    const effectFields = { texture: 'Texture', clarity: 'Clarity2012', dehaze: 'Dehaze', vignette: 'PostCropVignetteAmount', vignetteMidpoint: 'PostCropVignetteMidpoint', grain: 'GrainAmount', grainSize: 'GrainSize', grainRoughness: 'GrainRoughness' };
    for (const [key, fieldName] of Object.entries(effectFields)) { const value = num(f[fieldName]); if (value !== undefined && Number.isFinite(value)) effects[key] = value; }
    if (Object.keys(effects).length) patch.effects = effects;
    return mergeAdjustments(createDefaultAdjustments(), patch);
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const field = (name: string, value: string | number) => `    <crs:${name}>${esc(String(value))}</crs:${name}>`;

export function serializePreset(a: Adjustments, name = 'Camera Raw Lab Preset'): string {
    const lines: string[] = [];
    const add = (key: string, value: number) => lines.push(field(key, Math.round(value * 10000) / 10000));
    add('Temperature', 5500 + a.temperature * 100); add('Tint', a.tint); add('Exposure2012', a.exposure);
    for (const [key, fieldName] of Object.entries({ contrast: 'Contrast2012', highlights: 'Highlights2012', shadows: 'Shadows2012', whites: 'Whites2012', blacks: 'Blacks2012', vibrance: 'Vibrance', saturation: 'Saturation' })) add(fieldName, a[key as keyof Adjustments] as number);
    for (const [channel, suffix] of Object.entries({ rgb: '', r: 'Red', g: 'Green', b: 'Blue' })) {
        lines.push(field(`ToneCurvePV2012${suffix}`, a.curves[channel as CurveChannel].flatMap((p) => [Math.round(p.x * 255), Math.round(p.y * 255)]).join(', ')));
    }
    for (const color of MIXER_COLORS) for (const [key, prefix] of Object.entries({ hue: 'HueAdjustment', saturation: 'SaturationAdjustment', luminance: 'LuminanceAdjustment' })) add(`${prefix}${cap(color)}`, a.mixer[color][key as keyof typeof a.mixer.red]);
    for (const [range, prefix] of Object.entries({ shadows: 'Shadow', midtones: 'Midtone', highlights: 'Highlight' })) {
        add(`ColorGrade${prefix}Hue`, a.grading[range as 'shadows'].hue);
        add(`ColorGrade${prefix}Sat`, a.grading[range as 'shadows'].saturation);
        add(`ColorGrade${prefix}Lum`, a.grading[range as 'shadows'].luminance);
    }
    for (const [key, fieldName] of Object.entries({ shadowTint: 'ShadowTint', redHue: 'RedHue', redSaturation: 'RedSaturation', greenHue: 'GreenHue', greenSaturation: 'GreenSaturation', blueHue: 'BlueHue', blueSaturation: 'BlueSaturation' })) add(fieldName, a.calibration[key as keyof Adjustments['calibration']]);
    for (const [key, fieldName] of Object.entries({ texture: 'Texture', clarity: 'Clarity2012', dehaze: 'Dehaze', vignette: 'PostCropVignetteAmount', vignetteMidpoint: 'PostCropVignetteMidpoint', grain: 'GrainAmount', grainSize: 'GrainSize', grainRoughness: 'GrainRoughness' })) add(fieldName, a.effects[key as keyof Adjustments['effects']]);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Camera Raw Lab">\n <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n  <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:PresetType="Normal" crs:Cluster="${esc(name)}" crs:Version="17.0">\n${lines.join('\n')}\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>`;
}
