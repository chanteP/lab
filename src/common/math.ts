export function inRange(value?: number, min?: number, max?: number) {
    if (value === undefined) {
        return min;
    }
    return Math.min(Math.max(min ?? -Infinity, value), max ?? Infinity);
}
