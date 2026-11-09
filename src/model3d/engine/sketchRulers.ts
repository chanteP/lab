import type { LengthUnit, Point2, SketchReferenceGuide, SketchRulerSide } from '../types';

export type ScreenPoint = { x: number; y: number };
export type ProjectedSketchGuide = SketchReferenceGuide & { x: number; y: number; rulerPosition: number };
export type SketchRulerFrame = {
    width: number;
    height: number;
    origin: ScreenPoint;
    unitsPerPixel: number;
    unit: LengthUnit;
    guides: ProjectedSketchGuide[];
};

/** A ruler drag uses the opposite axis: top creates horizontal lines, left creates vertical lines. */
export function guideFromRuler(side: SketchRulerSide, point: Point2, origin: Point2, unitsPerPixel: number): Pick<SketchReferenceGuide, 'axis' | 'offset'> {
    return side === 'top'
        ? { axis: 'v', offset: (origin[1] - point[1]) * unitsPerPixel }
        : { axis: 'u', offset: (point[0] - origin[0]) * unitsPerPixel };
}

export function guideScreenPosition(guide: SketchReferenceGuide, origin: Point2, unitsPerPixel: number): { ruler: SketchRulerSide; position: number } {
    return guide.axis === 'u'
        ? { ruler: 'top', position: origin[0] + guide.offset / unitsPerPixel }
        : { ruler: 'left', position: origin[1] - guide.offset / unitsPerPixel };
}

/** Choose a 1/2/5 decade step near 50 CSS pixels. */
export function rulerTickStep(unitsPerPixel: number, targetPixels = 50) {
    const raw = Math.max(Number.EPSILON, targetPixels * unitsPerPixel);
    const power = 10 ** Math.floor(Math.log10(raw));
    const normalized = raw / power;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}

export function rulerTicks(originPixels: number, unitsPerPixel: number, pixelSize: number, targetPixels = 50) {
    const step = rulerTickStep(unitsPerPixel, targetPixels);
    const stepPixels = step / unitsPerPixel;
    const first = Math.floor((-originPixels) / stepPixels) - 1;
    const last = Math.ceil((pixelSize - originPixels) / stepPixels) + 1;
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
        const value = (first + index) * step;
        return { value, position: originPixels + value / unitsPerPixel };
    }).filter((tick) => tick.position >= 0 && tick.position <= pixelSize);
}

export type RulerScaleTick = { value: number; position: number; kind: 'major' | 'medium' | 'minor' };

/** Ten subdivisions produce a conventional long/medium/short ruler scale. */
export function rulerScaleTicks(originPixels: number, unitsPerPixel: number, pixelSize: number, targetPixels = 50): RulerScaleTick[] {
    const majorStep = rulerTickStep(unitsPerPixel, targetPixels);
    const minorStep = majorStep / 10;
    const minorPixels = minorStep / unitsPerPixel;
    const first = Math.floor((-originPixels) / minorPixels) - 1;
    const last = Math.ceil((pixelSize - originPixels) / minorPixels) + 1;
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => {
        const index = first + offset;
        const value = index * minorStep;
        const position = originPixels + value / unitsPerPixel;
        const majorValue = Math.round(value / majorStep) * majorStep;
        const mediumValue = Math.round(value / (majorStep / 2)) * majorStep / 2;
        const kind: RulerScaleTick['kind'] = Math.abs(value - majorValue) < minorStep * 0.001 ? 'major' : Math.abs(value - mediumValue) < minorStep * 0.001 ? 'medium' : 'minor';
        return { value, position, kind };
    }).filter((tick) => tick.position >= 0 && tick.position <= pixelSize);
}

export function screenPointFromEvent(event: PointerEvent, element: HTMLElement): ScreenPoint {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/** Snap one guide offset to its corresponding visible ruler ticks; tolerance stays in CSS pixels. */
export function snapGuideOffsetToRuler(guide: SketchReferenceGuide, offset: number, frame: SketchRulerFrame) {
    const horizontalAxis = guide.axis === 'u';
    const origin = horizontalAxis ? frame.origin.x : frame.origin.y;
    const size = horizontalAxis ? frame.width : frame.height;
    const ticks = rulerTicks(origin, frame.unitsPerPixel, size);
    const candidates = ticks.map((tick) => ({
        offset: tick.value,
        distance: Math.abs(tick.value - offset) / frame.unitsPerPixel,
    }));
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.offset ?? offset;
}

export function guidePointerOutsideViewport(axis: 'u' | 'v', point: ScreenPoint, frame: SketchRulerFrame, rulerSize = 12) {
    return axis === 'u'
        ? point.x <= rulerSize || point.x >= frame.width
        : point.y <= rulerSize || point.y >= frame.height;
}
