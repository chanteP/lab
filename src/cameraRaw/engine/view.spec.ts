import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSplit, clampZoom, zoomAtPoint } from './view.ts';

test('zoom is bounded for wheel and trackpad input', () => {
    assert.equal(clampZoom(100), 8); assert.equal(clampZoom(0), .1); assert.equal(clampZoom(1.25), 1.25);
});

test('pointer-centered zoom keeps the selected image position stationary', () => {
    const pointer = { x: 120, y: -80 }, pan = { x: 20, y: 10 }, zoom = 1.5, next = zoomAtPoint(pointer, pan, 1, zoom);
    const before = { x: pan.x + (pointer.x - pan.x), y: pan.y + (pointer.y - pan.y) };
    const after = { x: next.x + (pointer.x - next.x), y: next.y + (pointer.y - next.y) };
    assert.deepEqual(after, before);
});

test('split comparison stays reachable at both edges', () => {
    assert.equal(clampSplit(-2), 0); assert.equal(clampSplit(2), 1); assert.equal(clampSplit(.4), .4);
});

test('RGB curve view exposes read-only color reference channels only in composite mode', async () => {
    const { overlayCurveChannels } = await import('./curve.ts');
    assert.deepEqual(overlayCurveChannels('rgb'), ['r', 'g', 'b']);
    assert.deepEqual(overlayCurveChannels('r'), []);
    assert.deepEqual(overlayCurveChannels('g'), []);
    assert.deepEqual(overlayCurveChannels('b'), []);
});
