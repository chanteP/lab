import exifr from 'exifr';

export async function readMetadata(file: File): Promise<Record<string, unknown>> {
    try {
        return await exifr.parse(file, { tiff: true, ifd0: true, ifd1: false, exif: true, gps: true, interop: true, makerNote: false, userComment: true }) ?? {};
    } catch {
        return {};
    }
}

export function jpegApp1Segments(bytes: Uint8Array): Uint8Array[] {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];
    const segments: Uint8Array[] = [];
    let offset = 2;
    while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];
        if (marker === 0xda || marker === 0xd9) break;
        const length = bytes[offset + 2] << 8 | bytes[offset + 3];
        if (length < 2 || offset + length + 2 > bytes.length) break;
        const segment = bytes.slice(offset, offset + length + 2);
        if (marker === 0xe1 && segment[4] === 0x45 && segment[5] === 0x78 && segment[6] === 0x69 && segment[7] === 0x66) segments.push(segment);
        offset += length + 2;
    }
    return segments;
}

export function preserveJpegExif(source: Uint8Array, target: Uint8Array): Uint8Array {
    const exif = jpegApp1Segments(source);
    if (!exif.length || target[0] !== 0xff || target[1] !== 0xd8) return target;
    const output = new Uint8Array(target.length + exif.reduce((n, s) => n + s.length, 0));
    output.set(target.subarray(0, 2)); let offset = 2;
    for (const segment of exif) { output.set(segment, offset); offset += segment.length; }
    output.set(target.subarray(2), offset);
    return output;
}

export function metadataEntries(metadata: Record<string, unknown>): [string, string][] {
    return Object.entries(metadata).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value instanceof Date)
        .map(([key, value]) => [key, value instanceof Date ? value.toLocaleString() : String(value)]);
}
