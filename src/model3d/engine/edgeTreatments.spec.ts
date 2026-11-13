import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyEdgeTreatments, resolveEdgeTreatment } from './modeling/EdgeTreatments';
import { initializeManifold } from './modeling/ManifoldKernel';
import type { EdgeTreatment, ModelEntity } from '../types';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { buildMeshTopology } from './topology/MeshTopology';
import { createDocument, createEntity } from '../types';

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

test('chamfer cuts only the referenced box edge and retains outer bounds', async () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const result = applyEdgeTreatments(base, [treatment]);
    result.computeBoundingBox();
    assert.ok(volume(result) < volume(base));
    assert.deepEqual(result.boundingBox!.min.toArray(), [-20, -20, -20]);
    assert.deepEqual(result.boundingBox!.max.toArray(), [20, 20, 20]);
    const { buildMeshTopology } = await import('./topology/MeshTopology');
    const { createDocument, createEntity } = await import('../types');
    const document = createDocument();
    const entity = createEntity('box', 'box');
    const topology = buildMeshTopology(result, 'box', entity, document);
    assert.equal(topology.faces.length, 7);
    assert.ok(topology.faces.every((face) => face.planar), 'chamfer must create a planar bevel, never a fillet surface');
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


test('a triangular-prism fillet is a true radius-r cylinder tangent to both non-orthogonal faces', () => {
    const radius = 4;
    const base = new THREE.CylinderGeometry(30, 30, 40, 3, 1, false);
    const document = createDocument();
    const entity = createEntity('cylinder', 'prism');
    const topology = buildMeshTopology(base, entity.id, entity, document);
    const edge = topology.logicalEdges.find((item) => {
        if (item.faceIds.length !== 2 || item.points.length < 2) return false;
        return Math.abs(item.points[0][1] - item.points[item.points.length - 1][1]) > 30;
    })!;
    const a = new THREE.Vector3(...edge.points[0]);
    const b = new THREE.Vector3(...edge.points[edge.points.length - 1]);
    const normals = edge.faceIds.map((id) => new THREE.Vector3(...topology.faces.find((face) => face.id === id)!.normal).normalize());
    assert.ok(Math.abs(normals[0].dot(normals[1])) > 0.1, 'fixture must use a non-right dihedral angle');
    const dot = normals[0].dot(normals[1]);
    const center = a.clone().add(normals[0].clone().add(normals[1]).multiplyScalar(-radius / (1 + dot)));
    const result = applyEdgeTreatments(base, [{
        id: 'prism-edge', type: 'fillet', size: radius,
        edge: { a: a.toArray(), b: b.toArray(), normals: normals.map((normal) => normal.toArray()) },
    }]);
    const position = result.attributes.position;
    const indices = result.index ? Array.from(result.index.array) : [];
    const hasVertex = (expected: THREE.Vector3) => indices.some((index) => new THREE.Vector3().fromBufferAttribute(position, index).distanceTo(expected) < 2e-4);
    const tangentPoints = normals.map((normal) => center.clone().addScaledVector(normal, radius));
    const arcMiddle = center.clone().add(normals[0].clone().add(normals[1]).normalize().multiplyScalar(radius));
    for (const axialPoint of [a, b]) {
        const offset = axialPoint.clone().sub(a);
        tangentPoints.forEach((point) => assert.ok(hasVertex(point.clone().add(offset)), 'both face tangency points must be present'));
        assert.ok(hasVertex(arcMiddle.clone().add(offset)), 'the circular arc midpoint must lie on the non-orthogonal edge fillet');
    }
    assert.equal(validateSolidGeometry(result).valid, true);
    base.dispose(); result.dispose();
});

test('a full-width edge chamfer produces a closed right triangular prism', () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const result = applyEdgeTreatments(base, [{ ...treatment, size: 40 }]);
    assert.equal(validateSolidGeometry(result).valid, true);
    assert.ok(Math.abs(volume(result) - 32000) < 1e-4);
    assert.deepEqual(result.boundingBox!.max.toArray(), [20, 20, 20]);
    base.dispose(); result.dispose();
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

test('edge treatments follow A/B/C face drags instead of remaining at the old edge', async () => {
    const { buildEntityMesh } = await import('./geometry');
    const { createDocument, createEntity } = await import('../types');
    for (const axis of [0, 1, 2] as const) {
        const document = createDocument();
        const entity = createEntity('box', 'box');
        entity.edgeTreatments = [treatment];
        const normal: [number, number, number] = [0, 0, 0];
        normal[axis] = 1;
        const vertices: [number, number, number][] = axis === 0
            ? [[20, -20, -20], [20, 20, -20], [20, 20, 20], [20, -20, 20]]
            : axis === 1 ? [[-20, 20, -20], [20, 20, -20], [20, 20, 20], [-20, 20, 20]]
            : [[-20, -20, 20], [20, -20, 20], [20, 20, 20], [-20, 20, 20]];
        entity.faceOffset = { normal, distance: 10, vertices, indices: [0, 1, 2, 0, 2, 3], faceIds: [`face-${axis}`] };
        const result = buildEntityMesh(entity, document);

        const size: [number, number, number] = [40, 40, 40];
        size[axis] += 10;
        const center: [number, number, number] = [0, 0, 0];
        center[axis] = 5;
        const base = new THREE.BoxGeometry(...size);
        base.translate(...center);
        const movedTreatment = JSON.parse(JSON.stringify(treatment)) as EdgeTreatment;
        if (axis === 2) movedTreatment.edge.b[axis] += 10;
        else {
            movedTreatment.edge.a[axis] += 10;
            movedTreatment.edge.b[axis] += 10;
        }
        const expected = applyEdgeTreatments(base, [movedTreatment]);
        assert.ok(Math.abs(volume(result.geometry) - volume(expected)) < 1e-5, `face ${axis} produced a joined old/new body`);
        result.geometry.dispose(); expected.dispose(); base.dispose();
    }
});
