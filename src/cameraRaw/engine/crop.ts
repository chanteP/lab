import type { CropSettings, Point } from '../types';

export const FULL_CROP: CropSettings = { x: 0, y: 0, width: 1, height: 1 };
export const MIN_CROP_SIZE = .02;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function hasCrop(crop?: CropSettings): boolean {
    return Boolean(crop && (crop.x > 0 || crop.y > 0 || crop.width < 1 || crop.height < 1));
}

export function cropDimensions(sourceWidth: number, sourceHeight: number, crop?: CropSettings) {
    const value = crop ?? FULL_CROP;
    return { width: Math.max(1, Math.round(sourceWidth * value.width)), height: Math.max(1, Math.round(sourceHeight * value.height)) };
}

export function centeredCrop(sourceWidth: number, sourceHeight: number, ratio: number, current?: CropSettings): CropSettings {
    const sourceRatio = sourceWidth / sourceHeight;
    const width = Math.min(1, ratio / sourceRatio), height = Math.min(1, sourceRatio / ratio);
    const centerX = current ? current.x + current.width / 2 : .5, centerY = current ? current.y + current.height / 2 : .5;
    return { x: clamp(centerX - width / 2, 0, 1 - width), y: clamp(centerY - height / 2, 0, 1 - height), width, height, ratio };
}

function lockedCorner(start: CropSettings, point: Point, handle: string, normalizedRatio: number): CropSettings {
    const left = handle.includes('w'), right = handle.includes('e'), top = handle.includes('n'), bottom = handle.includes('s');
    const anchorX = left ? start.x + start.width : start.x, anchorY = top ? start.y + start.height : start.y;
    const signX = left ? -1 : 1, signY = top ? -1 : 1;
    let width = Math.abs(point.x - anchorX), height = Math.abs(point.y - anchorY);
    if (width / normalizedRatio > height) height = width / normalizedRatio; else width = height * normalizedRatio;
    const maxWidth = right ? 1 - anchorX : anchorX, maxHeight = bottom ? 1 - anchorY : anchorY;
    width = clamp(width, MIN_CROP_SIZE, maxWidth); height = clamp(width / normalizedRatio, MIN_CROP_SIZE, maxHeight); width = height * normalizedRatio;
    if (width > maxWidth) { width = maxWidth; height = width / normalizedRatio; }
    return { x: left ? anchorX - width : anchorX, y: top ? anchorY - height : anchorY, width, height, ratio: start.ratio };
}

export function dragCrop(start: CropSettings, handle: string, point: Point, pointerStart: Point, sourceWidth: number, sourceHeight: number, free = false): CropSettings {
    if (handle === 'move') {
        const dx = point.x - pointerStart.x, dy = point.y - pointerStart.y;
        return { ...start, x: clamp(start.x + dx, 0, 1 - start.width), y: clamp(start.y + dy, 0, 1 - start.height) };
    }
    const ratio = free ? undefined : start.ratio;
    if (ratio && handle.length === 2) return { ...lockedCorner({ ...start, ratio }, point, handle, ratio / (sourceWidth / sourceHeight)), ratio };
    let left = start.x, right = start.x + start.width, top = start.y, bottom = start.y + start.height;
    if (handle.includes('w')) left = clamp(point.x, 0, right - MIN_CROP_SIZE);
    if (handle.includes('e')) right = clamp(point.x, left + MIN_CROP_SIZE, 1);
    if (handle.includes('n')) top = clamp(point.y, 0, bottom - MIN_CROP_SIZE);
    if (handle.includes('s')) bottom = clamp(point.y, top + MIN_CROP_SIZE, 1);
    let width = right - left, height = bottom - top;
    if (ratio) {
        const normalizedRatio = ratio / (sourceWidth / sourceHeight), centerX = start.x + start.width / 2, centerY = start.y + start.height / 2;
        if (handle === 'e' || handle === 'w') {
            height = clamp(width / normalizedRatio, MIN_CROP_SIZE, 1); width = height * normalizedRatio;
            if (width > 1) { width = 1; height = width / normalizedRatio; }
            if (handle === 'w') left = right - width; else right = left + width;
            top = clamp(centerY - height / 2, 0, 1 - height); bottom = top + height;
        } else {
            width = clamp(height * normalizedRatio, MIN_CROP_SIZE, 1); height = width / normalizedRatio;
            if (handle === 'n') top = bottom - height; else bottom = top + height;
            left = clamp(centerX - width / 2, 0, 1 - width); right = left + width;
        }
    }
    return { x: left, y: top, width: right - left, height: bottom - top, ratio };
}
