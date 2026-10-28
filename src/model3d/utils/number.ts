export function integerStep(value: number, direction: 1 | -1, step = 1) {
    const current = Number.isFinite(value) ? value : 0;
    return direction > 0 ? Math.ceil(current) + step : Math.floor(current) - step;
}
