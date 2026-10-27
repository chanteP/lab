import test from 'node:test';
import assert from 'node:assert/strict';
import { activeId, assets, selectedIds } from '../store.ts';
import { createDefaultAdjustments } from '../engine/adjustments.ts';
import type { ImageAsset } from '../types.ts';
import { callCameraRawTool, listCameraRawTools } from './webmcp.ts';

test('agent tools expose adjustment, preset and history workflows', async () => {
    const asset = { id: 'agent', name: 'agent.jpg', kind: 'jpeg', adjustments: createDefaultAdjustments(), metadata: {}, loading: false } as ImageAsset;
    assets.value = [asset]; activeId.value = 'agent'; selectedIds.value = new Set(['agent']);
    assert.ok(listCameraRawTools().length >= 7);
    const adjusted = await callCameraRawTool('camera_raw_adjust', { adjustments: { exposure: 1.5, curves: { r: [{ x: 0, y: 0 }, { x: 1, y: .8 }] }, mixer: { blue: { hue: 25 } } } });
    assert.equal(adjusted.isError, undefined); assert.equal(asset.adjustments.exposure, 1.5); assert.equal(asset.adjustments.mixer.blue.hue, 25);
    const preset = await callCameraRawTool('camera_raw_preset', { action: 'export' });
    const xmp = JSON.parse(preset.content[0].text).xmp;
    assert.match(xmp, /Exposure2012/);
    await callCameraRawTool('camera_raw_history', { action: 'reset' });
    assert.equal(asset.adjustments.exposure, 0);
    const applied = await callCameraRawTool('camera_raw_preset', { action: 'apply', xmp });
    assert.equal(applied.isError, undefined); assert.equal(asset.adjustments.exposure, 1.5);
    assets.value = []; activeId.value = ''; selectedIds.value = new Set();
});
