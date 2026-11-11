import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureSectionRadius } from './viewport/SceneSynchronizer';
import { SectionRenderer, sectionSurfaceClipPlane } from './viewport/SectionRenderer';
import { initializeManifold } from './modeling/ManifoldKernel';
import { evaluateShell } from './modeling/Shell';

before(async () => { await initializeManifold(); });

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
    const surfacePlane = sectionSurfaceClipPlane(plane);
    assert.ok(surfacePlane.distanceToPoint(new THREE.Vector3(10, 0, 0)) < 0);
    assert.equal(plane.distanceToPoint(new THREE.Vector3(10, 0, 0)), 0);
    assert.equal((cap.material as THREE.Material).stencilFunc, THREE.NotEqualStencilFunc);
    assert.equal((cap.material as THREE.Material).stencilZPass, THREE.ReplaceStencilOp);

    source.position.x = 25;
    renderer.update(plane);
    assert.equal(back.matrix.elements[12], 25);
    assert.equal(cap.position.x, 25);

    renderer.dispose();
    assert.equal(source.renderOrder, 7);
    assert.equal(renderer.group.children.length, 0);
});

test('hollow shell section caps keep the wall visible instead of only rendering the inner surface', () => {
    const geometry = evaluateShell(new THREE.BoxGeometry(10, 10, 10), [{
        normal: [0, 1, 0],
        vertices: [[-5, 5, -5], [-5, 5, 5], [5, 5, 5], [-5, 5, -5], [5, 5, 5], [5, 5, -5]], indices: [0, 1, 2, 3, 4, 5],
    }], 1);
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    const source = new THREE.Mesh(geometry, material);
    const renderer = new SectionRenderer();
    renderer.rebuild([source], new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
    const cap = renderer.group.children[2] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    assert.equal(backStencil(renderer), THREE.IncrementWrapStencilOp);
    assert.equal(frontStencil(renderer), THREE.DecrementWrapStencilOp);
    assert.equal(cap.material.stencilFunc, THREE.NotEqualStencilFunc);
    assert.equal(cap.material.depthTest, false, 'the inner shell depth must not hide the physical wall cap');
    assert.equal(cap.material.depthWrite, false);
    assert(cap.material.color.r < material.color.r, 'wall caps use a contrasting physical-section color');
    renderer.dispose();
});

function backStencil(renderer: SectionRenderer) {
    return ((renderer.group.children[0] as THREE.Mesh).material as THREE.Material).stencilZPass;
}
function frontStencil(renderer: SectionRenderer) {
    return ((renderer.group.children[1] as THREE.Mesh).material as THREE.Material).stencilZPass;
}
