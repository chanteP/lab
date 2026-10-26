import test from 'node:test';
import assert from 'node:assert/strict';
import { jpegApp1Segments, preserveJpegExif } from './metadata.ts';

const jpeg = (segments: number[][]) => Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 1, 2]);
const exif = [0xff, 0xe1, 0, 10, 0x45, 0x78, 0x69, 0x66, 0, 0, 9, 8];

test('extracts and losslessly preserves original JPEG EXIF APP1', () => {
    const source = jpeg([exif]);
    const target = jpeg([[0xff, 0xe0, 0, 2]]);
    assert.equal(jpegApp1Segments(source).length, 1);
    const result = preserveJpegExif(source, target);
    assert.deepEqual(Array.from(result.subarray(2, 14)), exif);
    assert.deepEqual(Array.from(result.subarray(-3)), [0xff, 0xda, 1, 2].slice(-3));
});

test('returns target unchanged when source has no EXIF', () => {
    const target = jpeg([]);
    assert.deepEqual(preserveJpegExif(jpeg([]), target), target);
});
