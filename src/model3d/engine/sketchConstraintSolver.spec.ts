import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntity, type ModelEntity, type Point2 } from '../types';
import { solveDocumentConstraints } from './sketchConstraintSolver';
import { computeSketchFaces } from './sketchFaces';
import { buildSketchRegionPreviews } from './viewport/SketchRegionPreview';

function close(actual: Point2, expected: Point2) {
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 0.001, `${actual} != ${expected}`);
}

function stable(document: ReturnType<typeof createDocument>, rootId: string | null = null) {
    assert.equal(solveDocumentConstraints(document, rootId, [], 100), 'ok');
    const before = JSON.stringify(document.entities);
    assert.equal(solveDocumentConstraints(document, rootId, [], 100), 'ok');
    document.entities.forEach((entity) => {
        const initial = JSON.parse(before).find((item: ModelEntity) => item.id === entity.id);
        entity.points?.forEach((point, index) => close(point, initial.points[index]));
    });
}

test('orthogonal rectangle becomes a square through adjacent equal edges and stays stable', () => {
    const document = createDocument();
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [20, 0], [20, 10], [0, 10]];
    rectangle.open = true;
    rectangle.edgeConstraints = {
        0: { type: 'perpendicular', reference: { entityId: rectangle.id, index: 3 } },
        1: { type: 'perpendicular', reference: { entityId: rectangle.id, index: 0 } },
        2: { type: 'perpendicular', reference: { entityId: rectangle.id, index: 1 } },
        3: { type: 'perpendicular', reference: { entityId: rectangle.id, index: 2 } },
    };
    rectangle.edgeConstraints[0] = [rectangle.edgeConstraints[0], { type: 'equal', reference: { entityId: rectangle.id, index: 1 } }] as any;
    document.entities.push(rectangle);
    stable(document, rectangle.id);
    const lengths = rectangle.points!.map((point, index) => {
        const next = rectangle.points![(index + 1) % 4];
        return Math.hypot(next[0] - point[0], next[1] - point[1]);
    });
    lengths.forEach((length) => assert.ok(Math.abs(length - lengths[0]) < 0.001, JSON.stringify(rectangle.points)));
    const top = [rectangle.points![1][0] - rectangle.points![0][0], rectangle.points![1][1] - rectangle.points![0][1]];
    const left = [rectangle.points![3][0] - rectangle.points![0][0], rectangle.points![3][1] - rectangle.points![0][1]];
    assert.ok(Math.abs(top[0] * left[0] + top[1] * left[1]) / (lengths[0] ** 2) < 0.001);
});

test('regular pentagon satisfies one horizontal edge without losing equal lengths', () => {
    const document = createDocument();
    const pentagon = createEntity('sketch', 'regular');
    pentagon.profileType = 'polygon';
    pentagon.points = Array.from({ length: 5 }, (_, index) => {
        const angle = index / 5 * Math.PI * 2;
        return [Math.cos(angle) * 10, Math.sin(angle) * 10] as Point2;
    });
    pentagon.edgeConstraints = Object.fromEntries([
        [0, [{ type: 'horizontal' as const }]],
        ...Array.from({ length: 4 }, (_, index) => [index + 1, [{ type: 'equal' as const, reference: { entityId: pentagon.id, index: 0 } }]]),
    ]);
    document.entities.push(pentagon);
    stable(document, pentagon.id);
    assert.ok(Math.abs(pentagon.points![1][1] - pentagon.points![0][1]) < 0.001);
    const lengths = pentagon.points!.map((point, index) => {
        const next = pentagon.points![(index + 1) % 5];
        return Math.hypot(next[0] - point[0], next[1] - point[1]);
    });
    lengths.forEach((length) => assert.ok(Math.abs(length - lengths[0]) < 0.001));
});

test('multiple lines solve parallel and equal associations bidirectionally without blur drift', () => {
    const document = createDocument();
    const a = createEntity('sketch', 'a'), b = createEntity('sketch', 'b'), c = createEntity('sketch', 'c');
    a.points = [[0, 0], [10, 0]]; a.lockedPoints = [0, 1];
    b.points = [[0, 1], [5, 5]];
    c.points = [[2, 3], [7, 8]];
    b.edgeConstraints = { 0: { type: 'parallel', reference: { entityId: a.id, index: 0 } } };
    c.edgeConstraints = { 0: [
        { type: 'parallel', reference: { entityId: b.id, index: 0 } },
        { type: 'equal', reference: { entityId: a.id, index: 0 } },
    ] };
    document.entities.push(a, b, c);
    stable(document, a.id);
    for (const entity of [b, c]) {
        assert.ok(Math.abs(entity.points![1][1] - entity.points![0][1]) < 0.001);
    }
    assert.ok(Math.abs(Math.hypot(c.points![1][0] - c.points![0][0], c.points![1][1] - c.points![0][1]) - 10) < 0.001);
});

test('hard locked conflicts roll back every endpoint', () => {
    const document = createDocument();
    const line = createEntity('sketch', 'line');
    line.points = [[0, 0], [10, 0]];
    line.lockedPoints = [0, 1];
    line.edgeConstraints = { 0: [{ type: 'horizontal' }, { type: 'vertical' }] };
    document.entities.push(line);
    const before = JSON.stringify(line.points);
    assert.equal(solveDocumentConstraints(document, line.id, [], 100), 'conflict');
    assert.equal(JSON.stringify(line.points), before);
});

test('constrained profiles produce the same editing and 3D preview faces', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'polygon';
    rectangle.open = true;
    rectangle.planeId = 'plane';
    rectangle.points = [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]];
    rectangle.edgeConstraints = { 0: { type: 'horizontal' }, 2: { type: 'horizontal' }, 1: { type: 'vertical' }, 3: { type: 'vertical' } };
    document.entities.push(rectangle);
    assert.equal(solveDocumentConstraints(document, rectangle.id, [], 100), 'ok');
    const editingFaces = computeSketchFaces(document.entities, 'plane');
    const previews = buildSketchRegionPreviews(document);

    assert.equal(editingFaces.length, 1);
    assert.equal(previews.length, 1);
    assert.deepEqual(previews[0].userData.profilePoints, editingFaces[0].points);
});

test('curved line constraints rebase Bezier controls with the endpoint chord', () => {
    const document = createDocument();
    const line = createEntity('sketch', 'curved');
    line.profileType = 'line';
    line.points = [[0, 0], [10, 0]];
    line.curves = { 0: { c1: [2, 4], c2: [8, -4] } };
    line.analyticCurves = { 0: { kind: 'cubic', a: [0, 0], c1: [2, 4], c2: [8, -4], b: [10, 0] } };
    line.edgeConstraints = { 0: { type: 'length', length: 20 } };
    document.entities.push(line);
    assert.equal(solveDocumentConstraints(document, line.id, [{ entityId: line.id, index: 0 }], 100), 'ok');
    assert.ok(Math.abs(Math.hypot(line.points![1][0] - line.points![0][0], line.points![1][1] - line.points![0][1]) - 20) < 0.001);
    assert.ok(Math.abs(line.curves![0].c1[0] - 4) < 0.001 && Math.abs(line.curves![0].c1[1] - 8) < 0.001);
    assert.ok(Math.abs(line.curves![0].c2[0] - 16) < 0.001 && Math.abs(line.curves![0].c2[1] + 8) < 0.001);
    assert.equal(line.analyticCurves?.[0].kind, 'cubic');
    assert.deepEqual(line.analyticCurves?.[0].a, line.points![0]);
    assert.deepEqual(line.analyticCurves?.[0].b, line.points![1]);
    assert.ok(Math.abs(line.analyticCurves![0].c1[0] - 4) < 0.001 && Math.abs(line.analyticCurves![0].c1[1] - 8) < 0.001);
    assert.ok(Math.abs(line.analyticCurves![0].c2[0] - 16) < 0.001 && Math.abs(line.analyticCurves![0].c2[1] + 8) < 0.001);
});

test('selected points have priority over selected edges and the remaining constraint chain', () => {
    const document = createDocument();
    const line = createEntity('sketch', 'line');
    line.points = [[0, 0], [10, 0]];
    line.edgeConstraints = { 0: { type: 'length', length: 20 } };
    document.entities.push(line);
    assert.equal(solveDocumentConstraints(document, line.id, [{ entityId: line.id, index: 0 }, { entityId: line.id, index: 1 }], 100), 'conflict');
    assert.deepEqual(line.points, [[0, 0], [10, 0]]);
});
