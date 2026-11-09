import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSketchGuide } from './sketchGuides';
import { guideFromRuler, guideScreenPosition, rulerTickStep } from './sketchRulers';

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
