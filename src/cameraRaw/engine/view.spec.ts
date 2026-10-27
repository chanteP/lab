import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, zoomAtPoint } from './view.ts';

test('zoom is bounded for wheel and trackpad input', () => {
    assert.equal(clampZoom(100), 8); assert.equal(clampZoom(0), .1); assert.equal(clampZoom(1.25), 1.25);
});

test('pointer-centered zoom keeps the selected image position stationary', () => {
    const pointer = { x: 120, y: -80 }, pan = { x: 20, y: 10 }, zoom = 1.5, next = zoomAtPoint(pointer, pan, 1, zoom);
    const before = { x: pan.x + (pointer.x - pan.x), y: pan.y + (pointer.y - pan.y) };
    const after = { x: next.x + (pointer.x - next.x), y: next.y + (pointer.y - next.y) };
    assert.deepEqual(after, before);
});
