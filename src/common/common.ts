export function saveCall<T extends (...args: any[]) => any>(fn?: T, ...args: Parameters<T>): ReturnType<T> | undefined {
    try {
        return fn?.(...args);
    } catch (e) {
        console.error(e);
    }
}

export function saveParseJSON<T>(json?: string, defaultValue?: T): T | undefined {
    if (!json) {
        return defaultValue;
    }
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error(e);
    }
    if (defaultValue !== undefined) {
        return defaultValue;
    }
}

export function getValueWithDefault<T>(value: T | undefined, defaultValue: T): T {
    return value ?? defaultValue;
}
