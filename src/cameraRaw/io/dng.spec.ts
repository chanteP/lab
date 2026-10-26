import test from 'node:test';
import assert from 'node:assert/strict';
import exifr from 'exifr';
import { initWLibraw } from '@wasmedia/wlibraw';
import { encodeDng } from './dng.ts';

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
