import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntity, type ModelEntity } from '../types';
import { buildEntityMesh } from './geometry';
import { detachFeatureReferences } from './modeling/FeatureReferences';
import { initializeManifold } from './modeling/ManifoldKernel';

await initializeManifold();

function documentWithPlane() {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    return document;
}

test('a committed extrusion uses its own profile snapshot rather than live sketch geometry', () => {
    const document = documentWithPlane();
    const sketch = Object.assign(createEntity('sketch', 'sketch'), { planeId: 'plane', profileType: 'rectangle' as const, points: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] });
    const body = Object.assign(createEntity('extrude', 'body'), {
        planeId: 'plane', profileId: sketch.id, profileType: 'rectangle' as const, points: sketch.points.map((point) => [...point]), depth: 10, position: [0, 0, 0] as [number, number, number],
    });
    document.entities.push(sketch, body);
    const before = buildEntityMesh(body, document).geometry.attributes.position.array.slice();
    sketch.points = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const after = buildEntityMesh(body, document).geometry.attributes.position.array.slice();
    assert.deepEqual(before, after);
});

test('deleting a source sketch detaches History without deleting the baked body', () => {
    const document = documentWithPlane();
    const sketch = Object.assign(createEntity('sketch', 'sketch'), { planeId: 'plane', profileType: 'rectangle' as const, points: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] });
    const body = Object.assign(createEntity('extrude', 'body'), {
        planeId: 'plane', profileId: sketch.id, profileType: 'rectangle' as const, points: sketch.points.map((point) => [...point]), depth: 10, position: [0, 0, 0] as [number, number, number],
    });
    document.entities.push(sketch, body);
    detachFeatureReferences(document, [sketch.id]);
    document.entities = document.entities.filter((entity) => entity.id !== sketch.id);
    assert.equal(body.profileId, undefined);
    assert(body.meshGeometry?.positions.length);
    assert(buildEntityMesh(body, document).geometry.attributes.position.count > 0);
});

test('deleting a Boolean operand leaves an independent baked result', () => {
    const document = createDocument();
    const box = Object.assign(createEntity('box', 'box'), { position: [0, 0, 0] as [number, number, number] });
    const cylinder = Object.assign(createEntity('cylinder', 'cylinder'), { position: [0, 20, 0] as [number, number, number] });
    const result = Object.assign(createEntity('box', 'result'), { kind: 'boolean' as const, operation: 'union' as const, operands: ['box', 'cylinder'] as [string, string], position: [0, 0, 0] as [number, number, number] });
    document.entities.push(box, cylinder, result);
    detachFeatureReferences(document, [box.id]);
    document.entities = document.entities.filter((entity) => entity.id !== box.id);
    assert.equal(result.operands, undefined);
    assert(result.meshGeometry?.positions.length);
    assert(buildEntityMesh(result, document).geometry.attributes.position.count > 0);
});
