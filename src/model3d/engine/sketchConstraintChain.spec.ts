import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDocument, createDocument, createEntity, type Point2 } from '../types';
import { convertSemanticShapeToConstrainedPolygon } from './sketchShapes';
import { editSketchDimension } from './sketchDimension';
import { sketchConstraintAnchorLevels, solveWithSketchConstraintCandidates } from './sketchConstraintChain';

function closePoint(actual: Point2, expected: Point2) {
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 0.005, `${actual} != ${expected}`);
}

function rectangle() {
    const document = createDocument();
    const entity = createEntity('sketch', 'rectangle');
    entity.profileType = 'rectangle';
    entity.points = [[0, 0], [20, 0], [20, 20], [0, 20]];
    entity.open = false;
    convertSemanticShapeToConstrainedPolygon(entity);
    document.entities.push(entity);
    return { document, entity };
}

test('single rectangle edge dimension preserves height instead of accepting a smaller free-solve rectangle', () => {
    const { document, entity } = rectangle();
    const before = cloneDocument(document);
    const edit = editSketchDimension([entity.points![0], entity.points![1]], {}, 360, { kind: 'segment', index: 0 }, 40);
    entity.points![0] = edit.points[0];
    entity.points![1] = edit.points[1];
    const levels = sketchConstraintAnchorLevels(document, [], [{ entityId: entity.id, index: 0 }], { entityId: entity.id, index: 0, sourceCount: 1, kind: 'line' });
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100, { entityId: entity.id, ...edit.operation! });
    assert.equal(solved.result, 'ok');
    const points = solved.document.entities[0].points!;
    [[0, 0], [40, 0], [40, 20], [0, 20]].forEach((point, index) => closePoint(points[index], point as Point2));
});

test('default rectangle corner drag preserves the center and every orthogonal constraint', () => {
    const { document, entity } = rectangle();
    const before = cloneDocument(document);
    entity.points![0] = [-5, -5];
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [], null, [entity.id]);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    const points = solved.document.entities[0].points!;
    closePoint(points[0], [-5, -5]);
    closePoint(points.reduce((center, point) => [center[0] + point[0] / 4, center[1] + point[1] / 4], [0, 0] as Point2), [10, 10]);
    points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        const following = points[(index + 2) % points.length];
        const a = [next[0] - point[0], next[1] - point[1]];
        const b = [following[0] - next[0], following[1] - next[1]];
        const cosine = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a as Point2) * Math.hypot(...b as Point2));
        assert.ok(Math.abs(cosine) < 0.001, `corner ${index} is not orthogonal: ${JSON.stringify(points)}`);
    });
});

test('explicit horizontal and vertical rectangle constraints remain hard during a corner drag', () => {
    const { document, entity } = rectangle();
    entity.edgeConstraints = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [index, [
        ...entity.edgeConstraints![index] as any[],
        { type: index % 2 === 0 ? 'horizontal' : 'vertical' },
    ]]));
    const before = cloneDocument(document);
    entity.points![0] = [-5, -5];
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [], null, [entity.id]);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    const points = solved.document.entities[0].points!;
    closePoint(points[0], [-5, -5]);
    closePoint(points[1], [25, -5]);
    closePoint(points[2], [25, 25]);
    closePoint(points[3], [-5, 25]);
    closePoint(points.reduce((center, point) => [center[0] + point[0] / 4, center[1] + point[1] / 4], [0, 0] as Point2), [10, 10]);
});

test('selected edge endpoints have priority over the current shape center', () => {
    const { document, entity } = rectangle();
    entity.edgeConstraints = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [index, [
        ...entity.edgeConstraints![index] as any[],
        { type: index % 2 === 0 ? 'horizontal' : 'vertical' },
    ]]));
    const before = cloneDocument(document);
    entity.points![0] = [-5, 0];
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [{ entityId: entity.id, index: 1 }], null, [entity.id]);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    const points = solved.document.entities[0].points!;
    closePoint(points[0], [-5, 0]);
    closePoint(points[1], [20, 0]);
    closePoint(points[2], [20, 20]);
    closePoint(points[3], [-5, 20]);
});

test('every fallback candidate retains the current operation point', () => {
    const { document, entity } = rectangle();
    const current = { entityId: entity.id, index: 0 };
    const levels = sketchConstraintAnchorLevels(document, [current], [{ entityId: entity.id, index: 0 }], null);
    assert.ok(levels.length > 1);
    levels.forEach((level) => assert.ok(level.anchors.some((anchor) => anchor.entityId === current.entityId && anchor.index === current.index)));
});

test('regular polygon vertex drag preserves the shape center before non-dragged vertices', () => {
    const document = createDocument();
    const entity = createEntity('sketch', 'regular');
    entity.profileType = 'regular';
    entity.points = [[0, 0], [20, 0]];
    entity.sides = 5;
    convertSemanticShapeToConstrainedPolygon(entity);
    document.entities.push(entity);
    const before = cloneDocument(document);
    const moved = entity.points![0];
    entity.points![0] = [moved[0] + 4, moved[1] + 3];
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [], null, [entity.id]);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    closePoint(solved.document.entities[0].points![0], moved.map((value, index) => value + [4, 3][index]) as Point2);
    const center = (points: Point2[]) => points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0] as Point2);
    closePoint(center(solved.document.entities[0].points!), center(before.entities[0].points!));
});

test('an endpoint aligned with the target stays fixed before the selected shape center', () => {
    const { document, entity } = rectangle();
    entity.edgeConstraints = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [index, [
        ...entity.edgeConstraints![index] as any[],
        { type: index % 2 === 0 ? 'horizontal' : 'vertical' },
    ]]));
    const before = cloneDocument(document);
    entity.points![0] = [0, -5];
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [], null, [entity.id]);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    const points = solved.document.entities[0].points!;
    closePoint(points[0], [0, -5]);
    closePoint(points[1], [20, -5]);
    closePoint(points[2], [20, 20]);
    closePoint(points[3], [0, 20]);
});

test('an aligned endpoint keeps its shared axis when its full position cannot stay fixed', () => {
    const { document, entity } = rectangle();
    entity.edgeConstraints![2] = [...entity.edgeConstraints![2] as any[], { type: 'length', length: 30 }];
    entity.edgeConstraints![3] = [...entity.edgeConstraints![3] as any[], { type: 'length', length: 30 }];
    const before = cloneDocument(document);
    entity.points![0] = [0, -5];
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [], null, [entity.id]);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    const points = solved.document.entities[0].points!;
    closePoint(points[0], [0, -5]);
    assert.ok(Math.abs(points[3][0]) < 0.001, JSON.stringify(points));
    assert.ok(Math.abs(points[3][1] - 20) > 1, JSON.stringify(points));
    assert.ok(Math.abs(Math.hypot(points[3][0] - points[2][0], points[3][1] - points[2][1]) - 30) < 0.001);
    points.forEach((point, index) => {
        const next = points[(index + 1) % points.length], following = points[(index + 2) % points.length];
        const a = [next[0] - point[0], next[1] - point[1]], b = [following[0] - next[0], following[1] - next[1]];
        const cosine = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]));
        assert.ok(Math.abs(cosine) < 0.001, JSON.stringify(points));
    });
});
