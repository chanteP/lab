import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntity } from '../types';
import { intersectionProfileAtPoint } from './profileIntersection';

test('circle and rectangle intersection returns only the bounded overlap profile', () => {
    const circle = Object.assign(createEntity('extrude', 'circle'), { kind: 'sketch' as const, profileType: 'circle' as const, planeId: 'plane', points: [[0, 0], [10, 0]] });
    const rectangle = Object.assign(createEntity('extrude', 'rectangle'), { kind: 'sketch' as const, profileType: 'rectangle' as const, planeId: 'plane', points: [[-5, -5], [15, -5], [15, 15], [-5, 15]] });

    const face = intersectionProfileAtPoint([circle, rectangle], 'plane', [8, 0]);

    assert(face && face.length >= 4);
    face!.forEach((point) => {
        assert(Math.hypot(point[0], point[1]) <= 10.001);
        assert(point[0] >= -5.001 && point[0] <= 15.001 && point[1] >= -5.001 && point[1] <= 15.001);
    });
});
