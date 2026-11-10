import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSemanticShapeToConstrainedPolygon } from './sketchShapes';
import { isStandardClosedShape, snapWholeShapeTranslation, standardShapeEntityFromFaces, wholeShapeControlPoints } from './sketchWholeShapeSnap';
import { computeSketchFaces } from './sketchFaces';
import { createDocument, createEntity, type Point2 } from '../types';

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

test('standard shape center is a whole-drag snap control but trimmed shapes lose it', () => {
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [20, 0], [20, 10], [0, 10]];
    convertSemanticShapeToConstrainedPolygon(rectangle);
    const controls = wholeShapeControlPoints(rectangle);
    assert.deepEqual(controls[controls.length - 1], [10, 5]);
    assert.equal(wholeShapeControlPoints({ ...rectangle, trimmed: true }).some((point) => point[0] === 10 && point[1] === 5), false);
});

test('overlapping standard shapes remain whole-selectable until their edges are fused', () => {
    const document = createDocument();
    const a = createEntity('sketch', 'a'), b = createEntity('sketch', 'b');
    a.profileType = b.profileType = 'rectangle';
    a.points = [[0, 0], [20, 0], [20, 20], [0, 20]];
    b.points = [[10, 0], [30, 0], [30, 20], [10, 20]];
    convertSemanticShapeToConstrainedPolygon(a);
    convertSemanticShapeToConstrainedPolygon(b);
    a.planeId = b.planeId = 'plane';
    document.entities.push(a, b);
    const faces = computeSketchFaces(document.entities, 'plane');
    assert.ok(faces.some((face) => face.entityIds.length > 1));
    assert.ok(standardShapeEntityFromFaces(document, faces));
    a.trimmed = b.trimmed = true;
    assert.equal(standardShapeEntityFromFaces(document, faces), null);
});
