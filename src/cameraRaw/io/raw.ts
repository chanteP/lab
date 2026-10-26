import { WLibRawWorker } from '@wasmedia/wlibraw';
import type { ImageAsset } from '../types';
import { createDefaultAdjustments } from '../engine/adjustments';
import { readMetadata } from './metadata';

export const RAW_EXTENSIONS = ['arw', 'dng', 'cr2', 'cr3', 'nef', 'nrw', 'raf', 'orf', 'rw2', 'pef', 'srw', 'srf', 'sr2', 'raw', 'rwl', '3fr', 'erf', 'kdc', 'mrw', 'x3f'];
export const ACCEPTED_EXTENSIONS = [...RAW_EXTENSIONS, 'jpg', 'jpeg', 'png'];
const extension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
export const isRawFile = (file: File) => RAW_EXTENSIONS.includes(extension(file.name));
export const isImageFile = (file: File) => ACCEPTED_EXTENSIONS.includes(extension(file.name)) || /^image\/(jpeg|png)$/.test(file.type);

let client: WLibRawWorker | undefined;
function rawClient() {
    return client ??= new WLibRawWorker(() => new Worker(new URL('./raw.worker.ts', import.meta.url), { type: 'module' }));
}

export async function readImageAsset(file: File): Promise<ImageAsset> {
    const metadata = await readMetadata(file), kind = isRawFile(file) ? 'raw' : file.type === 'image/png' || extension(file.name) === 'png' ? 'png' : 'jpeg';
    const base = {
        id: crypto.randomUUID(), file, name: file.name, kind, metadata, adjustments: createDefaultAdjustments(), loading: false,
    } as const;
    if (kind !== 'raw') {
        const bitmap = await createImageBitmap(file);
        return { ...base, bitmap, thumbnail: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height };
    }
    const bytes = await file.arrayBuffer(), raw = rawClient();
    const rawMetadata = await raw.metadata(bytes) as unknown as Record<string, unknown>;
    let thumbnail = '', width = Number(rawMetadata.width || rawMetadata.rawWidth), height = Number(rawMetadata.height || rawMetadata.rawHeight);
    try {
        const preview = await raw.thumbnail(bytes);
        thumbnail = URL.createObjectURL(new Blob([preview.data as Uint8Array<ArrayBuffer>], { type: preview.mime }));
        width = preview.width; height = preview.height;
    } catch {
        thumbnail = '';
    }
    return { ...base, thumbnail, width, height, rawMetadata, metadata: { ...metadata, ...rawMetadata } };
}

const pending = new Map<string, Promise<ImageBitmap>>();
export function ensureBitmap(asset: ImageAsset): Promise<ImageBitmap> {
    if (asset.bitmap) return Promise.resolve(asset.bitmap);
    const running = pending.get(asset.id); if (running) return running;
    const task = (async () => {
        const multipliers = asset.rawMetadata?.cameraMultipliers as number[] | undefined;
        const isDng = extension(asset.name) === 'dng';
        const result = await rawClient().decode(await asset.file.arrayBuffer(), {
            outputBps: 8, useCameraWb: Boolean(multipliers?.[0] && multipliers?.[2]), userQual: 3, highlightMode: 2,
            noAutoBright: isDng, brightness: isDng ? 1 : undefined, gamma: isDng ? [2.4, 12.92] : undefined,
        }, { format: 'rgba8' });
        const image = new ImageData(new Uint8ClampedArray(result.data), result.width, result.height);
        const bitmap = await createImageBitmap(image);
        asset.bitmap = bitmap; asset.width = bitmap.width; asset.height = bitmap.height;
        if (!asset.thumbnail) {
            const canvas = document.createElement('canvas'); canvas.width = Math.min(360, bitmap.width); canvas.height = Math.round(canvas.width / bitmap.width * bitmap.height);
            canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => { if (blob) asset.thumbnail = URL.createObjectURL(blob); }, 'image/jpeg', .82);
        }
        return bitmap;
    })().finally(() => pending.delete(asset.id));
    pending.set(asset.id, task); return task;
}

export function disposeRaw() { client?.terminate(); client = undefined; }
