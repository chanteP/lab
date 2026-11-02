import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GeometrySelector } from './viewport/GeometrySelector';

function hit(mesh: THREE.Mesh, faceIndex: number) {
    const geometry = mesh.geometry;
    const index = geometry.index;
    const vertices = [0, 1, 2].map((offset) => index ? index.getX(faceIndex * 3 + offset) : faceIndex * 3 + offset);
    const points = vertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, vertex));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    const point = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
    return { object: mesh, faceIndex, face: { a: vertices[0], b: vertices[1], c: vertices[2], normal }, point } as unknown as THREE.Intersection;
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

test('only planar surfaces expose planar geometry anchors', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 20, 32, 1, false));
    const selector = new GeometrySelector();
    const sideHit = hit(mesh, 0);
    const capHit = hit(mesh, 64);
    assert.equal(selector.createFaceAnchor(sideHit).planar, false);
    assert.equal(selector.createFaceAnchor(capHit).planar, true);
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

test('cylinder cap outline selects the complete circular loop', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 20, 32, 1, false));
    mesh.userData.entityId = 'cylinder';
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28));
    mesh.add(edges);
    mesh.updateMatrixWorld(true);
    const positions = edges.geometry.attributes.position;
    let segment = -1;
    for (let index = 0; index < positions.count; index += 2) {
        if ([index, index + 1].every((vertex) => Math.abs(positions.getY(vertex) - 10) < 0.0001)) { segment = index; break; }
    }

    const anchor = new GeometrySelector().createEdgeAnchor({ object: edges, index: segment } as unknown as THREE.Intersection);

    assert(anchor.vertices.length > 32);
    assert(anchor.vertices.every((point) => Math.abs(point[1] - 10) < 0.0001));
    assert(anchor.vertices[0].every((value, axis) => Math.abs(value - anchor.vertices[anchor.vertices.length - 1][axis]) < 0.0001));
});
