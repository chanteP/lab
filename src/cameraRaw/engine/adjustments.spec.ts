import test from 'node:test';
import assert from 'node:assert/strict';
import { blendAdjustments, createDefaultAdjustments, mergeAdjustments } from './adjustments.ts';
import { applyCurves, createCurveLut, evaluateCurve, normalizePoints } from './curve.ts';
import { applyMixer, applyTone, calibrationMatrix, gradeFor, hslToRgb, opticsCoordinate, rgbToHsl, whiteBalance } from './color.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('default adjustment and partial nested merge are non-destructive', () => {
    const a = createDefaultAdjustments();
    const b = mergeAdjustments(a, { exposure: 1.5, mixer: { red: { hue: 20 } } } as never);
    near(b.exposure, 1.5); near(b.mixer.red.hue, 20); near(b.mixer.blue.hue, 0); near(a.exposure, 0);
});

test('curve normalizes endpoints and stays finite and monotonic', () => {
    const points = normalizePoints([{ x: .8, y: .7 }, { x: .2, y: .3 }, { x: .2, y: .4 }]);
    near(points[0].x, 0); near(points.at(-1)!.x, 1);
    const lut = createCurveLut([{ x: 0, y: 0 }, { x: .25, y: .4 }, { x: .75, y: .6 }, { x: 1, y: 1 }]);
    for (let i = 1; i < lut.length; i++) assert.ok(lut[i] >= lut[i - 1]);
    near(evaluateCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }], .42), .42);
});

test('composite RGB curve affects every channel before independent channel curves', () => {
    const curves = createDefaultAdjustments().curves;
    curves.rgb = [{ x: 0, y: 0 }, { x: .5, y: .8 }, { x: 1, y: 1 }];
    const composite = applyCurves([.5, .5, .5], curves);
    composite.forEach((value) => near(value, .8));
    curves.r = [{ x: 0, y: 0 }, { x: .8, y: .4 }, { x: 1, y: 1 }];
    const independent = applyCurves([.5, .5, .5], curves);
    near(independent[0], .4); near(independent[1], .8); near(independent[2], .8);
});

test('preset strength blends scalar, nested and curve values without compounding', () => {
    const base = createDefaultAdjustments(), target = createDefaultAdjustments();
    target.exposure = 2; target.mixer.blue.hue = 100;
    target.curves.rgb = [{ x: 0, y: 0 }, { x: .5, y: 1 }, { x: 1, y: 1 }];
    assert.deepEqual(blendAdjustments(base, target, 0), base); assert.deepEqual(blendAdjustments(base, target, 1), target);
    const half = blendAdjustments(base, target, .5);
    near(half.exposure, 1); near(half.mixer.blue.hue, 50); near(half.curves.rgb[8].y, .75);
});

test('HSL and RGB conversion round trips representative colors', () => {
    for (const rgb of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [.2, .4, .8], [.5, .5, .5]]) {
        const out = hslToRgb(...rgbToHsl(rgb) as [number, number, number]);
        rgb.forEach((v, i) => near(v, out[i]));
    }
});

test('color mixer changes target colors and leaves neutral colors unchanged', () => {
    const a = createDefaultAdjustments(); a.mixer.red.saturation = -100; a.mixer.blue.hue = 40;
    assert.ok(applyMixer([1, 0, 0], a.mixer).every((v, i, arr) => Math.abs(v - arr[0]) < 1e-5));
    assert.deepEqual(applyMixer([.5, .5, .5], a.mixer), [.5, .5, .5]);
    assert.notDeepEqual(applyMixer([0, 0, 1], a.mixer), [0, 0, 1]);
});

test('mixer hue uses the Camera Raw-like bounded sixty degree range', () => {
    const a = createDefaultAdjustments(); a.mixer.red.hue = 100;
    near(rgbToHsl(applyMixer([1, 0, 0], a.mixer))[0], 60);
});

test('calibration defaults to identity and primaries respond independently', () => {
    const a = createDefaultAdjustments().calibration;
    assert.deepEqual(calibrationMatrix(a), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    a.redHue = 100;
    const changed = calibrationMatrix(a);
    near(changed[1], 1 / 3); near(changed[4], 1); near(changed[8], 1);
    a.redHue = 0; a.redSaturation = -100;
    assert.notDeepEqual(calibrationMatrix(a), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test('zero saturation grading adds no color shift', () => {
    assert.deepEqual(gradeFor({ hue: 200, saturation: 0, luminance: 20 }), [0, 0, 0]);
    assert.notDeepEqual(gradeFor({ hue: 200, saturation: 50, luminance: 0 }), [0, 0, 0]);
});

test('white balance, tone and saturation stay bounded and respond monotonically', () => {
    const a = createDefaultAdjustments();
    assert.deepEqual(applyTone([.2, .4, .6], a), [.2, .4, .6]);
    assert.ok(whiteBalance([.4, .4, .4], 50, 0)[0] > whiteBalance([.4, .4, .4], -50, 0)[0]);
    a.exposure = 1;
    assert.ok(applyTone([.2, .2, .2], a)[0] > .2);
    a.exposure = 0; a.saturation = 100;
    const saturated = applyTone([.4, .5, .6], a);
    assert.ok(saturated[2] - saturated[0] > .2);
    saturated.forEach((v) => assert.ok(Number.isFinite(v) && v >= 0 && v <= 1));
});

test('optics keeps image center fixed and only changes coordinates when requested', () => {
    assert.deepEqual(opticsCoordinate(.5, .5, 80), [.5, .5]);
    assert.deepEqual(opticsCoordinate(.2, .7, 0), [.2, .7]);
    assert.notDeepEqual(opticsCoordinate(.2, .7, 80), [.2, .7]);
});
