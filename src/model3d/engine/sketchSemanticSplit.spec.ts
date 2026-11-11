import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSemanticShapeToLines } from './sketchSemanticSplit';
import { createEntity, type Point2 } from '../types';

let nextId = 0;
const id = () => `line-${++nextId}`;

test('a Bezier-edited rectangle splits into four independent lines with curves on their original edges', () => {
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [20, 0], [20, 10], [0, 10]];
    rectangle.curves = { 1: { c1: [20, 3], c2: [22, 7] } };
    const lines = splitSemanticShapeToLines(rectangle, id);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => line.profileType === 'line' && line.open && line.points?.length === 2));
    assert.deepEqual(lines[1].points, [[20, 0], [20, 10]]);
    assert.deepEqual(lines[1].curves?.[0], { c1: [20, 3], c2: [22, 7] });
    assert.equal(new Set(lines.map((line) => line.id)).size, 4);
    assert.equal(rectangle.profileType, 'rectangle');
});

test('a regular polygon splits using its evaluated perimeter rather than center and radius handles', () => {
    const regular = createEntity('sketch', 'regular');
    regular.profileType = 'regular';
    regular.points = [[0, 0], [10, 0]] as Point2[];
    regular.sides = 5;
    const lines = splitSemanticShapeToLines(regular, id);
    assert.equal(lines.length, 5);
    assert.deepEqual(lines[0].points?.[0], lines[4].points?.[1]);
    assert.ok(lines.every((line) => !line.sides && !line.parts));
});

test('split lines retain edge rules, remapped references and endpoint locks', () => {
    const rectangle = createEntity('sketch', 'constrained-rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [20, 0], [20, 10], [0, 10]];
    rectangle.edgeConstraints = {
        0: [{ id: 'horizontal', type: 'horizontal' }],
        1: [{ id: 'perpendicular', type: 'perpendicular', reference: { entityId: rectangle.id, index: 0 } }],
    };
    rectangle.constraintEdges = [2];
    rectangle.lockedPoints = [0, 1, 2, 3];
    const lines = splitSemanticShapeToLines(rectangle, id);
    assert.deepEqual(lines[0].edgeConstraints?.[0], [{ id: 'horizontal', type: 'horizontal' }]);
    assert.deepEqual(lines[1].edgeConstraints?.[0], [{
        id: 'perpendicular', type: 'perpendicular', reference: { entityId: lines[0].id, index: 0 },
    }]);
    assert.deepEqual(lines[2].constraintEdges, [0]);
    assert.deepEqual(lines[0].lockedPoints, [0, 1]);
    assert.ok(lines.every((line) => line.lockedPoints?.length === 2));
    rectangle.edgeConstraints![0] = [];
    assert.equal(lines[0].edgeConstraints?.[0].length, 1, 'copied rules must not alias the source');
});
