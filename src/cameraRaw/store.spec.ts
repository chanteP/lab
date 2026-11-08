import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAsset, activeId, assets, canRedo, canUndo, importFiles, redo, selectedIds, syncToSelected, toggleSelected, undo } from './store.ts';
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

test('sequential imports always select and decode the newly added image', async () => {
    const previousBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = async () => ({ width: 2, height: 1 }) as ImageBitmap;
    try {
        assets.value = []; activeId.value = ''; selectedIds.value = new Set();
        const first = new File([new Uint8Array([1])], 'first.png', { type: 'image/png' });
        const second = new File([new Uint8Array([2])], 'second.png', { type: 'image/png' });
        await importFiles([first]);
        const firstId = activeId.value;
        await importFiles([second]);
        assert.notEqual(activeId.value, firstId);
        assert.equal(activeAsset.value?.name, 'second.png');
        assert.ok(activeAsset.value?.bitmap);
    } finally {
        globalThis.createImageBitmap = previousBitmap;
        assets.value = []; activeId.value = ''; selectedIds.value = new Set();
    }
});
