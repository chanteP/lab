import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initializeManifold } from './modeling/ManifoldKernel';
import { evaluateFaceExtrusion } from './modeling/FaceExtrusion';
import { bakeEntityGeometry } from './modeling/BakedGeometry';
import { buildEntityMesh } from './geometry';
import { buildMeshTopology } from './topology/MeshTopology';
import { reconcileTopology } from './topology/TopologyTracker';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { createDocument, createEntity, type ModelEntity, type Vec3 } from '../types';
import type { BodyTopology, LogicalFace } from './topology/types';

await initializeManifold();

function faceArea(topology: BodyTopology, face: LogicalFace, geometry: THREE.BufferGeometry) {
    return face.triangleIds.reduce((area, id) => {
        const triangle = topology.triangles[id];
        const [a, b, c] = triangle.renderVertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, vertex));
        return area + b.sub(a).cross(c.sub(a)).length() / 2;
    }, 0);
}
function offsetForFace(topology: BodyTopology, face: LogicalFace, geometry: THREE.BufferGeometry, distance: number) {
    const vertices: Vec3[] = [], indices: number[] = [];
    face.triangleIds.forEach((id) => topology.triangles[id].renderVertices.forEach((renderVertex) => {
        vertices.push(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, renderVertex).toArray());
        indices.push(indices.length);
    }));
    return { normal: face.normal, distance, vertices, indices, faceIds: [face.id] };
}
function volume(geometry: THREE.BufferGeometry) {
    const p = geometry.attributes.position, index = geometry.index;
    let result = 0;
    for (let cursor = 0; cursor < (index?.count || p.count); cursor += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(cursor) : cursor);
        const b = new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(cursor + 1) : cursor + 1);
        const c = new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(cursor + 2) : cursor + 2);
        result += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(result);
}

test('box-cylinder union preserves volume, position and valid topology through repeated signed drags', () => {
    const document = createDocument();
    const box = Object.assign(createEntity('box', 'box'), { width: 30, height: 50, depth: 30, position: [0, 0, 0] as Vec3 });
    const cylinder = Object.assign(createEntity('cylinder', 'cylinder'), { radius: 12, height: 50, position: [15, 0, 0] as Vec3 });
    const union = Object.assign(createEntity('box', 'union'), { kind: 'boolean' as const, operation: 'union' as const, operands: ['box', 'cylinder'] as [string, string], position: [0, 0, 0] as Vec3 });
    document.entities.push(box, cylinder, union);
    const initialMesh = buildEntityMesh(union, document);
    const initialTopology = buildMeshTopology(initialMesh.geometry, union.id, union, document);
    const initialVolume = volume(initialMesh.geometry);

    initialTopology.faces.filter((face) => face.planar).forEach((initialFace) => {
        const body = { ...union, meshGeometry: undefined } as ModelEntity;
        let mesh = buildEntityMesh(body, document);
        let topology = buildMeshTopology(mesh.geometry, body.id, body, document);
        const faceId = initialFace.id;
        const area = faceArea(topology, topology.faces.find((face) => face.id === faceId)!, mesh.geometry);
        const initialOffset = (topology.faces.find((face) => face.id === faceId)!.domain as { offset: number }).offset;
        const distances = [0.8, -0.3, 1, -1];
        const expectedDisplacement = distances.reduce((sum, distance) => sum + distance, 0);
        for (const distance of distances) {
            const face = topology.faces.find((item) => item.id === faceId);
            assert(face, `face ${faceId} must remain addressable after signed edits`);
            body.faceOffset = offsetForFace(topology, face, mesh.geometry, distance);
            try { bakeEntityGeometry(body, document); } catch (error) { throw new Error(`${faceId}@${distance}: ${error instanceof Error ? error.message : error}`); }
            mesh = buildEntityMesh(body, document);
            const next = buildMeshTopology(mesh.geometry, body.id, body, document);
            topology = reconcileTopology(topology, next, body.faceEdit);
            assert(validateSolidGeometry(mesh.geometry).valid, `${faceId} failed at ${distance}`);
            assert(!topology.changes.faces.some((change) => change.kind === 'ambiguous'), `${faceId} produced an ambiguous topology binding`);
        }
        const finalFace = topology.faces.find((face) => face.id === faceId)!;
        assert(Math.abs((finalFace.domain as { offset: number }).offset - (initialOffset + expectedDisplacement)) < 1e-4);
        assert(Math.abs(volume(mesh.geometry) - (initialVolume + area * expectedDisplacement)) < 0.05, `unexpected volume after dragging ${faceId}`);
    });
});
