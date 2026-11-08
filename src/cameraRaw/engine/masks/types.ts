import type { Adjustments, Point } from '../../types';

export type MaskTool = 'brush' | 'linear' | 'radial';
export type MaskShapeMode = 'add' | 'subtract';

export interface MaskShapeBase {
    id: string;
    mode: MaskShapeMode;
    feather: number;
}

export interface BrushMaskShape extends MaskShapeBase {
    type: 'brush';
    points: Point[];
    size: number;
    flow: number;
    density: number;
}

export interface LinearMaskShape extends MaskShapeBase {
    type: 'linear';
    start: Point;
    end: Point;
}

export interface RadialMaskShape extends MaskShapeBase {
    type: 'radial';
    center: Point;
    radiusX: number;
    radiusY: number;
}

export type MaskShape = BrushMaskShape | LinearMaskShape | RadialMaskShape;

export interface ImageMask {
    id: string;
    name: string;
    visible: boolean;
    inverted: boolean;
    amount: number;
    overlay: boolean;
    shapes: MaskShape[];
    adjustments: Adjustments;
}
