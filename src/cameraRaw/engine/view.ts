export type ViewPoint = { x: number; y: number };

export const clampZoom = (value: number) => Math.max(.1, Math.min(8, value));

export function zoomAtPoint(pointer: ViewPoint, pan: ViewPoint, previousZoom: number, nextZoom: number): ViewPoint {
    const ratio = nextZoom / previousZoom;
    return { x: pointer.x - (pointer.x - pan.x) * ratio, y: pointer.y - (pointer.y - pan.y) * ratio };
}
