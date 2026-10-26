export type CurveChannel = 'rgb' | 'r' | 'g' | 'b';
export type Point = { x: number; y: number };
export type Curves = Record<CurveChannel, Point[]>;
export type MixerColor = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';
export type MixerAdjustment = { hue: number; saturation: number; luminance: number };
export type Grade = { hue: number; saturation: number; luminance: number };

export interface Adjustments {
    temperature: number;
    tint: number;
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
    texture: number;
    clarity: number;
    dehaze: number;
    vibrance: number;
    saturation: number;
    curves: Curves;
    mixer: Record<MixerColor, MixerAdjustment>;
    grading: { shadows: Grade; midtones: Grade; highlights: Grade; blending: number; balance: number };
    calibration: {
        shadowTint: number;
        redHue: number;
        redSaturation: number;
        greenHue: number;
        greenSaturation: number;
        blueHue: number;
        blueSaturation: number;
    };
    optics: { distortion: number; chromaticAberration: number; vignette: number; midpoint: number };
}

export interface ImageAsset {
    id: string;
    file: File;
    name: string;
    kind: 'raw' | 'jpeg' | 'png';
    thumbnail: string;
    bitmap?: ImageBitmap;
    width: number;
    height: number;
    rawWidth?: number;
    rawHeight?: number;
    metadata: Record<string, unknown>;
    rawMetadata?: Record<string, unknown>;
    adjustments: Adjustments;
    loading: boolean;
    error?: string;
}

export const MIXER_COLORS: MixerColor[] = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
export const MIXER_LABELS: Record<MixerColor, string> = {
    red: '红色', orange: '橙色', yellow: '黄色', green: '绿色',
    aqua: '浅绿色', blue: '蓝色', purple: '紫色', magenta: '洋红',
};
