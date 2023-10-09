export function createDefer(): Promise<void> & {
    resolve: () => void;
    reject: () => void;
} {
    let resolve = () => {};
    let reject = () => {};
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    promise.resolve = resolve;
    promise.reject = reject;
    return promise;
}

export function isOddFilter(data: any, index: number): boolean {
    return !(index % 2);
}

export function reverseArrayBuffer(data: ArrayBuffer) {
    return data;
}

export function isByteValue(value: any, matchDataValue: Uint8Array): boolean {
    if (!(value instanceof ArrayBuffer && matchDataValue instanceof Uint8Array)) {
        return false;
    }

    const valueView = new Uint8Array(value);
    if (valueView.length !== matchDataValue.length) {
        return false;
    }

    let i = 0;
    while (i < matchDataValue.length) {
        i++;
        if (valueView[i] !== matchDataValue[i]) {
            return false;
        }
    }
    return true;
}

export function inMultiByteValue(value: any, multiByteValue: Uint8Array[]): boolean {
    return multiByteValue.some((data) => {
        return isByteValue(value, data);
    });
}

export function inMultiMatchDataValue(value: any, multiMatchDataValue: (string | number | Uint8Array)[]): boolean {
    return multiMatchDataValue.some((data) => {
        if (data === value) {
            return true;
        }
        if (data instanceof Uint8Array) {
            return isByteValue(value, data);
        }
        return false;
    });
}

export function isMultiByteValueWithOffset(
    data: ArrayBuffer,
    offset: number,
    multiMatchDataValue: Uint8Array[],
    direction: 1 | -1 = 1,
): number | false {
    let i = 0;
    while (true) {
        const currentOffset = offset + i;
        if (currentOffset >= data.byteLength || currentOffset < 0) {
            break;
        }
        const check = multiMatchDataValue.some((matchDataValue) => {
            const length = matchDataValue.length;
            if (currentOffset + length >= data.byteLength) {
                return false;
            }
            return isByteValue(data.slice(currentOffset, currentOffset + length), matchDataValue);
        });
        if (check) {
            return currentOffset;
        }
        i = i + direction;
    }
    return false;
}

export function getNumberInRange(value: number, min: number, max: number) {
    return Math.max(Math.min(max, value), min);
}
