import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMeshTopology } from './topology/MeshTopology';
import { reconcileTopology } from './topology/TopologyTracker';
import { expandTangentEdges } from './topology/TopologySelection';
import { createDocument, createEntity } from '../types';

function topology(geometry: THREE.BufferGeometry, kind: 'box' | 'cylinder' = 'box') {
    const entity = Object.assign(createEntity(kind, 'body'), { position: [0, 0, 0] as [number, number, number], radius: kind === 'cylinder' ? 5 : undefined });
    return buildMeshTopology(geometry, entity.id, entity, createDocument());
}

test('box topology exposes six logical faces and twelve sharp edges without triangulation diagonals', () => {
    const result = topology(new THREE.BoxGeometry(10, 10, 10));
    assert.equal(result.faces.length, 6);
    assert.equal(result.logicalEdges.length, 12);
    assert(result.logicalEdges.every((edge) => edge.kind === 'sharp' && edge.faceIds.length === 2));
});

test('subdivided planar faces and straight edges retain their logical identity', () => {
    const result = topology(new THREE.BoxGeometry(10, 10, 10, 3, 3, 3));
    assert.equal(result.faces.length, 6);
    assert.equal(result.logicalEdges.length, 12);
    assert(result.logicalEdges.every((edge) => edge.segments.length === 3));
});

test('cylinder side crosses the render seam without including either cap', () => {
    const result = topology(new THREE.CylinderGeometry(5, 5, 10, 32), 'cylinder');
    assert.equal(result.faces.length, 3);
    assert.equal(result.logicalEdges.length, 2);
    assert.equal(result.faces.filter((face) => face.domain.kind === 'cylinder').length, 1);
    assert(result.logicalEdges.every((edge) => edge.segments.length === 32));
});


test('triangles sharing only one vertex are not face-adjacent', () => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1),
    ]);
    assert.equal(topology(geometry).faces.length, 2);
});

test('tangent edge expansion terminates on a closed circular chain', () => {
    const result = topology(new THREE.CylinderGeometry(5, 5, 10, 32), 'cylinder');
    const expanded = expandTangentEdges(result, [result.logicalEdges[0]]);
    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].segments.length, 32);
});

test('face and edge IDs survive triangle reordering', () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const previous = topology(geometry);
    previous.vertices.forEach((vertex, index) => { vertex.id = `persisted-${index}`; });
    previous.triangles.forEach((triangle) => { triangle.vertexIds = triangle.vertexIds.map((id) => `persisted-${id.slice(1)}`) as [string, string, string]; });
    previous.rawEdges.forEach((edge) => { edge.vertexIds = edge.vertexIds.map((id) => `persisted-${id.slice(1)}`) as [string, string]; });
    previous.logicalEdges.forEach((edge) => { edge.vertexIds = edge.vertexIds.map((id) => `persisted-${id.slice(1)}`) as [string, string]; });
    previous.faces.forEach((face) => { face.boundaryLoops = face.boundaryLoops.map((loop) => loop.map((id) => `persisted-${id.slice(1)}`)); });
    const reordered = geometry.clone();
    const old = reordered.index!.array;
    for (let triangle = 0; triangle < old.length / 6; triangle++) {
        const a = triangle * 6, b = a + 3;
        for (let corner = 0; corner < 3; corner++) [old[a + corner], old[b + corner]] = [old[b + corner], old[a + corner]];
    }
    const next = reconcileTopology(previous, topology(reordered));
    assert.deepEqual(new Set(next.faces.map((face) => face.id)), new Set(previous.faces.map((face) => face.id)));
    assert.deepEqual(new Set(next.logicalEdges.map((edge) => edge.id)), new Set(previous.logicalEdges.map((edge) => edge.id)));
});

test('large indexed geometry uses Uint32 and keeps logical face selection above Uint16 limits', () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10, 110, 110, 110);
    assert(geometry.attributes.position.count > 65535);
    assert(geometry.index!.array instanceof Uint32Array);
    const result = topology(geometry);
    assert.equal(result.faces.length, 6);
    assert.equal(result.logicalEdges.length, 12);
});
