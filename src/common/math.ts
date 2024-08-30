export function inRange(value?: number, min?: number, max?: number) {
    if (value === undefined) {
        return min;
    }
    return Math.min(Math.max(min ?? -Infinity, value), max ?? Infinity);
}

export function fixNumber(num: number, fix = 2): number {
    const fixN = Math.pow(10, fix);
    return Math.round(num * fixN) / fixN;
}
