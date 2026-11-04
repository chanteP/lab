import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildEntityMesh } from './geometry';
import { initializeManifold } from './modeling/ManifoldKernel';
import { GeometrySelector } from './viewport/GeometrySelector';
import { createDisplayEdgeGeometry } from './viewport/renderUtils';
import { createDocument, createEntity, type ModelDocument, type ModelEntity, type Vec3 } from '../types';

await initializeManifold();

function bounds(entity: ModelEntity, document = createDocument()) {
    const mesh = buildEntityMesh(entity, document);
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!;
}

function faceOffset(entity: ModelEntity, document: ModelDocument, normal: Vec3, distance: number) {
    const mesh = buildEntityMesh(entity, document);
    const positions = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let cursor = 0; cursor < (index?.count || positions.count); cursor += 3) {
        const ids = [0, 1, 2].map((corner) => index ? index.getX(cursor + corner) : cursor + corner);
        const points = ids.map((id) => new THREE.Vector3().fromBufferAttribute(positions, id));
        const faceNormal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
        if (faceNormal.dot(new THREE.Vector3(...normal)) < 0.999) continue;
        const hit = { object: mesh, faceIndex: cursor / 3, face: { a: ids[0], b: ids[1], c: ids[2], normal: faceNormal }, point: points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3) } as unknown as THREE.Intersection;
        const anchor = new GeometrySelector().createFaceAnchor(hit, entity);
        return { normal, distance, vertices: anchor.vertices, indices: anchor.indices };
    }
    throw new Error(`Missing face ${normal.join(',')}`);
}

function extrude(distance: number, normal: Vec3 = [0, 1, 0]) {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const entity = createEntity('extrude', 'body');
    Object.assign(entity, {
        points: [[-5, -5], [5, -5], [5, 5], [-5, 5]], profileType: 'rectangle', planeId: 'plane',
        position: [0, 0, 0], depth: 10, direction: 1, sideMode: 'one',
    });
    entity.faceOffset = faceOffset(entity, document, normal, distance);
    return bounds(entity, document);
}

test('primitive push-pull changes one continuous solid in both directions', () => {
    const cylinder = createEntity('cylinder', 'cylinder');
    Object.assign(cylinder, { radius: 5, height: 10, position: [0, 0, 0] });
    const original = buildEntityMesh(cylinder, createDocument());
    cylinder.faceOffset = faceOffset(cylinder, createDocument(), [0, 1, 0], 5);
    const extended = buildEntityMesh(cylinder, createDocument());
    extended.geometry.computeBoundingBox();

    assert.deepEqual(extended.geometry.boundingBox!.min.toArray(), [-5, -5, -5]);
    assert.deepEqual(extended.geometry.boundingBox!.max.toArray(), [5, 10, 5]);
    assert.equal(new THREE.EdgesGeometry(extended.geometry, 28).attributes.position.count, new THREE.EdgesGeometry(original.geometry, 28).attributes.position.count);

    cylinder.faceOffset = null;
    cylinder.faceOffset = faceOffset(cylinder, createDocument(), [0, 1, 0], -4);
    const shrunk = bounds(cylinder);
    assert.equal(shrunk.min.y, -5);
    assert.equal(shrunk.max.y, 1);
});

test('cone and torus primitives keep editable dimensions and sit on the ground plane', () => {
    const document = createDocument();
    const cone = buildEntityMesh(createEntity('cone', 'cone'), document);
    const torus = buildEntityMesh(createEntity('torus', 'torus'), document);
    cone.geometry.computeBoundingBox();
    torus.geometry.computeBoundingBox();

    assert.deepEqual(cone.geometry.boundingBox?.min.toArray(), [-20, -20, -20]);
    assert.deepEqual(cone.geometry.boundingBox?.max.toArray(), [20, 20, 20]);
    assert.equal(cone.position.y, 20);
    assert.equal(cone.geometry.attributes.position.count > 0, true);
    assert.equal(torus.position.y, 6);
    assert(Math.abs(torus.geometry.boundingBox!.min.y + 6) < 1e-6);
    assert(Math.abs(torus.geometry.boundingBox!.max.x - 26) < 1e-6);
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

test('push-pull cutting through the opposite plane produces an empty solid', () => {
    const box = createEntity('box', 'box');
    Object.assign(box, { width: 40, height: 40, depth: 40, position: [0, 0, 0] });
    box.faceOffset = faceOffset(box, createDocument(), [0, 1, 0], -45);
    assert.equal(bounds(box).isEmpty(), true);
    assert.equal(extrude(-15).isEmpty(), true);
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
    assert.equal(bounds(entity, document).isEmpty(), true);
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
    mesh.material.side = THREE.DoubleSide;
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
        entity.faceOffset = { normal, distance, vertices: anchor.vertices, indices: anchor.indices };
        const geometry = buildEntityMesh(entity, document).geometry;
        geometry.computeBoundingBox();
        entity.meshGeometry = { positions: Array.from(geometry.attributes.position.array), indices: geometry.index ? Array.from(geometry.index.array) : [] };
        entity.faceOffset = null;
        assert.equal(new GeometrySelector().createFaceAnchor(hit!, entity).faceIds?.length, 1, 'logical face identity remains singular');
    };

    apply([1, 0, 0], 4);
    apply([0, 0, 1], 3);
    apply([0, 1, 0], 5);
    const result = bounds(entity);
    assert.deepEqual(result.min.toArray(), [-20, -20, -20]);
    assert.deepEqual(result.max.toArray(), [24, 25, 23]);
});

test('concave planar faces preserve their notch when extended', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const entity = Object.assign(createEntity('extrude', 'body'), {
        position: [0, 0, 0], planeId: 'plane', profileType: 'polygon', points: [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]], depth: 10, direction: 1, sideMode: 'one',
    });
    const mesh = buildEntityMesh(entity, document);
    const positions = mesh.geometry.attributes.position;
    let hit: THREE.Intersection | null = null;
    for (let index = 0; index < positions.count && !hit; index += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, index), b = new THREE.Vector3().fromBufferAttribute(positions, index + 1), c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (normal.y > 0.999) hit = { object: mesh, faceIndex: index / 3, face: { normal }, point: a.add(b).add(c).multiplyScalar(1 / 3) } as unknown as THREE.Intersection;
    }
    const anchor = new GeometrySelector().createFaceAnchor(hit!, entity);
    entity.faceOffset = { normal: anchor.localNormal, distance: 5, vertices: anchor.vertices, indices: anchor.indices };
    const result = buildEntityMesh(entity, document);
    result.geometry.computeBoundingBox();
    assert.equal(result.geometry.boundingBox!.max.y, 15);

    const notch = new THREE.Raycaster(new THREE.Vector3(7, 16, -7), new THREE.Vector3(0, -1, 0)).intersectObject(result)[0];
    assert.equal(notch, undefined, 'the concave notch must remain empty');
});

test('baked boolean entities do not rebuild from stale operands on release', () => {
    const document = createDocument();
    const box = Object.assign(createEntity('box', 'box'), { position: [0, 0, 0] });
    const cylinder = Object.assign(createEntity('cylinder', 'cylinder'), { position: [0, 20, 0], height: 80 });
    const result = Object.assign(createEntity('box', 'result'), { kind: 'boolean' as const, operation: 'union' as const, operands: ['box', 'cylinder'] as [string, string], position: [0, 0, 0] });
    document.entities.push(box, cylinder, result);
    const original = buildEntityMesh(result, document).geometry;
    original.translate(0, 5, 0);
    original.computeBoundingBox();
    result.meshGeometry = { positions: Array.from(original.attributes.position.array), indices: original.index ? Array.from(original.index.array) : [] };

    const baked = buildEntityMesh(result, document).geometry;
    baked.computeBoundingBox();
    assert.equal(baked.boundingBox!.max.y, original.boundingBox!.max.y);
});

test('lowering one combined top face does not move the other top face', () => {
    const document = createDocument();
    const box = Object.assign(createEntity('box', 'box'), { position: [0, 0, 0], width: 20, height: 60, depth: 20 });
    const cylinder = Object.assign(createEntity('cylinder', 'cylinder'), { position: [30, 0, 0], radius: 10, height: 40 });
    const result = Object.assign(createEntity('box', 'result'), { kind: 'boolean' as const, operation: 'union' as const, operands: ['box', 'cylinder'] as [string, string], position: [0, 0, 0] });
    document.entities.push(box, cylinder, result);
    const boxMesh = buildEntityMesh(box, document), cylinderMesh = buildEntityMesh(cylinder, document);
    const boxGeometry = boxMesh.geometry.clone().applyMatrix4(boxMesh.matrixWorld);
    const cylinderGeometry = cylinderMesh.geometry.clone().applyMatrix4(cylinderMesh.matrixWorld);
    const combined = mergeGeometries([boxGeometry, cylinderGeometry], false)!;
    result.meshGeometry = { positions: Array.from(combined.attributes.position.array), indices: combined.index ? Array.from(combined.index.array) : [] };
    const mesh = buildEntityMesh(result, document);
    mesh.material.side = THREE.DoubleSide;
    const circleTop = (target: THREE.Mesh) => {
        const positions = target.geometry.attributes.position;
        const index = target.geometry.index;
        const triangles: string[] = [];
        for (let cursor = 0; cursor < (index?.count || positions.count); cursor += 3) {
            const points = [0, 1, 2].map((corner) => new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(cursor + corner) : cursor + corner));
            const center = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
            if (center.x > 20 && points.every((point) => Math.abs(point.y - 40) < 0.001)) triangles.push(points.map((point) => point.toArray().join(',')).sort().join('|'));
        }
        return triangles.sort();
    };
    const beforeCircle = circleTop(mesh);
    const positions = mesh.geometry.attributes.position;
    const meshIndex = mesh.geometry.index;
    let hit: THREE.Intersection | null = null;
    for (let index = 0; index < (meshIndex?.count || positions.count); index += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, meshIndex ? meshIndex.getX(index) : index), b = new THREE.Vector3().fromBufferAttribute(positions, meshIndex ? meshIndex.getX(index + 1) : index + 1), c = new THREE.Vector3().fromBufferAttribute(positions, meshIndex ? meshIndex.getX(index + 2) : index + 2);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const point = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        if (normal.y > 0.999 && Math.abs(point.y - 30) < 0.001) { hit = { object: mesh, faceIndex: index / 3, face: { normal }, point } as unknown as THREE.Intersection; break; }
    }
    const anchor = new GeometrySelector().createFaceAnchor(hit!, result);
    assert(anchor.vertices.every((point) => Math.abs(point[1] - 30) < 0.001));
    result.faceOffset = { normal: anchor.localNormal, distance: -35, vertices: anchor.vertices, indices: anchor.indices };
    const edited = buildEntityMesh(result, document);
    edited.material.side = THREE.DoubleSide;
    assert.deepEqual(circleTop(edited), beforeCircle);
    const positionsAfter = edited.geometry.attributes.position;
    assert(Array.from({ length: positionsAfter.count }, (_, index) => positionsAfter.getY(index)).some((value) => Math.abs(value + 5) < 0.001));
});
