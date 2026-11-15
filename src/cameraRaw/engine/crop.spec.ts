import test from 'node:test';
import assert from 'node:assert/strict';
import { centeredCrop, cropDimensions, dragCrop, hasCrop } from './crop.ts';

test('aspect presets create centered crops with real pixel dimensions', () => {
    const square = centeredCrop(2000, 1000, 1);
    assert.deepEqual(square, { x: .25, y: 0, width: .5, height: 1, ratio: 1 });
    assert.deepEqual(cropDimensions(2000, 1000, square), { width: 1000, height: 1000 });
    assert.equal(hasCrop(square), true); assert.equal(hasCrop(undefined), false);
});

test('moving a crop cannot cross image edges', () => {
    const start = centeredCrop(2000, 1000, 1);
    assert.deepEqual(dragCrop(start, 'move', { x: 2, y: -2 }, { x: .5, y: .5 }, 2000, 1000), { x: .5, y: 0, width: .5, height: 1, ratio: 1 });
});

test('corner and edge dragging preserve the selected aspect ratio', () => {
    const start = centeredCrop(2000, 1000, 1);
    const corner = dragCrop(start, 'se', { x: .9, y: .7 }, { x: .75, y: 1 }, 2000, 1000);
    assert.ok(Math.abs(corner.width * 2 - corner.height) < 1e-8);
    const edge = dragCrop(start, 'e', { x: .7, y: .2 }, { x: .75, y: .5 }, 2000, 1000);
    assert.ok(Math.abs(edge.width * 2 - edge.height) < 1e-8);
    assert.ok(edge.x >= 0 && edge.x + edge.width <= 1 && edge.y >= 0 && edge.y + edge.height <= 1);
});

test('shift-dragging a corner allows a free aspect ratio', () => {
    const start = centeredCrop(2000, 1000, 1);
    const crop = dragCrop(start, 'se', { x: .9, y: .7 }, { x: .75, y: 1 }, 2000, 1000, true);
    assert.equal(crop.ratio, undefined); assert.equal(crop.width, .65); assert.equal(crop.height, .7);
});
