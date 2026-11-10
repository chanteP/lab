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

test('rectangle corner drag preserves the opposite corner and moves only the two adjacent corners', () => {
    const { document, entity } = rectangle();
    entity.edgeConstraints = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [index, [
        ...entity.edgeConstraints![index] as any[],
        { type: index % 2 === 0 ? 'horizontal' : 'vertical' },
    ]]));
    const before = cloneDocument(document);
    entity.points![0] = [-5, -5];
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [], null);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    const points = solved.document.entities[0].points!;
    closePoint(points[0], [-5, -5]);
    closePoint(points[1], [20, -5]);
    closePoint(points[2], [20, 20]);
    closePoint(points[3], [-5, 20]);
    assert.ok(solved.changed! <= 2);
});

test('regular polygon vertex drag keeps one non-dragged vertex stationary when a similarity solve exists', () => {
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
    const levels = sketchConstraintAnchorLevels(document, [{ entityId: entity.id, index: 0 }], [], null);
    const solved = solveWithSketchConstraintCandidates(document, before, entity.id, levels, 100);
    assert.equal(solved.result, 'ok');
    const stationary = before.entities[0].points!.slice(1).filter((point, index) => Math.hypot(point[0] - solved.document.entities[0].points![index + 1][0], point[1] - solved.document.entities[0].points![index + 1][1]) < 0.001);
    assert.ok(stationary.length >= 1, JSON.stringify(solved.document.entities[0].points));
});
