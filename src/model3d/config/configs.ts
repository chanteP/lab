import type { DisplayMode, GeometryQuality, LengthUnit, SketchPlane } from '../types';

/** Display units supported by all length inputs and viewport annotations. */
export const LENGTH_UNITS: { label: string; value: LengthUnit; factor: number }[] = [
    { label: 'mm', value: 'mm', factor: 1 },
    { label: 'cm', value: 'cm', factor: 10 },
    { label: 'm', value: 'm', factor: 1000 },
];

/** Polygon side counts exposed by the sketch dropdown. */
export const POLYGON_SIDES = [3, 4, 5, 6, 7, 8];

/** Base planes offered when creating a sketch plane. */
export const BASE_PLANES: SketchPlane['kind'][] = ['XZ', 'XY', 'YZ'];

/** Export mesh quality presets; the number describes tessellation density. */
export const EXPORT_QUALITIES: { label: string; value: GeometryQuality }[] = [
    { label: '高 · 128', value: 'high' },
    { label: '超高 · 256', value: 'ultra' },
];

/** Solid, clay and line-based viewport appearances exposed beside the measurement tools. */
export const DISPLAY_MODES: { label: string; value: DisplayMode; icon: 'render' | 'clay' | 'wireframe' | 'xray' }[] = [
    { label: '渲染', value: 'shaded', icon: 'render' },
    { label: '白模', value: 'clay', icon: 'clay' },
    { label: '线框', value: 'wireframe', icon: 'wireframe' },
    { label: '透视', value: 'xray', icon: 'xray' },
];

export function normalizeDisplayMode(value: unknown): DisplayMode {
    return DISPLAY_MODES.some((mode) => mode.value === value) ? value as DisplayMode : 'shaded';
}
