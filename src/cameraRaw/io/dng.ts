import type { ImageAsset } from '../types';

type Entry = { tag: number; type: number; value: number | number[] | string | Uint8Array };
const sizes = [0, 1, 1, 2, 4, 8, 2, 4, 1, 2, 4, 8, 4, 8];
const ascii = (value: unknown): string => String(value ?? '');
const rational = (value: number) => {
    const denominator = value < 1 && value > 0 ? 1000000 : 100;
    return [Math.round(value * denominator), denominator];
};

function bytesFor(entry: Entry): Uint8Array {
    if (entry.value instanceof Uint8Array) return entry.value;
    const values = Array.isArray(entry.value) ? entry.value : [entry.value];
    if (entry.type === 2) return new TextEncoder().encode(`${entry.value}\0`);
    const count = values.length, data = new Uint8Array(count * sizes[entry.type]), view = new DataView(data.buffer);
    values.forEach((raw, i) => {
        const value = Number(raw);
        if (entry.type === 1 || entry.type === 7) view.setUint8(i, value);
        else if (entry.type === 3) view.setUint16(i * 2, value, true);
        else if (entry.type === 4) view.setUint32(i * 4, value, true);
        else if (entry.type === 5) view.setUint32(i * 4, value, true);
        else if (entry.type === 10) view.setInt32(i * 4, value, true);
    });
    return data;
}

const countFor = (entry: Entry) => entry.type === 2 ? ascii(entry.value).length + 1 : entry.value instanceof Uint8Array ? entry.value.length : Array.isArray(entry.value) ? entry.value.length / ((entry.type === 5 || entry.type === 10) ? 2 : 1) : 1;

function layout(entries: Entry[], offset: number) {
    const sorted = [...entries].sort((a, b) => a.tag - b.tag), dataOffset = offset + 2 + sorted.length * 12 + 4;
    let cursor = dataOffset;
    const blocks = sorted.map((entry) => {
        const data = bytesFor(entry), location = data.length <= 4 ? 0 : cursor;
        if (data.length > 4) cursor += data.length + (data.length % 2);
        return { entry, data, location };
    });
    return { sorted, blocks, dataOffset, size: cursor - offset };
}

function writeIfd(output: Uint8Array, offset: number, plan: ReturnType<typeof layout>, next = 0) {
    const view = new DataView(output.buffer);
    view.setUint16(offset, plan.sorted.length, true);
    plan.blocks.forEach(({ entry, data, location }, i) => {
        const at = offset + 2 + i * 12;
        view.setUint16(at, entry.tag, true); view.setUint16(at + 2, entry.type, true); view.setUint32(at + 4, countFor(entry), true);
        if (data.length <= 4) output.set(data, at + 8);
        else { view.setUint32(at + 8, location, true); output.set(data, location); }
    });
    view.setUint32(offset + 2 + plan.sorted.length * 12, next, true);
}

// A rendered, three-sample DNG is a valid non-destructive interchange container. The source
// mosaic stays untouched; adjustments are baked into 16-bit RGB and also recorded as XMP.
export function encodeDng(image: ImageData, source: Pick<ImageAsset, 'metadata' | 'name'>, xmp: string): Uint8Array {
    const { width, height } = image, metadata = source.metadata;
    const main: Entry[] = [
        { tag: 254, type: 4, value: 0 }, { tag: 256, type: 4, value: width }, { tag: 257, type: 4, value: height },
        { tag: 258, type: 3, value: [16, 16, 16] }, { tag: 259, type: 3, value: 1 }, { tag: 262, type: 3, value: 34892 },
        { tag: 271, type: 2, value: ascii(metadata.Make || 'Camera Raw Lab') },
        { tag: 272, type: 2, value: ascii(metadata.Model || source.name) },
        { tag: 273, type: 4, value: 0 }, { tag: 274, type: 3, value: 1 }, { tag: 277, type: 3, value: 3 },
        { tag: 278, type: 4, value: height }, { tag: 279, type: 4, value: width * height * 6 }, { tag: 284, type: 3, value: 1 },
        { tag: 305, type: 2, value: 'Camera Raw Lab' }, { tag: 306, type: 2, value: new Date().toISOString().replace(/^(\d{4})-(\d{2})-(\d{2})T/, '$1:$2:$3 ').slice(0, 19) },
        { tag: 700, type: 1, value: new TextEncoder().encode(xmp) },
        { tag: 50706, type: 1, value: Uint8Array.from([1, 4, 0, 0]) }, { tag: 50707, type: 1, value: Uint8Array.from([1, 1, 0, 0]) },
        { tag: 50708, type: 2, value: 'Camera Raw Lab Linear RGB' },
        { tag: 50721, type: 10, value: [32405, 10000, -15371, 10000, -4985, 10000, -9693, 10000, 18760, 10000, 416, 10000, 556, 10000, -2040, 10000, 10572, 10000] },
        { tag: 50778, type: 3, value: 21 },
    ];
    const exif: Entry[] = [{ tag: 36864, type: 7, value: new TextEncoder().encode('0231') }];
    if (metadata.DateTimeOriginal) exif.push({ tag: 36867, type: 2, value: ascii(metadata.DateTimeOriginal) });
    if (metadata.ExposureTime) exif.push({ tag: 33434, type: 5, value: rational(Number(metadata.ExposureTime)) });
    if (metadata.FNumber) exif.push({ tag: 33437, type: 5, value: rational(Number(metadata.FNumber)) });
    if (metadata.ISO) exif.push({ tag: 34855, type: 3, value: Number(metadata.ISO) });
    if (metadata.FocalLength) exif.push({ tag: 37386, type: 5, value: rational(Number(metadata.FocalLength)) });
    if (metadata.LensModel) exif.push({ tag: 42036, type: 2, value: ascii(metadata.LensModel) });
    main.push({ tag: 34665, type: 4, value: 0 });

    const latitude = Number(metadata.latitude), longitude = Number(metadata.longitude), hasGps = Number.isFinite(latitude) && Number.isFinite(longitude);
    const dms = (value: number) => {
        const absolute = Math.abs(value), degrees = Math.floor(absolute), minutes = Math.floor((absolute - degrees) * 60), seconds = (absolute - degrees - minutes / 60) * 3600;
        return [degrees, 1, minutes, 1, Math.round(seconds * 10000), 10000];
    };
    const gps: Entry[] = hasGps ? [
        { tag: 0, type: 1, value: Uint8Array.from([2, 3, 0, 0]) }, { tag: 1, type: 2, value: latitude >= 0 ? 'N' : 'S' },
        { tag: 2, type: 5, value: dms(latitude) }, { tag: 3, type: 2, value: longitude >= 0 ? 'E' : 'W' }, { tag: 4, type: 5, value: dms(longitude) },
    ] : [];
    if (hasGps) main.push({ tag: 34853, type: 4, value: 0 });

    let mainPlan = layout(main, 8), exifOffset = 8 + mainPlan.size, exifPlan = layout(exif, exifOffset);
    let gpsOffset = exifOffset + exifPlan.size, gpsPlan = layout(gps, gpsOffset);
    const pixelOffset = gpsOffset + gpsPlan.size;
    main.find((e) => e.tag === 273)!.value = pixelOffset;
    main.find((e) => e.tag === 34665)!.value = exifOffset;
    if (hasGps) main.find((e) => e.tag === 34853)!.value = gpsOffset;
    mainPlan = layout(main, 8); exifOffset = 8 + mainPlan.size; exifPlan = layout(exif, exifOffset);
    gpsOffset = exifOffset + exifPlan.size; gpsPlan = layout(gps, gpsOffset);
    const output = new Uint8Array(pixelOffset + width * height * 6), view = new DataView(output.buffer);
    output.set([0x49, 0x49, 0x2a, 0x00]); view.setUint32(4, 8, true);
    writeIfd(output, 8, mainPlan); writeIfd(output, exifOffset, exifPlan); if (hasGps) writeIfd(output, gpsOffset, gpsPlan);
    const linear16 = (value: number) => {
        const srgb = value / 255;
        return Math.round((srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4) * 65535);
    };
    for (let i = 0, j = pixelOffset; i < image.data.length; i += 4, j += 6) {
        view.setUint16(j, linear16(image.data[i]), true);
        view.setUint16(j + 2, linear16(image.data[i + 1]), true);
        view.setUint16(j + 4, linear16(image.data[i + 2]), true);
    }
    return output;
}
