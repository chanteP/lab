import test from 'node:test';
import assert from 'node:assert/strict';
import { activeId, assets, selectedIds, syncToSelected, toggleSelected } from './store.ts';
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
