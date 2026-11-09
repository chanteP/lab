import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntity, type ModelEntity, type Point2 } from '../types';
import { profileArcCenter, profilePoints } from './profiles';
import { editRegularEdgeDimension, editSketchDimension, type SketchDimensionOperation } from './sketchDimension';
import { solveDocumentConstraints } from './sketchConstraintSolver';
import { supportsSketchEdgeConstraints, upsertSketchConstraintRule } from './sketchConstraints';

const close = (actual: number, expected: number, message = '') => assert.ok(Math.abs(actual - expected) < 0.001, `${message}: expected ${expected}, got ${actual}`);
const closePoint = (actual: Point2, expected: Point2) => {
    close(actual[0], expected[0], 'x');
    close(actual[1], expected[1], 'y');
};
const length = (points: Point2[], index: number) => {
    const a = points[index], b = points[(index + 1) % points.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
};

function rectangle(equal = false): ModelEntity {
    const entity = createEntity('sketch', 'rectangle');
    entity.profileType = 'rectangle';
    entity.points = [[0, 0], [20, 0], [20, 10], [0, 10]];
    entity.shapeConstraint = 'orthogonal';
    entity.edgeConstraints = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [index, [
        { type: 'perpendicular', reference: { entityId: entity.id, index: (index + 3) % 4 } },
        { type: index % 2 === 0 ? 'horizontal' : 'vertical' },
        ...equal && index === 0 ? [{ type: 'equal' as const, reference: { entityId: entity.id, index: 1 } }] : [],
    ]]));
    return entity;
}

function solveRectangle(entity: ModelEntity, operation: SketchDimensionOperation) {
    const document = createDocument();
    document.entities.push(entity);
    const result = solveDocumentConstraints(document, entity.id, [], 100, { entityId: entity.id, ...operation });
    assert.equal(result, 'ok');
    return entity.points!;
}

test('line length keeps its start, direction and two semantic endpoints', () => {
    const points: Point2[] = [[2, 3], [12, 3]];
    const edit = editSketchDimension(points, {}, 360, { kind: 'segment', index: 0 }, 15);
    assert.deepEqual(edit.points, [[2, 3], [17, 3]]);
    assert.equal(edit.points.length, 2);
    assert.equal(edit.operation?.preserve, 'start');
});

test('open polygon edge length changes only the requested endpoint without adding points', () => {
    const points: Point2[] = [[0, 0], [10, 0], [8, 5]];
    const edit = editSketchDimension(points, {}, 360, { kind: 'segment', index: 1 }, 8);
    assert.equal(edit.points.length, 3);
    closePoint(edit.points[0], [0, 0]);
    closePoint(edit.points[1], [10, 0]);
    close(length(edit.points, 1), 8);
});

test('rectangle width keeps center and height when no equal rule exists', () => {
    const entity = rectangle();
    const edit = editSketchDimension(entity.points!, {}, 360, { kind: 'width' }, 30);
    entity.points = edit.points;
    const points = solveRectangle(entity, edit.operation!);
    [[-5, 0], [25, 0], [25, 10], [-5, 10]].forEach((point, index) => closePoint(points[index], point as Point2));
    assert.equal(points.length, 4);
});

test('rectangle width with adjacent equal edges becomes a centered square', () => {
    const entity = rectangle(true);
    entity.points = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const edit = editSketchDimension(entity.points!, {}, 360, { kind: 'width' }, 30);
    entity.points = edit.points;
    const points = solveRectangle(entity, edit.operation!);
    [[-5, -5], [25, -5], [25, 25], [-5, 25]].forEach((point, index) => closePoint(points[index], point as Point2));
    for (let index = 0; index < 4; index++) close(length(points, index), 30);
    assert.equal(points.length, 4);
});

test('single square edge length keeps its start and axis without rotation or overshoot', () => {
    const entity = rectangle(true);
    entity.points = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const edit = editSketchDimension(entity.points!, {}, 360, { kind: 'segment', index: 0 }, 30);
    entity.points = edit.points;
    const points = solveRectangle(entity, edit.operation!);
    [[0, 0], [30, 0], [30, 30], [0, 30]].forEach((point, index) => closePoint(points[index], point as Point2));
    for (let index = 0; index < 4; index++) close(length(points, index), 30);
    assert.equal(points.length, 4);
});

test('single vertical square edge grows in its own direction from the selected start', () => {
    const entity = rectangle(true);
    entity.points = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const edit = editSketchDimension(entity.points!, {}, 360, { kind: 'segment', index: 1 }, 30);
    entity.points = edit.points;
    const points = solveRectangle(entity, edit.operation!);
    [[-10, 0], [20, 0], [20, 30], [-10, 30]].forEach((point, index) => closePoint(points[index], point as Point2));
    for (let index = 0; index < 4; index++) close(length(points, index), 30);
});

test('dimension edit conflicting with fixed length is rejected without partial geometry', () => {
    const entity = rectangle();
    entity.edgeConstraints![0] = [...entity.edgeConstraints![0] as any[], { type: 'length', length: 20 }];
    const before = entity.points!.map((point) => [...point]);
    const edit = editSketchDimension(entity.points!, {}, 360, { kind: 'segment', index: 0 }, 30);
    entity.points = edit.points;
    const attempted = entity.points.map((point) => [...point]);
    const document = createDocument();
    document.entities.push(entity);
    assert.equal(solveDocumentConstraints(document, entity.id, [], 100, { entityId: entity.id, ...edit.operation! }), 'conflict');
    assert.deepEqual(entity.points, attempted);
    assert.notDeepEqual(entity.points, before);
});

test('equal lines follow the edited line while retaining two endpoints each', () => {
    const document = createDocument();
    const a = createEntity('sketch', 'a'), b = createEntity('sketch', 'b');
    a.profileType = b.profileType = 'line';
    a.points = [[0, 0], [10, 0]];
    b.points = [[0, 5], [5, 5]];
    b.edgeConstraints = { 0: { type: 'equal', reference: { entityId: a.id, index: 0 } } };
    document.entities.push(a, b);
    const edit = editSketchDimension(b.points, {}, 360, { kind: 'segment', index: 0 }, 12);
    b.points = edit.points;
    assert.equal(solveDocumentConstraints(document, b.id, [], 100, { entityId: b.id, ...edit.operation! }), 'ok');
    close(length(a.points!, 0), 12);
    close(length(b.points!, 0), 12);
    closePoint(b.points[0], [0, 5]);
    assert.equal(a.points.length, 2);
    assert.equal(b.points.length, 2);
});

test('regular radius keeps center, rotation, side count and two semantic points', () => {
    const points: Point2[] = [[3, 4], [13, 4]];
    const edit = editSketchDimension(points, {}, 360, { kind: 'regularRadius' }, 15);
    closePoint(edit.points[0], [3, 4]);
    closePoint(edit.points[1], [18, 4]);
    assert.equal(edit.points.length, 2);
});

test('circle sector angle changes only angle, not center, radius or point count', () => {
    const points: Point2[] = [[2, 3], [12, 3]];
    const edit = editSketchDimension(points, {}, 90, { kind: 'angle' }, 135);
    assert.deepEqual(edit.points, points);
    assert.equal(edit.sectorAngle, 135);
    assert.equal(edit.points.length, 2);
});

test('ellipse radii and sector angle remain independent', () => {
    const points: Point2[] = [[0, 0], [10, 0], [0, 6]];
    const x = editSketchDimension(points, {}, 360, { kind: 'radiusX' }, 15);
    closePoint(x.points[1], [15, 0]);
    closePoint(x.points[2], [0, 6]);
    const y = editSketchDimension(x.points, {}, 360, { kind: 'radiusY' }, 9);
    closePoint(y.points[1], [15, 0]);
    closePoint(y.points[2], [0, 9]);
    const angle = editSketchDimension(y.points, {}, 360, { kind: 'angle' }, 120);
    assert.deepEqual(angle.points, y.points);
    assert.equal(angle.points.length, 3);
});

test('arc radius keeps its computed center and three semantic points', () => {
    const points: Point2[] = [[10, 0], [0, 10], [-10, 0]];
    const beforeCenter = profileArcCenter(points)!;
    const edit = editSketchDimension(points, {}, 360, { kind: 'arcRadius' }, 15);
    closePoint(profileArcCenter(edit.points)!, beforeCenter);
    edit.points.forEach((point) => close(Math.hypot(point[0] - beforeCenter[0], point[1] - beforeCenter[1]), 15));
    assert.equal(edit.points.length, 3);
});

test('Bezier control length moves only the requested handle', () => {
    const points: Point2[] = [[0, 0], [10, 0]];
    const curves = { 0: { c1: [3, 4] as Point2, c2: [8, 2] as Point2 } };
    const edit = editSketchDimension(points, curves, 360, { kind: 'control', index: 0, handle: 1 }, 10);
    assert.deepEqual(edit.points, points);
    close(length([points[0], edit.curves[0].c1], 0), 10);
    assert.deepEqual(edit.curves[0].c2, curves[0].c2);
});

test('horizontal constraint keeps line length edit horizontal and start anchored', () => {
    const entity = createEntity('sketch', 'horizontal');
    entity.profileType = 'line';
    entity.points = [[2, 3], [12, 3]];
    entity.edgeConstraints = { 0: { type: 'horizontal' } };
    const edit = editSketchDimension(entity.points, {}, 360, { kind: 'segment', index: 0 }, 15);
    entity.points = edit.points;
    const document = createDocument();
    document.entities.push(entity);
    assert.equal(solveDocumentConstraints(document, entity.id, [], 100, { entityId: entity.id, ...edit.operation! }), 'ok');
    assert.deepEqual(entity.points, [[2, 3], [17, 3]]);
});

test('parallel association leaves its reference fixed during a compatible length edit', () => {
    const document = createDocument();
    const a = createEntity('sketch', 'a'), b = createEntity('sketch', 'b');
    a.profileType = b.profileType = 'line';
    a.points = [[0, 0], [10, 0]];
    b.points = [[2, 5], [7, 5]];
    b.edgeConstraints = { 0: { type: 'parallel', reference: { entityId: a.id, index: 0 } } };
    document.entities.push(a, b);
    const beforeA: Point2[] = a.points.map((point) => [...point]);
    const edit = editSketchDimension(b.points, {}, 360, { kind: 'segment', index: 0 }, 12);
    b.points = edit.points;
    assert.equal(solveDocumentConstraints(document, b.id, [], 100, { entityId: b.id, ...edit.operation! }), 'ok');
    assert.deepEqual(a.points, beforeA);
    assert.deepEqual(b.points, [[2, 5], [14, 5]]);
});

test('perpendicular association leaves its reference fixed during a compatible length edit', () => {
    const document = createDocument();
    const a = createEntity('sketch', 'a'), b = createEntity('sketch', 'b');
    a.profileType = b.profileType = 'line';
    a.points = [[0, 0], [10, 0]];
    b.points = [[2, 5], [2, 10]];
    b.edgeConstraints = { 0: { type: 'perpendicular', reference: { entityId: a.id, index: 0 } } };
    document.entities.push(a, b);
    const beforeA: Point2[] = a.points.map((point) => [...point]);
    const edit = editSketchDimension(b.points, {}, 360, { kind: 'segment', index: 0 }, 8);
    b.points = edit.points;
    assert.equal(solveDocumentConstraints(document, b.id, [], 100, { entityId: b.id, ...edit.operation! }), 'ok');
    a.points.forEach((point, index) => closePoint(point, beforeA[index]));
    closePoint(b.points[0], [2, 5]);
    closePoint(b.points[1], [2, 13]);
});

test('equal lines preserve the unedited line center and direction', () => {
    const document = createDocument();
    const a = createEntity('sketch', 'a'), b = createEntity('sketch', 'b');
    a.profileType = b.profileType = 'line';
    a.points = [[0, 0], [10, 0]];
    b.points = [[0, 5], [5, 5]];
    b.edgeConstraints = { 0: { type: 'equal', reference: { entityId: a.id, index: 0 } } };
    document.entities.push(a, b);
    const edit = editSketchDimension(b.points, {}, 360, { kind: 'segment', index: 0 }, 12);
    b.points = edit.points;
    assert.equal(solveDocumentConstraints(document, b.id, [], 100, { entityId: b.id, ...edit.operation! }), 'ok');
    closePoint(a.points![0], [-1, 0]);
    closePoint(a.points![1], [11, 0]);
});

test('equal rectangle height edit becomes a square around the original center', () => {
    const entity = rectangle(true);
    entity.points = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const edit = editSketchDimension(entity.points!, {}, 360, { kind: 'height' }, 30);
    entity.points = edit.points;
    const points = solveRectangle(entity, edit.operation!);
    [[-5, -5], [25, -5], [25, 25], [-5, 25]].forEach((point, index) => closePoint(points[index], point as Point2));
});

test('fixed length accepts a matching dimension without moving the line', () => {
    const entity = createEntity('sketch', 'fixed');
    entity.profileType = 'line';
    entity.points = [[0, 0], [10, 0]];
    entity.edgeConstraints = { 0: { type: 'length', length: 10 } };
    const edit = editSketchDimension(entity.points, {}, 360, { kind: 'segment', index: 0 }, 10);
    entity.points = edit.points;
    const document = createDocument();
    document.entities.push(entity);
    assert.equal(solveDocumentConstraints(document, entity.id, [], 100, { entityId: entity.id, ...edit.operation! }), 'ok');
    assert.deepEqual(entity.points, [[0, 0], [10, 0]]);
});

test('locked opposite endpoint rejects an incompatible dimension atomically', () => {
    const entity = createEntity('sketch', 'locked');
    entity.profileType = 'line';
    entity.points = [[0, 0], [10, 0]];
    entity.lockedPoints = [1];
    const document = createDocument();
    document.entities.push(entity);
    const before = JSON.parse(JSON.stringify(document));
    const edit = editSketchDimension(entity.points, {}, 360, { kind: 'segment', index: 0 }, 15);
    entity.points = edit.points;
    const attempted = entity.points.map((point) => [...point]);
    assert.equal(solveDocumentConstraints(document, entity.id, [], 100, { entityId: entity.id, ...edit.operation! }, before), 'conflict');
    assert.deepEqual(entity.points, attempted);
});

test('closed polygon edge edit retains closure and semantic element count', () => {
    const entity = createEntity('sketch', 'polygon');
    entity.profileType = 'polygon';
    entity.open = false;
    entity.points = [[0, 0], [10, 0], [10, 8], [0, 8]];
    entity.edgeConstraints = { 0: { type: 'horizontal' } };
    const edit = editSketchDimension(entity.points, {}, 360, { kind: 'segment', index: 0 }, 15);
    entity.points = edit.points;
    const document = createDocument();
    document.entities.push(entity);
    assert.equal(solveDocumentConstraints(document, entity.id, [], 100, { entityId: entity.id, ...edit.operation! }), 'ok');
    assert.deepEqual(entity.points, [[0, 0], [15, 0], [10, 8], [0, 8]]);
    assert.equal(entity.open, false);
    assert.equal(entity.points.length, 4);
});

test('circle radius keeps center, direction and two semantic points', () => {
    const edit = editSketchDimension([[2, 3], [12, 3]], {}, 270, { kind: 'radius' }, 15);
    assert.deepEqual(edit.points, [[2, 3], [17, 3]]);
    assert.equal(edit.sectorAngle, 270);
});

test('regular derived edge length scales the whole shape without replacing semantic points', () => {
    const points: Point2[] = [[3, 4], [13, 4]];
    const sides = 6;
    const edit = editRegularEdgeDimension(points, sides, 10);
    closePoint(edit.points[0], [3, 4]);
    closePoint(edit.points[1], [13, 4]);
    assert.equal(edit.points.length, 2);
    const perimeter = profilePoints('regular', edit.points, 64, undefined, sides);
    assert.equal(perimeter.length, sides);
    for (let index = 0; index < sides; index++) close(length(perimeter, index), 10);
});

test('regular derived edges reject entity-indexed constraints while semantic rectangles accept them', () => {
    assert.equal(supportsSketchEdgeConstraints({ profileType: 'regular' }), false);
    assert.equal(supportsSketchEdgeConstraints({ profileType: 'rectangle' }), true);
    assert.equal(supportsSketchEdgeConstraints({ profileType: 'line' }), true);
    assert.equal(supportsSketchEdgeConstraints({ profileType: 'polygon' }), true);
});

test('an already horizontal edge still records its new horizontal rule without a geometry change', () => {
    const entity = createEntity('sketch', 'horizontal');
    entity.profileType = 'line';
    entity.points = [[0, 0], [10, 0]];
    const before = entity.points.map((point) => [...point]);
    upsertSketchConstraintRule(entity, 0, { id: 'h', type: 'horizontal' });
    upsertSketchConstraintRule(entity, 0, { id: 'duplicate', type: 'horizontal' });
    assert.deepEqual(entity.points, before);
    assert.deepEqual(entity.edgeConstraints?.[0], [{ id: 'h', type: 'horizontal' }]);
});
