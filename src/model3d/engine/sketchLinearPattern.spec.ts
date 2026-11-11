import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntity, type Point2 } from '../types';
import { linearPatternCopies, linearPatternEntities, snapLinearPatternDirection } from './sketchLinearPattern';

const closePoint = (actual: Point2, expected: Point2) => assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-7);

test('linear copies retain the source and use equal fixed-direction steps', () => {
    const copies = linearPatternCopies([{ points: [[0, 0], [2, 0]], closed: false }], { count: 3, direction: [0, 2], spacing: 5 });
    assert.equal(copies.length, 3);
    closePoint(copies[0].points[0], [0, 5]);
    closePoint(copies[1].points[0], [0, 10]);
    closePoint(copies[2].points[0], [0, 15]);
});

test('direction snap supports axes, sketch edges and exact reference points', () => {
    const axis = snapLinearPatternDirection([0, 0], [20, 1], { points: [], edges: [] }, 2);
    closePoint(axis.direction, [1, 0]);
    assert.equal(axis.kind, 'axis');
    const edge = snapLinearPatternDirection([0, 0], [10, 10.5], { points: [], edges: [{ a: [0, 0], b: [10, 10] }] }, 2);
    closePoint(edge.direction, [Math.SQRT1_2, Math.SQRT1_2]);
    assert.equal(edge.kind, 'edge');
    const point = snapLinearPatternDirection([0, 0], [20.5, 10], { points: [[20, 10]], edges: [] }, 2);
    assert.equal(point.kind, 'point');
    closePoint(point.endpoint, [20, 10]);
});

test('committed entities translate semantic points, curves and self references without changing the source', () => {
    const document = createDocument();
    const source = createEntity('sketch', 'source');
    source.profileType = 'polygon';
    source.points = [[0, 0], [10, 0]];
    source.curves = { 0: { c1: [3, 2], c2: [7, 2] } };
    source.edgeConstraints = { 0: [{ id: 'rule', type: 'parallel', reference: { entityId: source.id, index: 0 } }] };
    document.entities.push(source);
    const [copy] = linearPatternEntities(document, [source.id], { count: 1, direction: [1, 0], spacing: 20 });
    assert.deepEqual(copy.points, [[20, 0], [30, 0]]);
    assert.deepEqual(copy.curves?.[0], { c1: [23, 2], c2: [27, 2] });
    assert.equal(copy.edgeConstraints?.[0][0].reference?.entityId, copy.id);
    assert.deepEqual(source.points, [[0, 0], [10, 0]]);
    assert.equal(source.edgeConstraints?.[0][0].reference?.entityId, source.id);
});
