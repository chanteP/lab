import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildEntityMesh } from './geometry';
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
