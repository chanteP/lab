import test from 'node:test';
import assert from 'node:assert/strict';
import { disposeLoading, registerLoading, withLoading } from './loading.ts';

test('nested tasks share one loading message and always destroy it', async () => {
    let created = 0, destroyed = 0;
    disposeLoading(); registerLoading(() => { created++; return { destroy: () => destroyed++ }; });
    await withLoading('outer', async () => { await withLoading('inner', async () => 'done'); });
    assert.equal(created, 1); assert.equal(destroyed, 1);
    await assert.rejects(withLoading('failure', async () => { throw new Error('test'); }));
    assert.equal(created, 2); assert.equal(destroyed, 2);
    disposeLoading();
});
