import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initializeManifold } from './modeling/ManifoldKernel';
import { bakeEntityGeometry } from './modeling/BakedGeometry';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { buildEntityMesh } from './geometry';
import { buildMeshTopology } from './topology/MeshTopology';
import { reconcileTopology } from './topology/TopologyTracker';
import { createDocument, createEntity, type ModelEntity, type Vec3 } from '../types';

await initializeManifold();

test('the current circle-rectangle union supports six signed edits on every available planar face', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: false });
    const shared = { parentId: null, color: '#9a9a9a', position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3, sideMode: 'one' as const, direction: 1 as const, sectorAngle: 360, curves: {}, planeId: 'plane', open: false };
    const circle = { ...shared, id: 'circle', name: 'circle', kind: 'extrude', profileType: 'circle', points: [[-51.9, 25.5], [-10.6, 0]], depth: 50.83, visible: false } as ModelEntity;
    const rectangle = { ...shared, id: 'rectangle', name: 'rectangle', kind: 'extrude', profileType: 'rectangle', points: [[-35.4, 8.7], [29.8, 8.7], [29.8, -46.5], [-35.4, -46.5]], depth: 78.18, visible: false } as ModelEntity;
    const union = { ...shared, id: 'union', name: 'union', kind: 'boolean', operation: 'union', operands: ['circle', 'rectangle'], visible: true } as ModelEntity;
    document.entities.push(circle, rectangle, union);
    const originalMesh = buildEntityMesh(union, document);
    const originalTopology = buildMeshTopology(originalMesh.geometry, union.id, union, document);
    const planarFaces = originalTopology.faces.filter((face) => face.planar);
    assert.equal(planarFaces.length, 7);
    assert(originalTopology.faces.some((face) => !face.planar), 'the cylindrical side remains explicitly non-planar');

    planarFaces.forEach((initialFace) => {
        const body = { ...union, meshGeometry: undefined } as ModelEntity;
        let mesh = buildEntityMesh(body, document);
        let topology = buildMeshTopology(mesh.geometry, body.id, body, document);
        let face = topology.faces.find((item) => item.id === initialFace.id)!;
        for (const distance of [2, -2, 1, -1, 0.5, -0.5]) {
            const vertices: Vec3[] = [], indices: number[] = [];
            face.triangleIds.forEach((id) => topology.triangles[id].renderVertices.forEach((renderVertex) => {
                vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, renderVertex).toArray());
                indices.push(indices.length);
            }));
            body.faceOffset = { normal: face.normal, distance, vertices, indices, faceIds: [face.id] };
            bakeEntityGeometry(body, document);
            mesh = buildEntityMesh(body, document);
            const validation = validateSolidGeometry(mesh.geometry);
            assert(validation.valid, `${initialFace.id}@${distance}: ${validation.errors.join(', ')}`);
            const next = buildMeshTopology(mesh.geometry, body.id, body, document);
            topology = reconcileTopology(topology, next, body.faceEdit);
            assert(!topology.changes.faces.some((change) => change.kind === 'ambiguous'));
            face = topology.faces.find((item) => item.id === initialFace.id)!;
            assert(face, `${initialFace.id} lost its identity at ${distance}`);
        }
    });
});
