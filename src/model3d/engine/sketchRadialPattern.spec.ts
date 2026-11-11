import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntity } from '../types';
import { convertSemanticShapeToConstrainedPolygon } from './sketchShapes';
import { computeSketchFaces } from './sketchFaces';
import { radialPatternCenterReferences, radialPatternCopies, radialPatternEntities, radialPatternStep, snapRadialPatternCenter } from './sketchRadialPattern';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('full-circle copies are equally spaced with the source and never duplicate it', () => {
    assert.equal(radialPatternStep({ count: 3, angle: 360 }), 90);
    const copies = radialPatternCopies([{ points: [[10, 0]], closed: false }], [0, 0], { count: 3, angle: 360 });
    close(copies[0].points[0][0], 0);
    close(copies[0].points[0][1], 10);
    close(copies[2].points[0][0], 0);
    close(copies[2].points[0][1], -10);
});

test('partial patterns include the final angle and rotate analytic ellipse rotation', () => {
    assert.equal(radialPatternStep({ count: 2, angle: 90 }), 45);
    const document = createDocument();
    const source = createEntity('sketch', 'source');
    source.name = '扇形 2';
    source.profileType = 'polygon';
    source.points = [[10, 0], [12, 0]];
    source.analyticCurves = { 0: { kind: 'ellipse', center: [10, 0], radiusX: 4, radiusY: 2, rotation: 0, orientation: 1, startAngle: 0, endAngle: Math.PI } };
    document.entities.push(source);
    const copies = radialPatternEntities(document, [source.id], [0, 0], { count: 2, angle: 90 });
    assert.equal(copies.length, 2);
    assert.deepEqual(copies.map((copy) => copy.name), ['扇形 3', '扇形 4']);
    assert.equal(copies[1].analyticCurves?.[0].kind, 'ellipse');
    if (copies[1].analyticCurves?.[0].kind === 'ellipse') close(copies[1].analyticCurves[0].rotation, Math.PI / 2);
    assert.deepEqual(source.points, [[10, 0], [12, 0]]);
});

test('pivot references contain real shape handles but no inferred centers or axis projections', () => {
    const source = createEntity('sketch', 'source');
    source.planeId = 'plane';
    const rectangle = createEntity('sketch', 'rectangle');
    Object.assign(rectangle, { planeId: 'plane', profileType: 'polygon' as const, standardShape: 'rectangle' as const,
        points: [[0, 0], [10, 0], [10, 10], [0, 10]], open: false });
    const references = radialPatternCenterReferences([source, rectangle], 'plane', ['source']);
    assert.deepEqual(references, rectangle.points);
    const nearInferredCenter = snapRadialPatternCenter([5.2, 5.1], references, 1);
    assert.deepEqual(nearInferredCenter.point, [5.2, 5.1]);
    assert.equal(nearInferredCenter.reference, null);
    const nearEndpoint = snapRadialPatternCenter([9.8, 0.2], references, 1);
    assert.deepEqual(nearEndpoint.point, [10, 0]);
    assert.deepEqual(nearEndpoint.reference, [10, 0]);
});

test('pivot snap chooses the nearest exact endpoint instead of projecting onto its axes', () => {
    const snapped = snapRadialPatternCenter([10.4, 7], [[10, 0], [30, 30]], 1);
    assert.deepEqual(snapped.point, [10.4, 7], 'vertical/horizontal guide projections are not pivot targets');
    assert.equal(snapped.reference, null);
});

test('30-degree regular-triangle pattern keeps an independent closed face for every copy', () => {
    const document = createDocument();
    const source = createEntity('sketch', 'triangle');
    Object.assign(source, { planeId: 'plane', profileType: 'regular' as const, points: [[0, 0], [10, 0]], sides: 3, open: false });
    convertSemanticShapeToConstrainedPolygon(source);
    document.entities.push(source);
    document.entities.push(...radialPatternEntities(document, [source.id], [0, 0], { count: 3, angle: 30 }));
    const faces = computeSketchFaces(document.entities, 'plane');
    document.entities.forEach((entity) => {
        const whole = faces.find((face) => face.entityIds.length === 1 && face.entityIds[0] === entity.id && face.points.length === 3);
        assert.ok(whole, `${entity.id} must keep its own closed triangle after overlapping pattern copies`);
        assert.deepEqual(whole.entityIds, [entity.id]);
    });
});
