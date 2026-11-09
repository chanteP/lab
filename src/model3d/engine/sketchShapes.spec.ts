import test from 'node:test';
import assert from 'node:assert/strict';
import { constraintRules } from './sketchConstraints';
import { convertSemanticShapeToConstrainedPolygon } from './sketchShapes';
import { createEntity } from '../types';

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
