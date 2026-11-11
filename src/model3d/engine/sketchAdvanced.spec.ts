import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clipProfileToSector, clockwiseRotation, entityProfileParts, hitProfilePart, profilePartsCenter, sketchOperationPoints, sketchTransformCenter, transformOperationCenter,
    radialSymmetry, reflection, regenerateProfilePart, scaleProfilePart, sectorAtPoint, snapRotationToGuides, snapScaleToGuides, snapTranslationToGuides, supportsMirrorSymmetry, symmetryGuideEntities, symmetryRayAngles, symmetryTransform,
} from './sketchAdvanced';
import { createEntity, type ModelEntity, type Point2, type SketchProfilePart } from '../types';
import { computeSketchFaces } from './sketchFaces';

const closePoint = (actual: Point2, expected: Point2) => {
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-7, `${actual} != ${expected}`);
};

test('symmetry guides expose every evaluated point instead of only source editor handles', () => {
    const source: SketchProfilePart[] = [{ points: [[0, 0], [10, 0]], closed: false, editor: { type: 'line', source: [[0, 0], [10, 0]] } }];
    const evaluated = radialSymmetry(source, 4, 0, 0, 'rotate');
    const guides = symmetryGuideEntities(evaluated, 'plane');
    assert.equal(guides.length, 4);
    assert.equal(guides.flatMap((entity) => entity.points || []).length, evaluated.reduce((sum, part) => sum + part.points.length, 0));
    assert.ok(guides.every((entity) => entity.planeId === 'plane' && entity.profileType === 'polygon'));
});

test('transform gestures recover translation, rotation and scale from operation point guides', () => {
    const translated = snapTranslationToGuides([[0, 0]], [4.9, 0], () => [5, 0]);
    closePoint(translated.delta, [5, 0]);

    const rotated = snapRotationToGuides([[10, 0]], [0, 0], 40, () => [0, 10]);
    assert.ok(Math.abs(rotated.degrees - 90) < 1e-7);

    const scaled = snapScaleToGuides([[10, 0]], [0, 0], 1.9, () => [20, 0]);
    assert.ok(Math.abs(scaled.scale - 2) < 1e-7);
});

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

test('single centered shapes use their semantic center for rotate and scale transforms', () => {
    const circle = Object.assign(createEntity('sketch', 'circle'), { profileType: 'circle' as const, points: [[20, 10], [25, 10]], sectorAngle: 90 });
    const parts = entityProfileParts(circle);
    assert.notDeepEqual(profilePartsCenter(parts), [20, 10]);
    assert.deepEqual(sketchTransformCenter([circle], parts), [20, 10]);
    const other = Object.assign(createEntity('sketch', 'other'), { profileType: 'circle' as const, points: [[0, 0], [5, 0]] });
    assert.deepEqual(sketchTransformCenter([circle, other], parts), profilePartsCenter(parts));
});

test('transform source points include semantic vertices and curve controls', () => {
    const entity = Object.assign(createEntity('sketch', 'curve'), {
        profileType: 'polygon' as const, points: [[0, 0], [10, 0], [10, 10]] as Point2[],
        curves: { 0: { c1: [3, 2] as Point2, c2: [7, 2] as Point2 } },
    });
    const points = sketchOperationPoints(entity);
    assert.ok(points.some((point) => point[0] === 3 && point[1] === 2));
    assert.ok(points.some((point) => point[0] === 7 && point[1] === 2));
    assert.ok(points.some((point) => point[0] === 10 && point[1] === 10));
});

test('edge and point selections determine the transform pivot before shape bounds', () => {
    const entity = Object.assign(createEntity('sketch', 'line'), { profileType: 'line' as const, points: [[4, 5], [9, 12]] as Point2[], open: true });
    const parts = entityProfileParts(entity);
    assert.deepEqual(transformOperationCenter([entity], parts, [{ entityId: entity.id, index: 0 }], []), [4, 5]);
    assert.deepEqual(transformOperationCenter([entity], parts, [{ entityId: entity.id, index: 0 }], [{ entityId: entity.id, index: 1 }]), [9, 12]);
    assert.deepEqual(transformOperationCenter([entity], parts, [], [{ entityId: entity.id, index: 1 }]), [9, 12]);
    assert.deepEqual(transformOperationCenter([entity], parts, [{ entityId: entity.id, index: 0 }], [{ entityId: 'other', index: 0 }]), [4, 5]);
});
