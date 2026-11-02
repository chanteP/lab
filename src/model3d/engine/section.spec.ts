import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureSectionRadius } from './viewport/SceneSynchronizer';

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
