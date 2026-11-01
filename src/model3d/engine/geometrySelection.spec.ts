import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GeometrySelector } from './viewport/GeometrySelector';

function hit(mesh: THREE.Mesh, faceIndex: number) {
    return { object: mesh, faceIndex } as unknown as THREE.Intersection;
}

test('curved face selection reuses one connected surface for every tessellation triangle', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 20, 32, 1, false));
    mesh.userData.entityId = 'cylinder';
    const selector = new GeometrySelector();
    const first = selector.collectSurface(mesh, hit(mesh, 0));
    const second = selector.collectSurface(mesh, hit(mesh, 30));

    assert.equal(first, second, 'hovering another triangle must not rebuild or duplicate the curved face');
    assert(first.vertices.length > 100);
    assert.equal(first.indices.length, first.vertices.length);
});

test('planar cap and curved side remain independent selectable faces', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 20, 32, 1, false));
    const selector = new GeometrySelector();
    const side = selector.collectSurface(mesh, hit(mesh, 0));
    const cap = selector.collectSurface(mesh, hit(mesh, 64));

    assert.notEqual(side, cap);
    assert(cap.vertices.length < side.vertices.length);
    assert(cap.vertices.every((point) => Math.abs(Math.abs(point[1]) - 10) < 0.0001));
});

test('outline hit uses the actual display-edge segment rather than a mesh triangle', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    mesh.userData.entityId = 'box';
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry));
    mesh.add(edges);
    mesh.updateMatrixWorld(true);
    const anchor = new GeometrySelector().createEdgeAnchor({ object: edges, index: 0 } as unknown as THREE.Intersection);

    assert.equal(anchor.id, 'box');
    assert.equal(anchor.type, 'edge');
    assert.equal(anchor.vertices.length, 2);
    assert.equal(anchor.vertices[0].length, 3);
});
