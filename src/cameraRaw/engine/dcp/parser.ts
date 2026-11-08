import type { DcpEntry, DcpProfile, DcpTable } from './types';

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };
const TAG = {
    cameraModel: 50708, colorMatrix1: 50721, colorMatrix2: 50722,
    illuminant1: 50778, illuminant2: 50779, profileName: 50936,
    hueDims: 50937, hueData1: 50938, hueData2: 50939, toneCurve: 50940,
    forwardMatrix1: 50964, forwardMatrix2: 50965, lookDims: 50981, lookData: 50982,
    hueEncoding: 51107, lookEncoding: 51108, baselineExposure: 51109,
};

function numberValues(bytes: Uint8Array, view: DataView, entry: DcpEntry, little: boolean, offset: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < entry.count; i++) {
        const at = offset + i * (TYPE_SIZES[entry.type] ?? 1);
        if (entry.type === 1 || entry.type === 7) result.push(view.getUint8(at));
        else if (entry.type === 3) result.push(view.getUint16(at, little));
        else if (entry.type === 4 || entry.type === 13) result.push(view.getUint32(at, little));
        else if (entry.type === 5) result.push(view.getUint32(at, little) / view.getUint32(at + 4, little));
        else if (entry.type === 6) result.push(view.getInt8(at));
        else if (entry.type === 8) result.push(view.getInt16(at, little));
        else if (entry.type === 9) result.push(view.getInt32(at, little));
        else if (entry.type === 10) result.push(view.getInt32(at, little) / view.getInt32(at + 4, little));
        else if (entry.type === 11) result.push(view.getFloat32(at, little));
        else if (entry.type === 12) result.push(view.getFloat64(at, little));
    }
    return result;
}

function table(entries: DcpEntry[], dimsTag: number, dataTag: number, encodingTag: number): DcpTable | undefined {
    const dimsEntry = entries.find((entry) => entry.tag === dimsTag), dataEntry = entries.find((entry) => entry.tag === dataTag);
    if (!dimsEntry || !dataEntry || (!Array.isArray(dataEntry.value) && !(dataEntry.value instanceof Uint8Array))) return undefined;
    const dimensions = (dimsEntry.value as number[]).slice(0, 3) as [number, number, number];
    if (dimensions.length !== 3 || dimensions.some((value) => !Number.isInteger(value) || value < 1 || value > 512)) throw new Error('DCP 色彩表维度无效');
    const expected = dimensions[0] * dimensions[1] * dimensions[2] * 3;
    if (expected !== dataEntry.count || (dataEntry.value instanceof Uint8Array && expected * 4 !== dataEntry.value.byteLength)) throw new Error('DCP 色彩表数据不完整');
    const data = new Float32Array(expected), raw = dataEntry.value;
    const view = raw instanceof Uint8Array ? new DataView(raw.buffer, raw.byteOffset, raw.byteLength) : undefined;
    for (let i = 0; i < expected; i++) {
        data[i] = view ? view.getFloat32(i * 4, true) : Number(raw[i]);
        if (!Number.isFinite(data[i])) throw new Error('DCP 色彩表包含无效数值');
    }
    const encoding = entries.find((entry) => entry.tag === encodingTag);
    return { dimensions, data, srgbEncoded: Number((encoding?.value as number[] | undefined)?.[0] ?? 0) === 1 };
}

export function normalizeCameraModel(value: unknown): string {
    return String(value ?? '').toUpperCase().replace(/^SONY\s+/, '').replace(/[^A-Z0-9]/g, '');
}

export function cameraModelMatches(camera: unknown, profile: unknown): boolean {
    const a = normalizeCameraModel(camera), b = normalizeCameraModel(profile);
    if (!a || !b) return false;
    // Sony's revised bodies (for example ILCE-7RM3A) retain the base sensor profile.
    return a === b || a.replace(/A$/, '') === b.replace(/A$/, '');
}

export function parseDcp(input: ArrayBuffer | Uint8Array, fileName = 'profile.dcp'): DcpProfile {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength < 16 || bytes.byteLength > 64 * 1024 * 1024) throw new Error('DCP 文件大小无效');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const little = String.fromCharCode(bytes[0], bytes[1]) === 'II';
    if (!little && String.fromCharCode(bytes[0], bytes[1]) !== 'MM') throw new Error('不是有效的 DCP/TIFF 文件');
    const magic = view.getUint16(2, little);
    if (magic !== 42 && magic !== 17234) throw new Error('不是有效的 DCP 文件');
    const ifdOffset = view.getUint32(4, little);
    if (ifdOffset + 2 > bytes.byteLength) throw new Error('DCP 目录越界');
    const count = view.getUint16(ifdOffset, little);
    if (count > 512 || ifdOffset + 2 + count * 12 + 4 > bytes.byteLength) throw new Error('DCP 目录无效');
    const entries: DcpEntry[] = [];
    for (let i = 0; i < count; i++) {
        const at = ifdOffset + 2 + i * 12, tag = view.getUint16(at, little), type = view.getUint16(at + 2, little), itemCount = view.getUint32(at + 4, little);
        const size = TYPE_SIZES[type];
        if (!size || itemCount > 100_000_000 || itemCount * size > bytes.byteLength) throw new Error(`DCP 标签 ${tag} 无效`);
        const byteLength = itemCount * size, inline = byteLength <= 4, offset = inline ? at + 8 : view.getUint32(at + 8, little);
        if (offset < 0 || offset + byteLength > bytes.byteLength) throw new Error(`DCP 标签 ${tag} 数据越界`);
        const raw = bytes.slice(offset, offset + byteLength);
        let value: DcpEntry['value'];
        if (type === 2) value = new TextDecoder().decode(raw).replace(/\0.*$/s, '');
        else if (type === 1 || type === 7) value = raw;
        else value = numberValues(bytes, view, { tag, type, count: itemCount, value: [] }, little, offset);
        entries.push({ tag, type, count: itemCount, value });
    }
    const get = (tag: number) => entries.find((entry) => entry.tag === tag);
    const numbers = (tag: number) => get(tag)?.value as number[] | undefined;
    const text = (tag: number) => String(get(tag)?.value ?? '');
    const name = text(TAG.profileName) || fileName.replace(/\.dcp$/i, ''), cameraModel = text(TAG.cameraModel);
    if (!entries.some((entry) => entry.tag === TAG.colorMatrix1)) throw new Error('DCP 缺少 ColorMatrix1');
    const profile: DcpProfile = {
        id: `${normalizeCameraModel(cameraModel)}:${name}`, name, cameraModel, fileName, bytes, entries,
        colorMatrix1: numbers(TAG.colorMatrix1), colorMatrix2: numbers(TAG.colorMatrix2),
        forwardMatrix1: numbers(TAG.forwardMatrix1), forwardMatrix2: numbers(TAG.forwardMatrix2),
        illuminant1: numbers(TAG.illuminant1)?.[0], illuminant2: numbers(TAG.illuminant2)?.[0],
        toneCurve: numbers(TAG.toneCurve) ? Float32Array.from(numbers(TAG.toneCurve)!) : undefined,
        hueSatMap: table(entries, TAG.hueDims, TAG.hueData1, TAG.hueEncoding) ?? table(entries, TAG.hueDims, TAG.hueData2, TAG.hueEncoding),
        lookTable: table(entries, TAG.lookDims, TAG.lookData, TAG.lookEncoding),
        baselineExposure: numbers(TAG.baselineExposure)?.[0] ?? 0,
    };
    return profile;
}
