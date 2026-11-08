import type { DcpProfile, DcpTable } from './types';

const XYZ_D50_TO_SRGB = [
    3.1338561, -1.6168667, -0.4906146,
    -0.9787684, 1.9161415, 0.0334540,
    0.0719453, -0.2289914, 1.4052427,
];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function multiply(a: number[], b: number[]): number[] {
    return Array.from({ length: 9 }, (_, index) => {
        const row = Math.floor(index / 3), column = index % 3;
        return a[row * 3] * b[column] + a[row * 3 + 1] * b[column + 3] + a[row * 3 + 2] * b[column + 6];
    });
}

export function dcpMatrix(profile?: DcpProfile): number[] {
    const first = profile?.forwardMatrix1, second = profile?.forwardMatrix2 ?? first;
    if (!first || !second || first.length !== 9 || second.length !== 9) return IDENTITY;
    const forward = first.map((value, index) => (value + second[index]) / 2);
    const matrix = multiply(XYZ_D50_TO_SRGB, forward);
    // A profile may use a different camera white. Preserve neutral in the current
    // display-referred approximation while retaining its relative color transform.
    for (let row = 0; row < 3; row++) {
        const sum = matrix[row * 3] + matrix[row * 3 + 1] + matrix[row * 3 + 2];
        if (Math.abs(sum) > 1e-6) for (let column = 0; column < 3; column++) matrix[row * 3 + column] /= sum;
    }
    // GLSL uniformMatrix3fv expects column-major values.
    return [matrix[0], matrix[3], matrix[6], matrix[1], matrix[4], matrix[7], matrix[2], matrix[5], matrix[8]];
}

export function dcpToneLut(profile?: DcpProfile): Uint8Array {
    const result = new Uint8Array(256 * 4), curve = profile?.toneCurve;
    for (let i = 0; i < 256; i++) {
        const x = i / 255;
        let y = x;
        if (curve && curve.length >= 4) {
            let index = 0;
            while (index + 3 < curve.length && curve[index + 2] < x) index += 2;
            const x0 = curve[index], y0 = curve[index + 1], x1 = curve[index + 2], y1 = curve[index + 3];
            y = x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        }
        const value = Math.round(Math.max(0, Math.min(1, y)) * 255);
        result.fill(value, i * 4, i * 4 + 3); result[i * 4 + 3] = 255;
    }
    return result;
}

export function dcpTableBytes(table?: DcpTable): { bytes: Uint8Array; dimensions: [number, number, number] } {
    const dimensions = table?.dimensions ?? [1, 1, 1], count = dimensions[0] * dimensions[1] * dimensions[2];
    const bytes = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
        const hue = table?.data[i * 3] ?? 0, saturation = table?.data[i * 3 + 1] ?? 1, value = table?.data[i * 3 + 2] ?? 1;
        bytes[i * 4] = Math.round(Math.max(0, Math.min(1, hue / 360 + .5)) * 255);
        bytes[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, saturation / 4)) * 255);
        bytes[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, value / 4)) * 255);
        bytes[i * 4 + 3] = 255;
    }
    return { bytes, dimensions };
}
