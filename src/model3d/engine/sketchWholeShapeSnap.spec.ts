import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSemanticShapeToConstrainedPolygon } from './sketchShapes';
import { isStandardClosedShape, snapWholeShapeTranslation, wholeShapeControlPoints } from './sketchWholeShapeSnap';
import { createEntity, type Point2 } from '../types';

test('only standard closed shapes opt into whole-face dragging', () => {
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [10, 0], [10, 8], [0, 8]];
    convertSemanticShapeToConstrainedPolygon(rectangle);
    assert.equal(rectangle.standardShape, 'rectangle');
    assert.equal(isStandardClosedShape(rectangle), true);
    assert.equal(isStandardClosedShape({ ...rectangle, standardShape: undefined }), false);
    const circle = createEntity('sketch', 'circle');
    circle.profileType = 'circle';
    circle.points = [[0, 0], [5, 0]];
    assert.equal(isStandardClosedShape(circle), true);
});

test('whole-shape translation uses the best snap across semantic and Bezier control points', () => {
    const line = createEntity('sketch', 'line');
    line.profileType = 'line';
    line.points = [[0, 0], [10, 0]];
    line.curves = { 0: { c1: [2, 3], c2: [8, 3] } };
    const controls = wholeShapeControlPoints(line);
    assert.equal(controls.length, 4);
    const snap = (point: Point2): Point2 => Math.hypot(point[0] - 10, point[1]) < 0.5 ? [10, 0] : point;
    const delta = snapWholeShapeTranslation(controls, [0.2, 0.2], snap);
    assert.deepEqual(delta, [0, 0]);
    assert.deepEqual(snapWholeShapeTranslation(controls, [0.2, 0.2], (point) => point), [0.2, 0.2]);
});
