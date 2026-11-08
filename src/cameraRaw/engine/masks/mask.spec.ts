import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneAdjustments, createDefaultAdjustments } from '../adjustments.ts';
import { combineMaskAdjustments, createShape } from './mask.ts';

test('neutral local adjustments and identity curves are a no-op', () => {
    const base = createDefaultAdjustments(); base.exposure = 1.2; base.mixer.blue.hue = 20;
    const result = combineMaskAdjustments(base, createDefaultAdjustments());
    assert.deepEqual(result, base);
});

test('local exposure is additive and curves compose without changing global values', () => {
    const base = createDefaultAdjustments(), local = createDefaultAdjustments(), original = cloneAdjustments(base);
    base.curves.rgb = [{ x: 0, y: 0 }, { x: 1, y: .8 }];
    local.curves.rgb = [{ x: 0, y: .1 }, { x: 1, y: 1 }];
    local.exposure = -.5;
    const result = combineMaskAdjustments(base, local);
    assert.equal(result.exposure, -.5);
    assert.ok(Math.abs(result.curves.rgb[16].y - .82) < 1e-8);
    assert.equal(result.curves.rgb[0].y, .1);
    assert.equal(local.curves.rgb[0].y, .1);
    assert.equal(original.curves.rgb[0].y, 0);
});

test('shape creation supports add and subtract components', () => {
    const shape = createShape('radial', .4, .5, 'subtract');
    assert.equal(shape.mode, 'subtract');
    assert.equal(shape.type, 'radial');
    assert.equal(shape.center.x, .4);
});
