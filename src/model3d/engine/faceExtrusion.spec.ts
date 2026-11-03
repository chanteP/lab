import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initializeManifold, evaluateBoolean } from './modeling/ManifoldKernel';
import { evaluateFaceExtrusion } from './modeling/FaceExtrusion';
import { buildEntityMesh } from './geometry';
import { buildMeshTopology } from './topology/MeshTopology';
import { GeometrySelector } from './viewport/GeometrySelector';
import { createDocument, createEntity, type ModelEntity } from '../types';

await initializeManifold();

function faceOffset(mesh: THREE.Mesh, entity: ModelEntity, normal: [number, number, number], distance: number) {
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let triangle = 0; triangle < (index?.count || position.count) / 3; triangle++) {
        const ids = [0, 1, 2].map((corner) => index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner);
        const points = ids.map((id) => new THREE.Vector3().fromBufferAttribute(position, id));
        const triangleNormal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
        if (triangleNormal.dot(new THREE.Vector3(...normal)) < 0.999) continue;
        const hit = { object: mesh, faceIndex: triangle, face: { a: ids[0], b: ids[1], c: ids[2], normal: triangleNormal }, point: points[0] } as unknown as THREE.Intersection;
        const anchor = new GeometrySelector().createFaceAnchor(hit, entity);
        return { normal, distance, vertices: anchor.vertices, indices: anchor.indices };
    }
    throw new Error('Face not found');
}
function volume(geometry: THREE.BufferGeometry) {
    const p = geometry.attributes.position, index = geometry.index;
    if (!p) return 0;
    let result = 0;
    for (let cursor = 0; cursor < (index?.count || p.count); cursor += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(cursor) : cursor);
        const b = new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(cursor + 1) : cursor + 1);
        const c = new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(cursor + 2) : cursor + 2);
        result += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(result);
}

test('10-unit box face extrusion has exact outward, inward and empty-results', () => {
    const entity = Object.assign(createEntity('box', 'body'), { width: 10, height: 10, depth: 10, position: [0, 0, 0] as [number, number, number] });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    mesh.userData.entityId = entity.id;
    for (const [distance, expected] of [[2, 1200], [-2, 800], [-15, 0]]) {
        const result = evaluateFaceExtrusion(mesh.geometry, faceOffset(mesh, entity, [0, 1, 0], distance));
        assert(result.validation.valid);
        assert(Math.abs(volume(result.geometry) - expected) < 1e-7);
    }
});

test('a face with a through-hole preserves both outer and inner loops', () => {
    const document = createDocument();
    const entity = Object.assign(createEntity('box', 'body'), { width: 10, height: 10, depth: 10, position: [0, 0, 0] as [number, number, number] });
    const outer = new THREE.BoxGeometry(10, 10, 10), cutter = new THREE.BoxGeometry(2, 20, 2);
    const base = evaluateBoolean(outer, cutter, 'subtract');
    const mesh = new THREE.Mesh(base);
    mesh.userData.entityId = entity.id;
    const topology = buildMeshTopology(base, entity.id, entity, document);
    mesh.userData.topology = topology;
    const top = topology.faces.find((face) => face.planar && new THREE.Vector3(...face.normal).y > 0.999)!;
    assert.equal(top.boundaryLoops.length, 2);
    const result = evaluateFaceExtrusion(base, faceOffset(mesh, entity, [0, 1, 0], 2));
    assert(result.validation.valid);
    assert(Math.abs(volume(result.geometry) - 1152) < 1e-7);
});

test('direct and multi-step gesture evaluation produce the same geometry', () => {
    const entity = Object.assign(createEntity('box', 'body'), { width: 10, height: 10, depth: 10, position: [0, 0, 0] as [number, number, number] });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    mesh.userData.entityId = entity.id;
    const direct = evaluateFaceExtrusion(mesh.geometry, faceOffset(mesh, entity, [0, 1, 0], 3)).geometry;
    let stepped: THREE.BufferGeometry | null = null;
    for (const distance of [0.2, 1.7, -0.5, 2.4, 3]) stepped = evaluateFaceExtrusion(mesh.geometry, faceOffset(mesh, entity, [0, 1, 0], distance)).geometry;
    assert.equal(volume(stepped!), volume(direct));
    assert.deepEqual(direct.boundingBox, stepped!.boundingBox);
});

test('curved intersection patches accept both outward and inward extrusion', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const common = { parentId: null, color: '#8ca3b0', visible: true, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], sideMode: 'one' as const, direction: 1 as const, sectorAngle: 360, curves: {}, planeId: 'plane' };
    const rectangle = { ...common, id: 'rectangle', name: 'rectangle', kind: 'extrude', profileType: 'rectangle', points: [[-35.4, 8.7], [29.8, 8.7], [29.8, -46.5], [-35.4, -46.5]], depth: 57.8 } as ModelEntity;
    const circle = { ...common, id: 'circle', name: 'circle', kind: 'extrude', profileType: 'circle', points: [[-51.9, 25.5], [-10.6, 0]], depth: 161.87 } as ModelEntity;
    const intersection = { ...common, id: 'intersection', name: 'intersection', kind: 'boolean', operation: 'intersect', operands: ['rectangle', 'circle'] } as ModelEntity;
    document.entities.push(rectangle, circle, intersection);
    const mesh = buildEntityMesh(intersection, document);
    const topology = buildMeshTopology(mesh.geometry, intersection.id, intersection, document);
    mesh.userData.topology = topology;
    for (const face of topology.faces.filter((face) => face.planar)) {
        const vertices: [number, number, number][] = [], indices: number[] = [];
        face.triangleIds.forEach((id) => topology.triangles[id].renderVertices.forEach((renderVertex) => {
            vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, renderVertex).toArray());
            indices.push(indices.length);
        }));
        for (const distance of [1, -1]) {
            const result = evaluateFaceExtrusion(mesh.geometry, { normal: face.normal, distance, vertices, indices });
            assert(result.validation.valid, `${face.id} at ${distance}: ${result.validation.errors.join(', ')}`);
        }
    }
});
