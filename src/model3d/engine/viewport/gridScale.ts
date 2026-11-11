/** Grid steps use only 1 and 5 in every decade: 0.1, 0.5, 1, 5, 10, 50... */
export function gridStepForUnitsPerPixel(unitsPerPixel: number) {
    const safe = Math.max(1e-9, unitsPerPixel);
    const ratio = safe / 0.5;
    const decade = 10 ** Math.ceil(Math.log10(ratio));
    return ratio / decade >= 0.5 ? decade * 10 : decade * 5;
}

export function scaleBarForGrid(unitsPerPixel: number, gridSize: number, targetWidth = 150) {
    const segments = Math.max(1, Math.min(12, Math.round(targetWidth * unitsPerPixel / gridSize)));
    return {
        width: segments * gridSize / unitsPerPixel,
        value: segments * gridSize,
        segments,
        gridSize,
    };
}
