import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureSectionRadius } from './viewport/SceneSynchronizer';
import { applySectionSurface, SectionRenderer, sectionSurfaceClipPlane } from './viewport/SectionRenderer';
import { INTERACTION } from '../config/const';
import { InfiniteGrid } from './viewport/InfiniteGrid';
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
    assert.equal(source.renderOrder, 0);
    assert(cap.renderOrder > source.renderOrder, 'caps paint after retained inner and outer surfaces');
    assert.equal(cap.position.x, 10);
    assert.equal(cap.position.z, 0);
    const surfacePlane = sectionSurfaceClipPlane(plane);
    assert.equal(surfacePlane.distanceToPoint(new THREE.Vector3(10, 0, 0)), -INTERACTION.sectionSurfaceClipEpsilon);
    assert.equal(plane.distanceToPoint(new THREE.Vector3(10, 0, 0)), 0);
    assert.equal((cap.material as THREE.Material).stencilFunc, THREE.NotEqualStencilFunc);
    assert.equal((cap.material as THREE.Material).stencilZPass, THREE.ReplaceStencilOp);
    assert.equal((cap.material as THREE.MeshStandardMaterial).transparent, false);
    assert.equal((cap.material as THREE.MeshStandardMaterial).userData.hatchPattern, true);

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
    assert.equal(cap.material.depthTest, true, 'the physical cap occludes later grid and coplanar helpers');
    assert.equal(cap.material.depthWrite, true);
    assert(cap.material.color.r < material.color.r, 'wall caps use a contrasting physical-section color');
    renderer.dispose();
});

function backStencil(renderer: SectionRenderer) {
    return ((renderer.group.children[0] as THREE.Mesh).material as THREE.Material).stencilZPass;
}
function frontStencil(renderer: SectionRenderer) {
    return ((renderer.group.children[1] as THREE.Mesh).material as THREE.Material).stencilZPass;
}


test('section surfaces show inner faces and restore their original material side', () => {
    const material = new THREE.MeshStandardMaterial({ side: THREE.FrontSide });
    const plane = sectionSurfaceClipPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

    applySectionSurface(material, plane);
    assert.equal(material.side, THREE.DoubleSide);
    assert.deepEqual(material.clippingPlanes, [plane]);

    applySectionSurface(material, null);
    assert.equal(material.side, THREE.FrontSide);
    assert.deepEqual(material.clippingPlanes, []);
    material.dispose();
});

test('section cap injects diagonal plane-UV hatching into the standard material', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
    const renderer = new SectionRenderer();
    renderer.rebuild([source], new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
    const cap = renderer.group.children[2] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    const shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string } = {
        uniforms: {},
        vertexShader: '#include <uv_vertex>',
        fragmentShader: '#include <color_fragment>',
    };

    cap.material.onBeforeCompile(shader as never, null as never);

    assert.match(shader.vertexShader, /vHatchUv = uv/);
    assert.match(shader.fragmentShader, /hatchCoordinate/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\(diffuseColor\.rgb, uHatchColor, hatchLine\)/);
    assert.equal(shader.uniforms.uHatchScale.value, cap.scale.x);
    assert.equal(shader.uniforms.uHatchOpacity.value, 1, 'hatch lines must not make the solid cap transparent');
    renderer.dispose();
});


test('render-only grid stays farther behind coplanar bottoms than the section clip epsilon', () => {
    const grid = new InfiniteGrid();
    assert.equal(grid.mesh.position.y, -INTERACTION.gridSurfaceOffset);
    assert(INTERACTION.gridSurfaceOffset > INTERACTION.sectionSurfaceClipEpsilon);
    grid.dispose();
});


test('multiple section bodies keep stencil counts isolated while caps follow all source surfaces', () => {
    const first = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    const second = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    const renderer = new SectionRenderer();
    renderer.rebuild([first, second], new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
    const [firstBack, firstFront, firstCap, secondBack, secondFront, secondCap] = renderer.group.children;

    assert(first.renderOrder < firstCap.renderOrder);
    assert(second.renderOrder < firstCap.renderOrder);
    assert(firstCap.renderOrder < secondBack.renderOrder);
    assert.equal(secondBack.renderOrder, secondFront.renderOrder);
    assert(secondBack.renderOrder < secondCap.renderOrder);
    renderer.dispose();
});


test('grounded extruded profiles keep stencil clipping on the live camera plane', () => {
    const profile = new THREE.Shape([
        new THREE.Vector2(-10, -10), new THREE.Vector2(10, -10),
        new THREE.Vector2(10, 10), new THREE.Vector2(-10, 10),
    ]);
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: 20, bevelEnabled: false });
    // Same grounded XZ case as sketch extrusion: the bottom remains at y=0.
    geometry.rotateX(-Math.PI / 2);
    const source = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const renderer = new SectionRenderer();
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    renderer.rebuild([source], plane);
    const [back, front] = renderer.group.children as THREE.Mesh[];

    expectLivePlane(back, plane);
    expectLivePlane(front, plane);
    plane.normal.set(-0.6, -0.4, -0.7).normalize();
    plane.constant = -5;
    renderer.update(plane);

    expectLivePlane(back, plane);
    expectLivePlane(front, plane);
    assert.equal((back.material as THREE.Material).depthTest, false);
    assert.equal((front.material as THREE.Material).depthTest, false);
    assert.equal((back.material as THREE.Material).depthWrite, false);
    assert.equal((front.material as THREE.Material).depthWrite, false);
    renderer.dispose();
});

function expectLivePlane(mesh: THREE.Mesh, plane: THREE.Plane) {
    const material = mesh.material as THREE.Material;
    assert.equal(material.clippingPlanes[0], plane, 'Material.clone() must not leave a stale clipping-plane copy');
    assert.equal(material.clippingPlanes[0].normal.equals(plane.normal), true);
    assert.equal(material.clippingPlanes[0].constant, plane.constant);
}
