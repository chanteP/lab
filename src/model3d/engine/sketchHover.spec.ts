import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildEntityMesh, createMaterial } from './geometry';
import { SceneSynchronizer } from './viewport/SceneSynchronizer';
import { createDocument, createEntity } from '../types';
import { ENTITY_COLORS } from '../config/colors';
import { SketchRenderer } from './viewport/SketchRenderer';

test('3D sketch hover restores the real visible opacity instead of the editing-state zero', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const sketch = Object.assign(createEntity('sketch', 'sketch'), { planeId: 'plane', profileType: 'circle' as const, points: [[0, 0], [10, 0]] as [number, number][] });
    document.entities.push(sketch);
    const mesh = buildEntityMesh(sketch, document);
    const synchronizer = new SceneSynchronizer({} as any);
    synchronizer.model.add(mesh);
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0;
    synchronizer.setSketchHover(sketch.id);
    assert.equal(material.opacity, 0.42);
    synchronizer.setSketchHover(null);
    assert.equal(material.opacity, 0.22);
});

test('default body material is neutral gray without texture or environment reflections', () => {
    const material = createMaterial(ENTITY_COLORS.primitive);
    assert.equal(material.map, null);
    assert.equal(material.metalness, 0);
    assert.equal(material.roughness, 1);
    assert.equal(material.color.getHexString(), '9a9a9a');
});

test('sketch editing active faces rebuild from the latest profile geometry', () => {
    const document = createDocument();
    const plane = { id: 'plane', name: 'XZ', kind: 'XZ' as const, origin: [0, 0, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number], u: [1, 0, 0] as [number, number, number], v: [0, 0, -1] as [number, number, number], visible: true };
    document.planes.push(plane);
    const sketch = createEntity('sketch', 'sketch');
    sketch.planeId = plane.id;
    sketch.profileType = 'rectangle';
    sketch.points = [[0, 0], [10, 0], [10, 10], [0, 10]];
    document.entities.push(sketch);
    const renderer = new SketchRenderer({
        container: {} as HTMLElement, renderer: { domElement: {} } as any, overlay: {} as any,
        getCamera: () => new THREE.OrthographicCamera(), getTarget: () => new THREE.Vector3(), getDocument: () => document,
        getActivePlane: () => plane, getEditingSketchId: () => sketch.id, getModel: () => new THREE.Group(), getSketchDrag: () => null,
        isSketchMode: () => true, planeMatrix: (value) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...value.u), new THREE.Vector3(...value.v), new THREE.Vector3(...value.normal)).setPosition(new THREE.Vector3(...value.origin)),
        raycast: () => [], raycastPoint: () => null,
    });
    renderer.refreshFaces();
    const first = renderer.faces.children[0] as THREE.Mesh;
    first.geometry.computeBoundingBox();
    assert.equal(first.geometry.boundingBox!.max.x, 10);

    sketch.points = [[0, 0], [20, 0], [20, 20], [0, 20]];
    renderer.refreshFaces();
    const next = renderer.faces.children[0] as THREE.Mesh;
    next.geometry.computeBoundingBox();
    assert.equal(next.geometry.boundingBox!.max.x, 20);
});
