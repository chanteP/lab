import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSketchGuide } from './sketchGuides';
import { guidePointerOutsideViewport, guideFromRuler, guideScreenPosition, rulerScaleTicks, rulerTickStep, snapGuideOffsetToRuler } from './sketchRulers';

test('top and left rulers create perpendicular persistent guides in plane coordinates', () => {
    assert.deepEqual(guideFromRuler('top', [130, 80], [100, 100], 2), { axis: 'v', offset: 40 });
    assert.deepEqual(guideFromRuler('left', [80, 70], [100, 100], 2), { axis: 'u', offset: -40 });
    assert.deepEqual(guideScreenPosition({ id: 'g', axis: 'u', offset: 20 }, [100, 100], 2), { ruler: 'top', position: 110 });
    assert.deepEqual(guideScreenPosition({ id: 'g', axis: 'v', offset: 20 }, [100, 100], 2), { ruler: 'left', position: 90 });
});

test('ruler ticks use readable 1/2/5 steps and preserve the plane origin', () => {
    assert.equal(rulerTickStep(2), 100);
    assert.equal(rulerTickStep(0.2), 10);
});

test('persistent ruler axes participate in guide snapping and intersections', () => {
    const vertical = matchSketchGuide({ entities: [], point: [10.2, 8], guides: [{ id: 'x', axis: 'u', offset: 10 }], threshold: 0.5 });
    assert.deepEqual(vertical?.point, [10, 8]);
    const intersection = matchSketchGuide({
        entities: [], point: [10.2, 20.2], threshold: 0.5,
        guides: [{ id: 'x', axis: 'u', offset: 10 }, { id: 'y', axis: 'v', offset: 20 }],
    });
    assert.deepEqual(intersection?.point, [10, 20]);
    assert.equal(intersection?.matches.length, 2);
});

test('guide dragging snaps to the nearest visible ruler tick within screen tolerance', () => {
    const frame = {
        width: 600, height: 400, origin: { x: 100, y: 100 }, unitsPerPixel: 0.4, unit: 'mm' as const, guides: [],
    };
    assert.equal(snapGuideOffsetToRuler({ id: 'g', axis: 'u', offset: 21 }, 21, frame), 20);
    assert.equal(snapGuideOffsetToRuler({ id: 'g', axis: 'v', offset: 19 }, 19, frame), 18);
    assert.equal(snapGuideOffsetToRuler({ id: 'g', axis: 'u', offset: 40 }, 40, frame), 40);
});

test('ruler scale exposes long, medium and short ticks and snapping includes minor ticks', () => {
    const ticks = rulerScaleTicks(100, 0.4, 400);
    assert.ok(ticks.some((tick) => tick.kind === 'major'));
    assert.ok(ticks.some((tick) => tick.kind === 'medium'));
    assert.ok(ticks.some((tick) => tick.kind === 'minor'));
    const frame = {
        width: 600, height: 400, origin: { x: 100, y: 100 }, unitsPerPixel: 0.4, unit: 'mm' as const, guides: [],
    };
    assert.equal(snapGuideOffsetToRuler({ id: 'g', axis: 'u', offset: 22.8 }, 22.8, frame), 22);
});

test('dragging a guide back to a ruler or outside the viewport dismisses it', () => {
    const frame = {
        width: 600, height: 400, origin: { x: 100, y: 100 }, unitsPerPixel: 0.4, unit: 'mm' as const, guides: [],
    };
    assert.equal(guidePointerOutsideViewport('u', { x: 10, y: 100 }, frame), true);
    assert.equal(guidePointerOutsideViewport('u', { x: 601, y: 100 }, frame), true);
    assert.equal(guidePointerOutsideViewport('v', { x: 100, y: 10 }, frame), true);
    assert.equal(guidePointerOutsideViewport('v', { x: 100, y: 401 }, frame), true);
    assert.equal(guidePointerOutsideViewport('u', { x: 100, y: 100 }, frame), false);
});
