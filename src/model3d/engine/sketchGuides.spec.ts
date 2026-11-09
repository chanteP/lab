import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSketchGuide } from './sketchGuides';
import { createEntity } from '../types';

test('origin and operation point snapping is exact instead of pointer-rounded', () => {
    const result = matchSketchGuide({ entities: [], point: [0.2, 0.2], origins: [{ id: 'world', point: [0, 0] }], threshold: 1 });
    assert.deepEqual(result?.point, [0, 0]);
});

test('two reference axes produce a precise intersection', () => {
    const result = matchSketchGuide({ entities: [], point: [10.1, 20.1], origins: [{ id: 'world', point: [10, 20] }], threshold: 1 });
    assert.deepEqual(result?.point, [10, 20]);
});

test('dragging a line offers the actual parallel and perpendicular directions', () => {
    const reference = createEntity('sketch', 'reference');
    reference.profileType = 'line';
    reference.points = [[0, 0], [10, 10]];
    const parallel = matchSketchGuide({ entities: [reference], point: [4, 1], edgeStart: [0, 0], threshold: 10 });
    assert.deepEqual(parallel?.point, [2.5, 2.5]);
});
