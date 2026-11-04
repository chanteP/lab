import assert from 'node:assert/strict';
import test from 'node:test';
import { gridStepForUnitsPerPixel, scaleBarForGrid } from './viewport/gridScale';

test('grid scales by powers of ten when zooming out', () => {
    assert.equal(gridStepForUnitsPerPixel(0.25), 10);
    assert.equal(gridStepForUnitsPerPixel(0.51), 100);
    assert.equal(gridStepForUnitsPerPixel(5.1), 1000);
    assert.equal(gridStepForUnitsPerPixel(0.05), 1);
});

test('scale bar uses integer grid segments near 150px', () => {
    const scale = scaleBarForGrid(0.25, 10);
    assert.equal(scale.segments, 4);
    assert.equal(scale.value, 40);
    assert.equal(scale.width, 160);
});
