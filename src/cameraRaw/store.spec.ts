import test from 'node:test';
import assert from 'node:assert/strict';
import { activeId, assets, canRedo, canUndo, redo, selectedIds, syncToSelected, toggleSelected, undo } from './store.ts';
import { createDefaultAdjustments } from './engine/adjustments.ts';
import type { ImageAsset } from './types.ts';

test('multi-select keeps sync source and applies current adjustments to the group', () => {
    const make = (id: string) => ({ id, name: id, adjustments: createDefaultAdjustments(), metadata: {}, loading: false }) as ImageAsset;
    assets.value = [make('a'), make('b'), make('c')]; activeId.value = 'a'; selectedIds.value = new Set(['a']);
    toggleSelected('b'); toggleSelected('c');
    assert.equal(activeId.value, 'a'); assert.deepEqual([...selectedIds.value], ['a', 'b', 'c']);
    assets.value[0].adjustments.exposure = 1.75; assets.value[0].adjustments.mixer.blue.hue = 30;
    syncToSelected();
    assert.equal(assets.value[1].adjustments.exposure, 1.75); assert.equal(assets.value[2].adjustments.mixer.blue.hue, 30);
    assets.value = []; activeId.value = ''; selectedIds.value = new Set();
});

test('undo and redo restore independent adjustment history', async () => {
    const asset = { id: 'history', name: 'history', adjustments: createDefaultAdjustments(), metadata: {}, loading: false } as ImageAsset;
    assets.value = [asset]; activeId.value = 'history'; selectedIds.value = new Set(['history']);
    await Promise.resolve();
    asset.adjustments.exposure = 2;
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(canUndo.value, true); undo(); assert.equal(asset.adjustments.exposure, 0);
    assert.equal(canRedo.value, true); redo(); assert.equal(asset.adjustments.exposure, 2);
    assets.value = []; activeId.value = ''; selectedIds.value = new Set();
});
