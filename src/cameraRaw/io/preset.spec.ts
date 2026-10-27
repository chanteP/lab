import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAdjustments } from '../engine/adjustments.ts';
import { parsePreset, serializePreset } from './preset.ts';

test('imports Camera Raw XMP element and attribute forms', () => {
    const xml = `<x:xmpmeta xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"><rdf:Description crs:Exposure2012="+1.25"><crs:Highlights2012>-40</crs:Highlights2012><crs:ToneCurvePV2012Red>0, 0, 128, 200, 255, 255</crs:ToneCurvePV2012Red><crs:HueAdjustmentBlue>18</crs:HueAdjustmentBlue><crs:RedHue>-12</crs:RedHue></rdf:Description></x:xmpmeta>`;
    const a = parsePreset(xml);
    assert.equal(a.exposure, 1.25); assert.equal(a.highlights, -40); assert.equal(a.curves.r[1].x, 128 / 255);
    assert.equal(a.mixer.blue.hue, 18); assert.equal(a.calibration.redHue, -12);
});

test('round trips all major adjustment groups', () => {
    const a = createDefaultAdjustments();
    a.exposure = -.75; a.temperature = 25; a.curves.g = [{ x: 0, y: 0 }, { x: .5, y: .7 }, { x: 1, y: 1 }];
    a.mixer.orange.luminance = 22; a.grading.shadows = { hue: 220, saturation: 30, luminance: -5 };
    a.calibration.blueSaturation = 35; a.effects.vignette = -20; a.effects.grain = 30;
    const b = parsePreset(serializePreset(a));
    assert.equal(b.exposure, a.exposure); assert.equal(b.temperature, a.temperature);
    assert.ok(Math.abs(b.curves.g[1].x - a.curves.g[1].x) <= 1 / 255);
    assert.ok(Math.abs(b.curves.g[1].y - a.curves.g[1].y) <= 1 / 255);
    assert.deepEqual(b.grading, a.grading); assert.deepEqual(b.calibration, a.calibration); assert.deepEqual(b.optics, a.optics); assert.deepEqual(b.effects, a.effects);
});
