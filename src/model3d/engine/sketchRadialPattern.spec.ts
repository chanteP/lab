import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntity } from '../types';
import { radialPatternCopies, radialPatternEntities, radialPatternStep } from './sketchRadialPattern';

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
