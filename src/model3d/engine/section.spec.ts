import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureSectionRadius } from './viewport/SceneSynchronizer';
import { SectionRenderer } from './viewport/SectionRenderer';

test('section range is the smallest origin-centered sphere enclosing every vertex', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(10, 20, 30);

    const radius = measureSectionRadius([mesh]);

    assert(Math.abs(radius - Math.sqrt(11 ** 2 + 21 ** 2 + 31 ** 2)) < 0.000001);
});

test('section range uses the farthest mesh and handles an empty scene', () => {
    const near = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const far = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    far.position.x = -30;

    assert.equal(measureSectionRadius([]), 0);
    assert(Math.abs(measureSectionRadius([near, far]) - Math.sqrt(31 ** 2 + 2)) < 0.000001);
});

test('section caps share source geometry, follow transforms and restore render order', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30), new THREE.MeshStandardMaterial());
    source.position.set(10, 0, 4);
    source.renderOrder = 7;
    const renderer = new SectionRenderer();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    renderer.rebuild([source], plane);

    assert.equal(renderer.group.children.length, 3);
    const [back, front, cap] = renderer.group.children as THREE.Mesh[];
    assert.equal(back.geometry, source.geometry);
    assert.equal(front.geometry, source.geometry);
    assert.equal((back.material as THREE.Material).stencilZPass, THREE.IncrementWrapStencilOp);
    assert.equal((front.material as THREE.Material).stencilZPass, THREE.DecrementWrapStencilOp);
    assert.equal(source.renderOrder, 1000);
    assert.equal(cap.position.x, 10);
    assert.equal(cap.position.z, 0);

    source.position.x = 25;
    renderer.update(plane);
    assert.equal(back.matrix.elements[12], 25);
    assert.equal(cap.position.x, 25);

    renderer.dispose();
    assert.equal(source.renderOrder, 7);
    assert.equal(renderer.group.children.length, 0);
});
