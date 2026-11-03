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

test('release preserves the exact preview geometry, sharp normals and topology without waiting for another edit', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: false });
    const shared = { parentId: null, color: '#9a9a9a', position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3, sideMode: 'one' as const, direction: 1 as const, sectorAngle: 360, curves: {}, planeId: 'plane', open: false };
    const circle = { ...shared, id: 'circle', name: 'circle', kind: 'extrude', profileType: 'circle', points: [[-51.9, 25.5], [-10.6, 0]], depth: 50.83, visible: false } as ModelEntity;
    const rectangle = { ...shared, id: 'rectangle', name: 'rectangle', kind: 'extrude', profileType: 'rectangle', points: [[-35.4, 8.7], [29.8, 8.7], [29.8, -46.5], [-35.4, -46.5]], depth: 78.18, visible: false } as ModelEntity;
    const body = { ...shared, id: 'union', name: 'union', kind: 'boolean', operation: 'union', operands: ['circle', 'rectangle'], visible: true } as ModelEntity;
    document.entities.push(circle, rectangle, body);
    const initial = buildEntityMesh(body, document);
    const topology = buildMeshTopology(initial.geometry, body.id, body, document);
    const face = topology.faces.find((item) => item.planar)!;
    const vertices: Vec3[] = [], indices: number[] = [];
    face.triangleIds.forEach((id) => topology.triangles[id].renderVertices.forEach((renderVertex) => {
        vertices.push(new THREE.Vector3().fromBufferAttribute(initial.geometry.attributes.position, renderVertex).toArray());
        indices.push(indices.length);
    }));
    body.faceOffset = { normal: face.normal, distance: 2, vertices, indices, faceIds: [face.id] };

    const preview = buildEntityMesh(body, document);
    const previewTopology = buildMeshTopology(preview.geometry, body.id, body, document);
    bakeEntityGeometry(body, document);
    const committed = buildEntityMesh(body, document);
    const committedTopology = buildMeshTopology(committed.geometry, body.id, body, document);

    assert.deepEqual(Array.from(committed.geometry.attributes.position.array), Array.from(preview.geometry.attributes.position.array));
    assert.deepEqual(Array.from(committed.geometry.index!.array), Array.from(preview.geometry.index!.array));
    assert.deepEqual(Array.from(committed.geometry.attributes.normal.array), Array.from(preview.geometry.attributes.normal.array));
    assert.deepEqual(committed.geometry.userData.sourceFaceIDs, preview.geometry.userData.sourceFaceIDs);
    assert.equal(committedTopology.faces.length, previewTopology.faces.length);
    assert.equal(committedTopology.logicalEdges.length, previewTopology.logicalEdges.length);
});

test('legacy baked meshes rebuild sharp normals instead of density-dependent plane shading', () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const body = Object.assign(createEntity('box', 'box'), {
        position: [0, 0, 0] as Vec3,
        meshGeometry: { positions: Array.from(geometry.attributes.position.array), indices: Array.from(geometry.index!.array) },
    });
    const mesh = buildEntityMesh(body, createDocument());
    const position = mesh.geometry.attributes.position, normal = mesh.geometry.attributes.normal, index = mesh.geometry.index;
    for (let cursor = 0; cursor < (index?.count || position.count); cursor += 3) {
        const ids = [0, 1, 2].map((corner) => index ? index.getX(cursor + corner) : cursor + corner);
        const a = new THREE.Vector3().fromBufferAttribute(position, ids[0]);
        const b = new THREE.Vector3().fromBufferAttribute(position, ids[1]);
        const c = new THREE.Vector3().fromBufferAttribute(position, ids[2]);
        const faceNormal = b.sub(a).cross(c.sub(a)).normalize();
        for (let corner = 0; corner < 3; corner++) {
            const renderNormal = new THREE.Vector3().fromBufferAttribute(normal, ids[corner]);
            assert(renderNormal.dot(faceNormal) > 0.999999, `box render normals must stay on the exact support plane`);
        }
    }
});

test('every union logical edge can be hovered as itself with Select Through across multiple camera directions', async () => {
    const { pickLogicalEdge } = await import('./viewport/EdgePicker');
    const { createTopologyEdgeGeometry } = await import('./viewport/TopologyEdges');
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: false });
    const shared = { parentId: null, color: '#9a9a9a', position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3, sideMode: 'one' as const, direction: 1 as const, sectorAngle: 360, curves: {}, planeId: 'plane', open: false };
    const circle = { ...shared, id: 'circle', name: 'circle', kind: 'extrude', profileType: 'circle', points: [[-51.9, 25.5], [-10.6, 0]], depth: 50.83, visible: false } as ModelEntity;
    const rectangle = { ...shared, id: 'rectangle', name: 'rectangle', kind: 'extrude', profileType: 'rectangle', points: [[-35.4, 8.7], [29.8, 8.7], [29.8, -46.5], [-35.4, -46.5]], depth: 78.18, visible: false } as ModelEntity;
    const body = { ...shared, id: 'union', name: 'union', kind: 'boolean', operation: 'union', operands: ['circle', 'rectangle'], visible: true } as ModelEntity;
    document.entities.push(circle, rectangle, body);
    const mesh = buildEntityMesh(body, document);
    const topology = buildMeshTopology(mesh.geometry, body.id, body, document);
    const display = createTopologyEdgeGeometry(topology);
    const lines = new THREE.LineSegments(display.geometry);
    lines.userData.displayEdge = true;
    lines.userData.segmentEdgeIds = display.segmentEdgeIds;
    mesh.add(lines);
    const model = new THREE.Group();
    model.add(mesh);
    model.updateMatrixWorld(true);
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) } as HTMLCanvasElement;
    const hovered = new Map<string, string>();
    for (const direction of [[1, 1, 1], [-1, 1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, 1], [-1, -1, -1]]) {
        const camera = new THREE.PerspectiveCamera(45, 1.25, 0.1, 5000);
        camera.position.set(...direction as [number, number, number]).multiplyScalar(250);
        camera.lookAt(0, 30, 0);
        camera.updateMatrixWorld(true);
        topology.logicalEdges.forEach((edge) => edge.segments.forEach((segment) => {
            if (hovered.has(edge.id)) return;
            const point = new THREE.Vector3(...segment.a).add(new THREE.Vector3(...segment.b)).multiplyScalar(0.5).project(camera);
            const event = { clientX: (point.x + 1) * 500, clientY: (1 - point.y) * 400 } as PointerEvent;
            const hit = pickLogicalEdge({ camera, canvas, model, event, thresholdPx: 8, selectThrough: true });
            if (!hit) return;
            const actualId = lines.userData.segmentEdgeIds[hit.index! / 2];
            if (actualId === edge.id) hovered.set(edge.id, edge.id);
            // Overlapping candidates are exercised on other segments/cameras rather than silently accepted as the target.
        }));
    }
    assert.deepEqual(new Set(hovered.keys()), new Set(topology.logicalEdges.map((edge) => edge.id)));
});
