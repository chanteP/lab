import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntity } from '../types';
import { deleteSketchEntityItems } from './sketchItemDeletion';

function rectangle() {
    const entity = createEntity('sketch', 'rectangle');
    Object.assign(entity, { profileType: 'polygon' as const, points: [[0, 0], [10, 0], [10, 10], [0, 10]], open: false });
    entity.edgeConstraints = {
        0: [{ id: 'h0', type: 'horizontal' }], 1: [{ id: 'v1', type: 'vertical' }],
        2: [{ id: 'p2', type: 'parallel', reference: { entityId: entity.id, index: 0 } }],
        3: [{ id: 'v3', type: 'vertical' }],
    };
    entity.lockedPoints = [0, 2];
    return entity;
}

test('whole border deletion leaves all other logical edges with their source indices', () => {
    const result = deleteSketchEntityItems(rectangle(), [], [1]);
    assert.deepEqual(result.fragments.map((fragment) => fragment.sourceIndex), [0, 2, 3]);
    assert.equal(result.source.points?.length, 4);
});

test('point deletion reconnects neighbors and remaps surviving rules and locks', () => {
    const result = deleteSketchEntityItems(rectangle(), [1], []);
    assert.deepEqual(result.source.points, [[0, 0], [10, 10], [0, 10]]);
    assert.deepEqual(result.source.lockedPoints, [0, 1]);
    assert.ok(!result.source.edgeConstraints?.[0]);
    assert.equal(result.source.edgeConstraints?.[2][0].id, 'v3');
    assert.equal(result.fragments.length, 3);
    assert.equal(deleteSketchEntityItems(rectangle(), [1], [0]).fragments.length, 3, 'an already removed adjacent edge must not delete the new neighbor connection');
});

test('deleting all borders or a semantic circle handle removes the entity', () => {
    assert.equal(deleteSketchEntityItems(rectangle(), [], [0, 1, 2, 3]).fragments.length, 0);
    const circle = createEntity('sketch', 'circle');
    Object.assign(circle, { profileType: 'circle' as const, points: [[0, 0], [10, 0]], open: false });
    assert.equal(deleteSketchEntityItems(circle, [0], []).fragments.length, 0);
});
