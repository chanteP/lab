import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSketchGuide } from './sketchGuides';
import { createEntity } from '../types';
import { convertSemanticShapeToConstrainedPolygon } from './sketchShapes';

test('origin and operation point snapping is exact instead of pointer-rounded', () => {
    const result = matchSketchGuide({ entities: [], point: [0.2, 0.2], origins: [{ id: 'world', point: [0, 0] }], threshold: 1 });
    assert.deepEqual(result?.point, [0, 0]);
});

test('origin outranks ruler guides and operation points even when they are closer', () => {
    const entity = createEntity('sketch', 'point');
    entity.points = [[0.3, 0.3]];
    const result = matchSketchGuide({
        entities: [entity], point: [0.4, 0.4], threshold: 2,
        origins: [{ id: 'world', point: [0, 0] }], guides: [{ id: 'near', axis: 'u', offset: 0.4 }],
    });
    assert.deepEqual(result?.point, [0, 0]);
    assert.equal(result?.matches[0].reference.kind, 'origin');
});

test('origin axes outrank a nearer persistent guide', () => {
    const result = matchSketchGuide({
        entities: [], point: [0.4, 5], threshold: 1,
        origins: [{ id: 'world', point: [0, 0] }], guides: [{ id: 'near', axis: 'u', offset: 0.45 }],
    });
    assert.deepEqual(result?.point, [0, 5]);
    assert.equal(result?.matches[0].reference.kind, 'origin');
});

test('persistent guides outrank a nearer operation point', () => {
    const entity = createEntity('sketch', 'point');
    entity.points = [[10.35, 5]];
    const result = matchSketchGuide({
        entities: [entity], point: [10.4, 5], threshold: 1,
        guides: [{ id: 'guide', axis: 'u', offset: 10.45 }],
    });
    assert.deepEqual(result?.point, [10.45, 5]);
    assert.equal(result?.matches[0].reference.kind, 'ruler');
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

test('standard polygon centers are registered as magnetic reference points', () => {
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [20, 0], [20, 10], [0, 10]];
    convertSemanticShapeToConstrainedPolygon(rectangle);
    const result = matchSketchGuide({ entities: [rectangle], point: [10.2, 5.2], threshold: 0.5 });
    assert.deepEqual(result?.point, [10, 5]);
    assert.equal(result?.matches[0].reference.kind, 'point');
    assert.equal(result?.matches[0].reference.kind === 'point' && result.matches[0].reference.index, -1);
});

test('circle and ellipse centers remain magnetic even when semantic controls exclude the center', () => {
    for (const profileType of ['circle', 'ellipse'] as const) {
        const curved = createEntity('sketch', profileType);
        curved.profileType = profileType;
        curved.points = profileType === 'circle' ? [[10, 20], [15, 20]] : [[10, 20], [15, 20], [10, 24]];
        curved.controlPoints = [1];
        const result = matchSketchGuide({ entities: [curved], point: [10.1, 20.1], threshold: 0.5 });
        assert.deepEqual(result?.point, [10, 20]);
    }
});
