import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectEditTransaction } from './modeling/DirectEditTransaction';
import { createEntity } from '../types';
import type { GeometryAnchor } from './viewport/GeometrySelector';

const anchor: GeometryAnchor = { id: 'body', key: 'body:face:f0', normal: [0, 1, 0], localNormal: [0, 1, 0], point: [0, 5, 0], type: 'face', planar: true, vertices: [[0, 5, 0], [1, 5, 0], [0, 5, 1]], indices: [0, 1, 2], faceIds: ['f0'], revision: 0 };

test('direct edit freezes S0 and rejects stale or closed gestures', () => {
    const entity = createEntity('box', 'body');
    const transaction = new DirectEditTransaction(entity, anchor, [0, 1, 0]);
    entity.width = 99;
    assert.equal(transaction.baseEntity.width, 40);
    assert.deepEqual(transaction.request(2, entity).distance, 2);
    assert.equal(transaction.request(3, entity).sequence, 2);
    entity.revision = 2;
    assert.throws(() => transaction.request(4, entity), /发生变化/);
    entity.revision = 0;
    transaction.close();
    assert.throws(() => transaction.request(4, entity), /发生变化/);
});
