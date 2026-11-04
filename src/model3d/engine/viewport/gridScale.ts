/** Minor grid starts at 10 mm and changes by powers of ten before it becomes visually dense. */
export function gridStepForUnitsPerPixel(unitsPerPixel: number) {
    const safe = Math.max(1e-9, unitsPerPixel);
    return 10 * Math.pow(10, Math.ceil(Math.log10(safe / 0.5)));
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
