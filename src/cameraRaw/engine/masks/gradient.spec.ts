import test from 'node:test';
import assert from 'node:assert/strict';
import type { LinearMaskShape, RadialMaskShape } from './types.ts';
import { gradientCoverage, smoothstep } from './gradient.ts';

const linear: LinearMaskShape = { id: 'linear', type: 'linear', mode: 'add', feather: 50, start: { x: 0, y: .5 }, end: { x: 1, y: .5 } };
const radial: RadialMaskShape = { id: 'radial', type: 'radial', mode: 'add', feather: 50, center: { x: .5, y: .5 }, radiusX: .4, radiusY: .2 };

test('smoothstep has zero slope at both feather boundaries', () => {
    assert.equal(smoothstep(.25, .75, .25), 0);
    assert.equal(smoothstep(.25, .75, .75), 1);
    assert.equal(smoothstep(.25, .75, .5), .5);
    assert.equal(smoothstep(1, 1, 1), 1);
});

test('linear mask is symmetric and monotonic without a midpoint jump', () => {
    assert.equal(gradientCoverage(linear, 25, 50, 100, 100), 1);
    assert.equal(gradientCoverage(linear, 50, 50, 100, 100), .5);
    assert.equal(gradientCoverage(linear, 75, 50, 100, 100), 0);
    let previous = 1;
    for (let x = 0; x <= 100; x++) {
        const coverage = gradientCoverage(linear, x, 50, 100, 100);
        assert.ok(coverage <= previous && coverage >= 0 && coverage <= 1);
        assert.ok(previous - coverage < .06);
        previous = coverage;
    }
    assert.ok(Math.abs(gradientCoverage(linear, 40, 50, 100, 100) - (1 - gradientCoverage(linear, 60, 50, 100, 100))) < 1e-8);
});

test('radial mask uses the same smooth elliptical falloff', () => {
    assert.equal(gradientCoverage(radial, 100, 50, 200, 100), 1);
    assert.equal(gradientCoverage(radial, 140, 50, 200, 100), 1);
    assert.equal(gradientCoverage(radial, 160, 50, 200, 100), .5);
    assert.equal(gradientCoverage(radial, 180, 50, 200, 100), 0);
    assert.equal(gradientCoverage(radial, 100, 70, 200, 100), 0);
});
