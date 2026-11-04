import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensionAssetCorners, resizeAssetCorners, resizeSketchEntity } from './sketchAssets';
import type { ModelEntity, Point2 } from '../types';

const corners: Point2[] = [[0, 0], [40, 0], [40, 20], [0, 20]];

test('locked asset corner drag preserves aspect and the opposite corner', () => {
    const next = resizeAssetCorners(corners, 2, [80, 60], true);
    assert.deepEqual(next[0], [0, 0]);
    assert.ok(Math.abs((next[2][0] / next[2][1]) - 2) < 1e-9);
});

test('unlocked asset dimension only changes the requested axis', () => {
    const next = dimensionAssetCorners(corners, 'width', 80, false);
    assert.deepEqual(next, [[-20, 0], [60, 0], [60, 20], [-20, 20]]);
});

test('SVG group resize transforms semantic points and cubic controls together', () => {
    const source = { id: 'path', kind: 'sketch', points: [[0, 0], [10, 10]], curves: { 0: { c1: [2, 3], c2: [4, 5] } } } as unknown as ModelEntity;
    const next = resizeSketchEntity(source, corners, dimensionAssetCorners(corners, 'width', 80, false), );
    assert.deepEqual(next.points, [[-20, 0], [0, 10]]);
    assert.deepEqual(next.curves?.[0], { c1: [-16, 3], c2: [-12, 5] });
    assert.deepEqual(source.points, [[0, 0], [10, 10]]);
});

test('every asset corner keeps its diagonal opposite fixed', () => {
    for (let index = 0; index < 4; index++) {
        const next = resizeAssetCorners(corners, index, [60, 50], false);
        assert.deepEqual(next[(index + 2) % 4], corners[(index + 2) % 4]);
        assert.deepEqual(next[index], [60, 50]);
    }
});

test('non-uniform SVG group scaling converts a circle to an ellipse', () => {
    const source = { id: 'circle', kind: 'sketch', profileType: 'circle', points: [[20, 10], [30, 10]] } as unknown as ModelEntity;
    const next = resizeSketchEntity(source, corners, dimensionAssetCorners(corners, 'width', 80, false));
    assert.equal(next.profileType, 'ellipse');
    assert.equal(next.points?.length, 3);
});
