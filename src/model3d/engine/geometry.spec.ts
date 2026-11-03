import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildEntityMesh } from './geometry';
import { GeometrySelector } from './viewport/GeometrySelector';
import { createDisplayEdgeGeometry } from './viewport/renderUtils';
import { createDocument, createEntity, type ModelEntity, type Vec3 } from '../types';

function bounds(entity: ModelEntity, document = createDocument()) {
    const mesh = buildEntityMesh(entity, document);
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!;
}

function extrude(distance: number, normal: Vec3 = [0, 1, 0]) {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const entity = createEntity('extrude', 'body');
    Object.assign(entity, {
        points: [[-5, -5], [5, -5], [5, 5], [-5, 5]], profileType: 'rectangle', planeId: 'plane',
        position: [0, 0, 0], depth: 10, direction: 1, sideMode: 'one', faceOffset: { normal, distance },
    });
    return bounds(entity, document);
}

test('primitive push-pull changes one continuous solid in both directions', () => {
    const cylinder = createEntity('cylinder', 'cylinder');
    Object.assign(cylinder, { radius: 5, height: 10, position: [0, 0, 0] });
    const original = buildEntityMesh(cylinder, createDocument());
    cylinder.faceOffset = { normal: [0, 1, 0], distance: 5 };
    const extended = buildEntityMesh(cylinder, createDocument());
    extended.geometry.computeBoundingBox();

    assert.deepEqual(extended.geometry.boundingBox!.min.toArray(), [-5, -5, -5]);
    assert.deepEqual(extended.geometry.boundingBox!.max.toArray(), [5, 10, 5]);
    assert.equal(new THREE.EdgesGeometry(extended.geometry, 28).attributes.position.count, new THREE.EdgesGeometry(original.geometry, 28).attributes.position.count);

    cylinder.faceOffset.distance = -4;
    const shrunk = bounds(cylinder);
    assert.equal(shrunk.min.y, -5);
    assert.equal(shrunk.max.y, 1);
});

test('extruded top and bottom faces keep the opposite face fixed', () => {
    assert.deepEqual(extrude(5).min.toArray(), [-5, 0, -5]);
    assert.deepEqual(extrude(5).max.toArray(), [5, 15, 5]);
    assert.equal(extrude(-4).max.y, 6);
    assert.equal(extrude(5, [0, -1, 0]).min.y, -5);
    assert.equal(extrude(5, [0, -1, 0]).max.y, 10);
    assert.equal(extrude(-4, [0, -1, 0]).min.y, 4);
    assert.equal(extrude(-4, [0, -1, 0]).max.y, 10);
});

test('push-pull crosses the opposite plane and creates a reversed solid', () => {
    const box = createEntity('box', 'box');
    Object.assign(box, { width: 40, height: 40, depth: 40, position: [0, 0, 0], faceOffset: { normal: [0, 1, 0], distance: -45 } });
    const boxBounds = bounds(box);
    assert.equal(boxBounds.min.y, -25);
    assert.equal(boxBounds.max.y, -20);

    assert.equal(extrude(-15).min.y, -5);
    assert.equal(extrude(-15).max.y, 0);
});

test('a planar extrusion side uses its actual face profile and can cross the opposite side', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const entity = createEntity('extrude', 'body');
    const face = [[5, 0, -5], [5, 10, -5], [5, 10, 5], [5, 0, 5]] as Vec3[];
    Object.assign(entity, {
        points: [[-5, -5], [5, -5], [5, 5], [-5, 5]], profileType: 'rectangle', planeId: 'plane', position: [0, 0, 0], depth: 10,
        direction: 1, sideMode: 'one', faceOffset: { normal: [1, 0, 0], distance: 2, vertices: face, indices: [0, 1, 2, 0, 2, 3] },
    });
    assert.equal(bounds(entity, document).max.x, 7);

    entity.faceOffset!.distance = -12;
    const reversed = bounds(entity, document);
    assert(Math.abs(reversed.min.x + 7) < 0.00001);
    assert(Math.abs(reversed.max.x + 5) < 0.0011);
});

test('negative extrusion keeps triangle winding and normals facing outward', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const entity = createEntity('extrude', 'body');
    Object.assign(entity, {
        points: [[-5, -5], [5, -5], [5, 5], [-5, 5]], profileType: 'rectangle', planeId: 'plane', position: [0, 0, 0], depth: 10,
        direction: -1, sideMode: 'one',
    });
    const geometry = buildEntityMesh(entity, document).geometry;
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, index);
        const b = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
        const c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const faceCenter = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        assert(normal.dot(faceCenter.sub(center)) > 0, `triangle ${index / 3} must face outward`);
    }
});

test('baked cylinder accepts a new real-time cap prism for repeated push-pull', () => {
    const original = buildEntityMesh(Object.assign(createEntity('cylinder', 'source'), { radius: 20, height: 40, position: [0, 0, 0] }), createDocument());
    const topHit = { object: original, faceIndex: 96, face: { normal: new THREE.Vector3(0, 1, 0) }, point: new THREE.Vector3(0, 20, 0) } as unknown as THREE.Intersection;
    const anchor = new GeometrySelector().createFaceAnchor(topHit);
    const entity = createEntity('cylinder', 'body');
    Object.assign(entity, {
        position: [0, 0, 0], radius: 20, height: 40,
        meshGeometry: {
            positions: Array.from(original.geometry.attributes.position.array),
            indices: original.geometry.index ? Array.from(original.geometry.index.array) : [],
        },
        faceOffset: { normal: anchor.localNormal, distance: -10, vertices: anchor.vertices, indices: anchor.indices },
    });
    const result = bounds(entity);
    assert.equal(result.min.y, -20);
    assert.equal(result.max.y, 10);
});

test('boolean cylinder cut does not emit internal triangulation edges on a planar cap', () => {
    const document = createDocument();
    const box = Object.assign(createEntity('box', 'box'), { position: [0, 0, 0], width: 40, height: 40, depth: 40 });
    const cylinder = Object.assign(createEntity('cylinder', 'cylinder'), { position: [0, 40, 0], radius: 10, height: 40 });
    const result = Object.assign(createEntity('box', 'result'), { kind: 'boolean' as const, operation: 'subtract' as const, operands: ['box', 'cylinder'] as [string, string], position: [0, 0, 0] });
    document.entities.push(box, cylinder, result);
    const geometry = buildEntityMesh(result, document).geometry;
    const positions = createDisplayEdgeGeometry(geometry).attributes.position;
    let internalEdges = 0;
    for (let index = 0; index < positions.count; index += 2) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, index), b = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
        if (Math.abs(a.y - 20) > 0.001 || Math.abs(b.y - 20) > 0.001) continue;
        const boundary = [a, b].every((point) => Math.max(Math.abs(point.x), Math.abs(point.z)) > 19.999 || Math.abs(Math.hypot(point.x, point.z) - 10) < 0.01);
        if (!boundary) internalEdges++;
    }
    assert.equal(internalEdges, 0);
});

test('a baked cylinder remains a valid subtraction tool on the next boolean operation', () => {
    const document = createDocument();
    const source = Object.assign(createEntity('cylinder', 'cylinder'), { position: [0, 20, 0], radius: 10, height: 80 });
    const first = buildEntityMesh(source, document).geometry;
    source.meshGeometry = { positions: Array.from(first.attributes.position.array), indices: first.index ? Array.from(first.index.array) : [] };
    const box = Object.assign(createEntity('box', 'box'), { position: [0, 0, 0], width: 40, height: 40, depth: 40 });
    const result = Object.assign(createEntity('box', 'result'), { kind: 'boolean' as const, operation: 'subtract' as const, operands: ['box', 'cylinder'] as [string, string], position: [0, 0, 0] });
    document.entities.push(box, source, result);
    const mesh = buildEntityMesh(result, document);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 21, 0), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(mesh)[0];
    assert.equal(hit, undefined, 'the center ray must pass through the entire cylinder hole');
});

test('three consecutive box faces always come from the current baked mesh', () => {
    const document = createDocument();
    const entity = Object.assign(createEntity('box', 'box'), { position: [0, 0, 0], width: 40, height: 40, depth: 40 });
    const selector = new GeometrySelector();
    const apply = (normal: Vec3, distance: number) => {
        const mesh = buildEntityMesh(entity, document);
        const positions = mesh.geometry.attributes.position;
        const indices = mesh.geometry.index;
        let hit: THREE.Intersection | null = null;
        for (let index = 0; index < (indices?.count || positions.count) && !hit; index += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(index) : index), b = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(index + 1) : index + 1), c = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(index + 2) : index + 2);
            const faceNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
            if (faceNormal.dot(new THREE.Vector3(...normal)) > 0.999) hit = { object: mesh, faceIndex: index / 3, face: { a: index, b: index + 1, c: index + 2, normal: faceNormal }, point: a.add(b).add(c).multiplyScalar(1 / 3) } as unknown as THREE.Intersection;
        }
        assert(hit, `missing selected face ${normal.join(',')}`);
        const anchor = selector.createFaceAnchor(hit!, entity);
        mesh.geometry.computeBoundingBox();
        entity.axisBox = { min: mesh.geometry.boundingBox!.min.toArray() as Vec3, max: mesh.geometry.boundingBox!.max.toArray() as Vec3 };
        entity.faceOffset = { normal, distance, vertices: anchor.vertices, indices: anchor.indices };
        const geometry = buildEntityMesh(entity, document).geometry;
        geometry.computeBoundingBox();
        entity.axisBox = { min: geometry.boundingBox!.min.toArray() as Vec3, max: geometry.boundingBox!.max.toArray() as Vec3 };
        entity.meshGeometry = { positions: Array.from(geometry.attributes.position.array), indices: geometry.index ? Array.from(geometry.index.array) : [] };
        entity.faceOffset = null;
        assert.equal(entity.meshGeometry.positions.length / 3, 24, 'axis-aligned box edits must not accumulate CSG fragments');
    };

    apply([1, 0, 0], 4);
    apply([0, 0, 1], 3);
    apply([0, 1, 0], 5);
    const result = bounds(entity);
    assert.deepEqual(result.min.toArray(), [-20, -20, -20]);
    assert.deepEqual(result.max.toArray(), [24, 25, 23]);
});
