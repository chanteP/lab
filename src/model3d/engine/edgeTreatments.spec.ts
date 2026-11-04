import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyEdgeTreatments, resolveEdgeTreatment } from './modeling/EdgeTreatments';
import { initializeManifold } from './modeling/ManifoldKernel';
import type { EdgeTreatment, ModelEntity } from '../types';
import type { GeometryAnchor } from './viewport/GeometrySelector';

await initializeManifold();

const treatment: EdgeTreatment = {
    id: 'edge', type: 'chamfer', size: 3,
    edge: { a: [20, 20, -20], b: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0]] },
};

function volume(geometry: THREE.BufferGeometry) {
    const position = geometry.attributes.position, index = geometry.index;
    let sum = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let offset = 0; offset < (index?.count || position.count); offset += 3) {
        const ids = [0, 1, 2].map((corner) => index ? index.getX(offset + corner) : offset + corner);
        a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2]);
        sum += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(sum);
}

test('chamfer cuts only the referenced box edge and retains outer bounds', () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const result = applyEdgeTreatments(base, [treatment]);
    result.computeBoundingBox();
    assert.ok(volume(result) < volume(base));
    assert.deepEqual(result.boundingBox!.min.toArray(), [-20, -20, -20]);
    assert.deepEqual(result.boundingBox!.max.toArray(), [20, 20, 20]);
    base.dispose(); result.dispose();
});

test('fillet produces a curved edge with more render vertices than chamfer', () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const chamfer = applyEdgeTreatments(base, [treatment]);
    const fillet = applyEdgeTreatments(base, [{ ...treatment, type: 'fillet' }]);
    assert.ok(fillet.attributes.position.count > chamfer.attributes.position.count);
    assert.ok(volume(fillet) < volume(base));
    base.dispose(); chamfer.dispose(); fillet.dispose();
});

test('a generated parallel edge resolves to its original treatment', () => {
    const entity = { edgeTreatments: [treatment] } as ModelEntity;
    const anchor = { localEdge: { a: [18, 20, -20], b: [18, 20, 20], normals: treatment.edge.normals } } as GeometryAnchor;
    assert.equal(resolveEdgeTreatment(entity, anchor)?.id, 'edge');
});

test('baking a body does not apply its parametric edge treatment twice', async () => {
    const { buildEntityMesh } = await import('./geometry');
    const { bakeEntityGeometry } = await import('./modeling/BakedGeometry');
    const { createDocument, createEntity } = await import('../types');
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.edgeTreatments = [treatment];
    const before = buildEntityMesh(entity, document);
    bakeEntityGeometry(entity, document);
    const after = buildEntityMesh(entity, document);
    assert.ok(Math.abs(volume(before.geometry) - volume(after.geometry)) < 1e-6);
    before.geometry.dispose(); after.geometry.dispose();
});
