import * as piexif from 'piexifjs';
import { RawRenderer } from '../engine/renderer';
import type { ImageAsset } from '../types';
import { serializePreset } from './preset';
import { preserveJpegExif } from './metadata';
import { encodeDng } from './dng';
import type { DcpProfile } from '../engine/dcp/types';
import { setLoading } from './loading';

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

export function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function exifFor(asset: ImageAsset) {
    const m = asset.metadata, zeroth: Record<number, unknown> = {}, exif: Record<number, unknown> = {}, gps: Record<number, unknown> = {};
    const put = (target: Record<number, unknown>, tag: number, value: unknown) => { if (value !== undefined && value !== null && value !== '') target[tag] = value; };
    put(zeroth, piexif.ImageIFD.Make, m.Make); put(zeroth, piexif.ImageIFD.Model, m.Model);
    put(zeroth, piexif.ImageIFD.Software, 'Camera Raw Lab'); put(zeroth, piexif.ImageIFD.Orientation, 1);
    put(exif, piexif.ExifIFD.DateTimeOriginal, m.DateTimeOriginal instanceof Date ? m.DateTimeOriginal.toISOString().replace(/^(\d{4})-(\d{2})-(\d{2})T/, '$1:$2:$3 ').slice(0, 19) : m.DateTimeOriginal);
    put(exif, piexif.ExifIFD.ExposureTime, m.ExposureTime ? [Math.round(Number(m.ExposureTime) * 1000000), 1000000] : undefined);
    put(exif, piexif.ExifIFD.FNumber, m.FNumber ? [Math.round(Number(m.FNumber) * 100), 100] : undefined);
    put(exif, piexif.ExifIFD.ISOSpeedRatings, m.ISO);
    put(exif, piexif.ExifIFD.FocalLength, m.FocalLength ? [Math.round(Number(m.FocalLength) * 100), 100] : undefined);
    put(exif, piexif.ExifIFD.LensModel, m.LensModel);
    put(gps, piexif.GPSIFD.GPSLatitudeRef, Number(m.latitude) >= 0 ? 'N' : 'S');
    put(gps, piexif.GPSIFD.GPSLatitude, m.latitude !== undefined ? piexif.GPSHelper.degToDmsRational(Math.abs(Number(m.latitude))) : undefined);
    put(gps, piexif.GPSIFD.GPSLongitudeRef, Number(m.longitude) >= 0 ? 'E' : 'W');
    put(gps, piexif.GPSIFD.GPSLongitude, m.longitude !== undefined ? piexif.GPSHelper.degToDmsRational(Math.abs(Number(m.longitude))) : undefined);
    return { '0th': zeroth, Exif: exif, GPS: gps, '1st': {}, thumbnail: undefined };
}

async function withExif(asset: ImageAsset, jpeg: Blob): Promise<Blob> {
    const target = new Uint8Array(await jpeg.arrayBuffer());
    if (asset.kind === 'jpeg') return new Blob([preserveJpegExif(new Uint8Array(await asset.file.arrayBuffer()), target) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
    const binary = Array.from(target, (v) => String.fromCharCode(v)).join('');
    const inserted = piexif.insert(piexif.dump(exifFor(asset) as never), binary) as string;
    return new Blob([Uint8Array.from(inserted, (v) => v.charCodeAt(0))], { type: 'image/jpeg' });
}

export async function renderExport(asset: ImageAsset, format: 'jpeg' | 'dng', quality = .94, profile?: DcpProfile): Promise<Blob> {
    if (!asset.bitmap) throw new Error('图片尚未完成解码');
    const renderer = new RawRenderer();
    try {
        setLoading({ text: '正在渲染全尺寸图像', progress: 20 });
        renderer.setSource(asset.bitmap); renderer.render(asset.adjustments, { profile, masks: asset.masks });
        if (format === 'jpeg') {
            setLoading({ text: '正在编码 JPEG', progress: 72 });
            return withExif(asset, await renderer.blob('image/jpeg', quality));
        }
        setLoading({ text: '正在写入 16-bit DNG', progress: 68 });
        const pixels = renderer.readPixels();
        const dng = encodeDng(new ImageData(new Uint8ClampedArray(pixels), renderer.canvas.width, renderer.canvas.height), asset, serializePreset(asset.adjustments, baseName(asset.name)), profile);
        return new Blob([dng as Uint8Array<ArrayBuffer>], { type: 'image/x-adobe-dng' });
    } finally { renderer.dispose(); }
}

export async function saveAsset(asset: ImageAsset, format: 'jpeg' | 'dng', profile?: DcpProfile) {
    downloadBlob(await renderExport(asset, format, .94, profile), `${baseName(asset.name)}-edited.${format === 'jpeg' ? 'jpg' : 'dng'}`);
}
