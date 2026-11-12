import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { initializeManifold } from './modeling/ManifoldKernel';
import { evaluateRevolve } from './modeling/Revolve';
import { createDocument, createEntity } from '../types';
import { validateSolidGeometry } from './modeling/GeometryValidator';

before(async () => { await initializeManifold(); });

function fixture() {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XY', kind: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], visible: true });
    const profile = createEntity('sketch', 'profile');
    profile.planeId = 'plane';
    profile.profileType = 'rectangle';
    profile.points = [[1, 1], [2, 1], [2, 2], [1, 2]];
    profile.open = false;
    document.entities.push(profile);
    return { document, profile };
}

test('revolve creates a closed tube around either sketch axis', () => {
    const { document, profile } = fixture();
    for (const axis of ['x', 'y'] as const) {
        const geometry = evaluateRevolve(profile, document, axis, 360);
        const validation = validateSolidGeometry(geometry);
        assert(validation.valid, validation.errors.join(', '));
        assert(Math.abs(validation.volume - Math.PI * 3) < 0.03, `${axis}: ${validation.volume}`);
    }
});

test('partial revolve preserves the requested angular fraction', () => {
    const { document, profile } = fixture();
    const geometry = evaluateRevolve(profile, document, 'y', 90);
    const value = validateSolidGeometry(geometry).volume;
    assert(Math.abs(value - Math.PI * 3 / 4) < 0.03);
});

test('elevation and angles above one turn create a continuous helical solid', () => {
    const { document, profile } = fixture();
    const geometry = evaluateRevolve(profile, document, 'y', 720, 2);
    const validation = validateSolidGeometry(geometry);
    assert(validation.valid, validation.errors.join(', '));
    assert(Math.abs(validation.volume - Math.PI * 6) < 0.1, `volume=${validation.volume}`);
    assert(Math.abs(geometry.boundingBox!.min.z - 1) < 1e-6);
    assert(Math.abs(geometry.boundingBox!.max.z - 4) < 0.03);
});

test('a full-turn profile may sit across the revolve axis', () => {
    const { document, profile } = fixture();
    profile.points = [[-1, 1], [2, 1], [2, 2], [-1, 2]];
    const geometry = evaluateRevolve(profile, document, 'y', 360);
    const validation = validateSolidGeometry(geometry);
    assert(validation.valid, validation.errors.join(', '));
    assert(validation.volume > 0);
});


test('an arbitrary in-plane offset axis produces the same physical swept volume', () => {
    const { document, profile } = fixture();
    const geometry = evaluateRevolve(profile, document, { origin: [0, 1], direction: [1, 0] }, 90);
    const validation = validateSolidGeometry(geometry);
    assert(validation.valid, validation.errors.join(', '));
    assert(Math.abs(validation.volume - Math.PI / 4) < 0.03, `volume=${validation.volume}`);
    geometry.computeBoundingBox();
    assert(Math.abs(geometry.boundingBox!.min.y - 1) < 1e-6);
    assert(Math.abs(geometry.boundingBox!.max.y - 2) < 1e-6);
});

test('custom Y axis matches the built-in Y axis', () => {
    const { document, profile } = fixture();
    const geometry = evaluateRevolve(profile, document, { origin: [0, 0], direction: [0, 1] }, 90);
    assert(Math.abs(validateSolidGeometry(geometry).volume - Math.PI * 3 / 4) < 0.03);
});


test('clockwise sketch input is normalized before kernel revolve', () => {
    const { document, profile } = fixture();
    profile.points = [[3.2, 7.6], [11.2, 7.6], [11.2, -4.4], [3.2, -4.4]];
    const geometry = evaluateRevolve(profile, document, { origin: [0, 0], direction: [0, 1] }, 360);
    const validation = validateSolidGeometry(geometry);
    assert(validation.valid, validation.errors.join(', '));
    assert(validation.volume > 0);
});


test('a partial revolve supports a profile on the negative side of an arbitrary axis', () => {
    const { document, profile } = fixture();
    const geometry = evaluateRevolve(profile, document, { origin: [0, 2], direction: [1, 0] }, 90);
    const validation = validateSolidGeometry(geometry);
    assert(validation.valid, validation.errors.join(', '));
    assert(Math.abs(validation.volume - Math.PI / 4) < 0.03, `volume=${validation.volume}`);
});
