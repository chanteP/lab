import test from 'node:test';
import assert from 'node:assert/strict';
import exifr from 'exifr';
import { initWLibraw } from '@wasmedia/wlibraw';
import { encodeDng } from './dng.ts';
import { readFileSync } from 'node:fs';
import { parseDcp } from '../engine/dcp/parser.ts';

test('writes a readable 16-bit RGB DNG with EXIF and XMP', async () => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    pixels.set([255, 0, 0, 255, 0, 128, 255, 255]);
    const image = { data: pixels, width: 64, height: 64 } as ImageData;
    const data = encodeDng(image, { name: 'sample.arw', metadata: { Make: 'SONY', Model: 'ILCE-7M4', ISO: 400, ExposureTime: .008, FNumber: 2.8, latitude: 31.25, longitude: 121.5 } }, '<xmp>test</xmp>');
    assert.equal(data[0], 0x49); assert.equal(data[2], 42);
    const metadata = await exifr.parse(data, { tiff: true, exif: true, gps: true });
    assert.equal(metadata.Make, 'SONY'); assert.equal(metadata.ISO, 400); assert.equal(metadata.SamplesPerPixel, 3);
    assert.deepEqual(Array.from(metadata.BitsPerSample), [16, 16, 16]);
    assert.ok(Math.abs(metadata.latitude - 31.25) < 1e-5); assert.ok(Math.abs(metadata.longitude - 121.5) < 1e-5);
    const libraw = await initWLibraw(), file = libraw.open(data);
    const decoded = file.decode({ useCameraWb: false, noAutoBright: true, brightness: 1, gamma: [2.4, 12.92] }), rgba = decoded.toImageData();
    assert.equal(rgba.width, 64); assert.equal(rgba.height, 64);
    assert.ok(rgba.data.some((value) => value > 0));
    assert.ok(rgba.data[0] > 240 && rgba.data[1] < 20 && rgba.data[2] < 20);
    decoded.free(); file.close();
});

test('embeds the selected DCP as an ExtraCameraProfiles IFD', async () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4); pixels.fill(128);
    const profile = parseDcp(readFileSync('src/cameraRaw/profiles/Sony ILCE-7CM2 Camera FL2.dcp'));
    const data = encodeDng({ data: pixels, width: 8, height: 8 } as ImageData, { name: 'sample.arw', metadata: { Make: 'SONY', Model: 'Sony ILCE-7CM2' } }, '<xmp>profile</xmp>', profile);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength), count = view.getUint16(8, true);
    let profileOffset = 0;
    for (let i = 0; i < count; i++) {
        const at = 10 + i * 12;
        if (view.getUint16(at, true) === 50933) profileOffset = view.getUint32(at + 8, true);
    }
    assert.ok(profileOffset > 0);
    const profileCount = view.getUint16(profileOffset, true);
    let name = '';
    for (let i = 0; i < profileCount; i++) {
        const at = profileOffset + 2 + i * 12;
        if (view.getUint16(at, true) === 50936) {
            const length = view.getUint32(at + 4, true), offset = view.getUint32(at + 8, true);
            name = new TextDecoder().decode(data.slice(offset, offset + length)).replace(/\0.*$/s, '');
        }
    }
    assert.equal(name, 'Camera FL2');
    const metadata = await exifr.parse(data, { tiff: true });
    assert.equal(metadata.Model, 'Sony ILCE-7CM2');
});
