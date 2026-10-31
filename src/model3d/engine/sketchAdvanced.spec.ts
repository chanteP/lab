import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clipProfileToSector, clockwiseRotation, entityProfileParts, hitProfilePart,
    radialSymmetry, reflection, regenerateProfilePart, scaleProfilePart, sectorAtPoint, supportsMirrorSymmetry, symmetryRayAngles, symmetryTransform,
} from './sketchAdvanced';
import type { ModelEntity, Point2, SketchProfilePart } from '../types';
import { computeSketchFaces } from './sketchFaces';

const closePoint = (actual: Point2, expected: Point2) => {
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-7, `${actual} != ${expected}`);
};

test('clockwise sectors start at the positive Y axis and honor offset', () => {
    assert.equal(sectorAtPoint([1, 1], 4, 0), 0);
    assert.equal(sectorAtPoint([1, -1], 4, 0), 1);
    assert.equal(sectorAtPoint([0, 1], 4, 45), 3);
    closePoint(clockwiseRotation(90)([0, 1]), [1, 0]);
    closePoint(reflection(0)([1, 2]), [-1, 2]);
});

test('alternating axial transforms make every divider a mirror', () => {
    const source: Point2 = [0.2, 1];
    const first = symmetryTransform(0, 4, 'mirror')(source);
    const second = symmetryTransform(1, 4, 'mirror')(source);
    closePoint(second, [0.2, -1]);
    const reflectedBack = reflection(90)(second);
    closePoint(reflectedBack, first);
});

test('closed and open profiles are clipped to the selected infinite wedge', () => {
    const square: SketchProfilePart = { points: [[-2, -2], [2, -2], [2, 2], [-2, 2]], closed: true };
    const clipped = clipProfileToSector(square, 4, 0, 0);
    assert.equal(clipped.length, 1);
    assert.ok(clipped[0].points.every(([x, y]) => x >= -1e-7 && y >= -1e-7));
    const line: SketchProfilePart = { points: [[-2, 1], [2, 1]], closed: false };
    const segment = clipProfileToSector(line, 4, 0, 0);
    assert.equal(segment.length, 1);
    closePoint(segment[0].points[0], [0, 1]);
    closePoint(segment[0].points[1], [2, 1]);
});

test('radial result contains only transformed copies of selected-sector content', () => {
    const source: SketchProfilePart = { points: [[1, 1], [2, 1], [2, 2], [-2, 2]], closed: true };
    const rotated = radialSymmetry([source], 4, 0, 0, 'rotate');
    assert.equal(rotated.length, 4);
    assert.ok(rotated[0].points.every(([x, y]) => x >= -1e-7 && y >= -1e-7));
    assert.ok(rotated[1].points.every(([x, y]) => x >= -1e-7 && y <= 1e-7));
    const mirrored = radialSymmetry([source], 4, 0, 0, 'mirror');
    assert.equal(mirrored.length, 4);
});

test('compound profiles stay independent and remain hit-testable', () => {
    const parts = entityProfileParts({ parts: [{ points: [[0, 0], [2, 0], [2, 2]], closed: true }] } as any);
    assert.equal(parts.length, 1);
    assert.equal(hitProfilePart(parts[0], [1.5, 0.5]), true);
    assert.equal(hitProfilePart(parts[0], [-1, -1]), false);
    parts[0].points[0][0] = 9;
    assert.equal(hitProfilePart(parts[0], [1.5, 0.5]), true);
});

test('ray count matches symmetry count without opposite duplicates', () => {
    assert.deepEqual(symmetryRayAngles(2, 0), [0, 180]);
    assert.deepEqual(symmetryRayAngles(3, 0), [0, 120, 240]);
    assert.deepEqual(symmetryRayAngles(4, 0), [0, 90, 180, 270]);
    assert.deepEqual(symmetryRayAngles(3, 30), [30, 150, 270]);
});

test('compound closed parts become direct faces without pairwise restitching', () => {
    const entity = {
        id: 'compound', kind: 'sketch', planeId: 'plane', profileType: 'polygon', points: [],
        parts: Array.from({ length: 3 }, (_, index) => ({
            closed: true,
            points: [[index * 10, 0], [index * 10 + 2, 0], [index * 10 + 2, 2], [index * 10, 2]],
        })),
    } as ModelEntity;
    const faces = computeSketchFaces([entity], 'plane');
    assert.equal(faces.length, 3);
    assert.deepEqual(faces[0].points[0], [0, 0]);
});

test('only even wedge counts support mirror symmetry on every divider', () => {
    assert.equal(supportsMirrorSymmetry(2), true);
    assert.equal(supportsMirrorSymmetry(3), false);
    assert.equal(supportsMirrorSymmetry(4), true);
    assert.equal(supportsMirrorSymmetry(24), true);
    const part: SketchProfilePart = { points: [[1, 1], [2, 1], [1, 2]], closed: true };
    assert.deepEqual(radialSymmetry([part], 3, 0, 0, 'mirror'), radialSymmetry([part], 3, 0, 0, 'rotate'));
});

test('selection editing retains semantic center and radius handles', () => {
    const entity = {
        id: 'circle', kind: 'sketch', profileType: 'circle', points: [[0, 0], [10, 0]], open: false,
    } as ModelEntity;
    const part = entityProfileParts(entity)[0];
    assert.equal(part.editor?.type, 'circle');
    const scaled = scaleProfilePart(part, [0, 0], 1.5);
    assert.deepEqual(scaled.editor?.source, [[0, 0], [15, 0]]);
    scaled.editor!.source[1] = [0, 20];
    const regenerated = regenerateProfilePart(scaled.editor!, true);
    assert.equal(regenerated.points.length, 64);
    assert.ok(regenerated.points.every(([x, y]) => Math.abs(Math.hypot(x, y) - 20) < 1e-7));
});
