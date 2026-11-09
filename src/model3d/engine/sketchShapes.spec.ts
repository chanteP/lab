import test from 'node:test';
import assert from 'node:assert/strict';
import { constraintRules } from './sketchConstraints';
import { convertSemanticShapeToConstrainedPolygon } from './sketchShapes';
import { createDocument, createEntity } from '../types';
import { solveDocumentConstraints } from './sketchConstraintSolver';
import { editSketchDimension } from './sketchDimension';

test('rectangle becomes independent line edges connected by perpendicular constraints', () => {
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [20, 0], [20, 10], [0, 10]];
    convertSemanticShapeToConstrainedPolygon(rectangle);
    assert.equal(rectangle.profileType, 'polygon');
    assert.equal(rectangle.open, false);
    assert.equal(rectangle.points?.length, 4);
    for (let index = 0; index < 4; index++) {
        const rules = constraintRules(rectangle.edgeConstraints?.[index]);
        assert.ok(rules.some((rule) => rule.type === 'perpendicular' && rule.reference?.entityId === rectangle.id && rule.reference.index === (index + 3) % 4));
    }
});

test('regular polygon becomes perimeter points with equal chord-length constraints', () => {
    const regular = createEntity('sketch', 'regular');
    regular.profileType = 'regular';
    regular.points = [[0, 0], [10, 0]];
    regular.sides = 6;
    convertSemanticShapeToConstrainedPolygon(regular);
    assert.equal(regular.profileType, 'polygon');
    assert.equal(regular.points?.length, 6);
    assert.equal(regular.sides, undefined);
    for (let index = 1; index < 6; index++) {
        assert.ok(constraintRules(regular.edgeConstraints?.[index]).some((rule) => rule.type === 'equal' && rule.reference?.index === 0));
    }
});

test('regular polygon angle and equal-length rules restore regularity after a vertex edit', () => {
    const regular = createEntity('sketch', 'regular');
    regular.profileType = 'regular';
    regular.points = [[0, 0], [10, 0]];
    regular.sides = 6;
    convertSemanticShapeToConstrainedPolygon(regular);
    for (let index = 0; index < 6; index++) {
        assert.ok(constraintRules(regular.edgeConstraints?.[index]).some((rule) => rule.type === 'angle' && Math.abs((rule.angle || 0) - Math.PI / 3) < 1e-9));
    }
    regular.points![0] = [3, 2];
    const document = createDocument();
    document.entities.push(regular);
    assert.equal(solveDocumentConstraints(document, regular.id, [], 100), 'ok');
    const lengths = regular.points!.map((point, index) => {
        const next = regular.points![(index + 1) % 6];
        return Math.hypot(next[0] - point[0], next[1] - point[1]);
    });
    lengths.forEach((length) => assert.ok(Math.abs(length - lengths[0]) < 0.001, JSON.stringify(regular.points)));
    for (let index = 0; index < 6; index++) {
        const previous = regular.points![(index + 5) % 6], point = regular.points![index], next = regular.points![(index + 1) % 6];
        const incoming = Math.atan2(point[1] - previous[1], point[0] - previous[0]);
        const outgoing = Math.atan2(next[1] - point[1], next[0] - point[0]);
        const turn = Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming));
        assert.ok(Math.abs(turn - Math.PI / 3) < 0.001, `turn ${index}: ${turn}`);
    }
});

test('regular polygon edge dimensions propagate without losing equal exterior angles', () => {
    const regular = createEntity('sketch', 'regular');
    regular.profileType = 'regular';
    regular.points = [[0, 0], [10, 0]];
    regular.sides = 5;
    convertSemanticShapeToConstrainedPolygon(regular);
    const edit = editSketchDimension(regular.points!, {}, 360, { kind: 'segment', index: 0 }, 12);
    regular.points = edit.points;
    const document = createDocument();
    document.entities.push(regular);
    assert.equal(solveDocumentConstraints(document, regular.id, [], 100, { entityId: regular.id, ...edit.operation! }), 'ok');
    regular.points!.forEach((point, index) => {
        const next = regular.points![(index + 1) % 5];
        assert.ok(Math.abs(Math.hypot(next[0] - point[0], next[1] - point[1]) - 12) < 0.001);
        const previous = regular.points![(index + 4) % 5];
        const incoming = Math.atan2(point[1] - previous[1], point[0] - previous[0]);
        const outgoing = Math.atan2(next[1] - point[1], next[0] - point[0]);
        const turn = Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming));
        assert.ok(Math.abs(turn - Math.PI * 2 / 5) < 0.001);
    });
});
