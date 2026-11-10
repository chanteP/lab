/** Minor grid starts at 10 mm and changes in 5x steps to avoid large zoom jumps. */
export function gridStepForUnitsPerPixel(unitsPerPixel: number) {
    const safe = Math.max(1e-9, unitsPerPixel);
    return 10 * Math.pow(5, Math.ceil(Math.log(safe / 0.5) / Math.log(5)));
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
