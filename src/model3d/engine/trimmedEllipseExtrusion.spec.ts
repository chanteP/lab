import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDocument, createEntity, type ModelEntity, type Vec3 } from '../types';
import { buildEntityMesh } from './geometry';
import { buildMeshTopology } from './topology/MeshTopology';
import { bakeEntityGeometry } from './modeling/BakedGeometry';
import { initializeManifold } from './modeling/ManifoldKernel';
import { validateSolidGeometry } from './modeling/GeometryValidator';

await initializeManifold();

test('trimmed ellipse-line profile keeps both rectangular side faces editable', () => {
    for (const radiusY of [2.1, 3, 5, 9.9, 16.6, 30]) {
        const center = [5.1, -1.7] as [number, number], radiusX = 16.6;
        const leftX = center[0] - radiusX * Math.sqrt(1 - (center[1] / radiusY) ** 2);
        const rightY = center[1] + radiusY * Math.sqrt(1 - ((3.5 - center[0]) / radiusX) ** 2);
        const angle = (x: number, y: number) => (Math.atan2((y - center[1]) / radiusY, (x - center[0]) / radiusX) + Math.PI * 2) % (Math.PI * 2);
        const document = createDocument();
        document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: false });
        const body = Object.assign(createEntity('extrude', 'body'), {
            planeId: 'plane', profileType: 'polygon', open: false, depth: 10, position: [0, 0, 0] as Vec3,
            points: [[leftX, 0], [3.5, rightY], [3.5, 0]],
            analyticCurves: {
                0: { kind: 'ellipse' as const, center, radiusX, radiusY, rotation: 0, orientation: -1 as const, startAngle: angle(leftX, 0), endAngle: angle(3.5, rightY) },
            },
        });
        document.entities.push(body);
        const initial = buildEntityMesh(body, document);
        const topology = buildMeshTopology(initial.geometry, body.id, body, document);
        const sideFaces = topology.faces.filter((face) => face.planar && Math.abs(face.normal[1]) < 0.9);
        assert.equal(sideFaces.length, 2, `ellipse radiusY=${radiusY}`);
        assert.ok(topology.faces.some((face) => !face.planar), 'ellipse side must remain a curved surface');

        sideFaces.forEach((side) => {
            const mesh = buildEntityMesh(body, document);
            const current = buildMeshTopology(mesh.geometry, body.id, body, document);
            const face = current.faces.find((item) => item.id === side.id)!;
            const vertices: Vec3[] = [], indices: number[] = [];
            face.triangleIds.forEach((id) => current.triangles[id].renderVertices.forEach((renderVertex) => {
                vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, renderVertex).toArray());
                indices.push(indices.length);
            }));
            for (const distance of [2, -2, 1, -1, 0.5, -0.5]) {
                body.faceOffset = { normal: face.normal, distance, vertices, indices, faceIds: [face.id] };
                bakeEntityGeometry(body, document);
                const committed = buildEntityMesh(body, document);
                assert.equal(validateSolidGeometry(committed.geometry).valid, true, `${side.id} failed at ${distance}, radiusY=${radiusY}`);
                committed.geometry.dispose();
            }
        });
    }
});
