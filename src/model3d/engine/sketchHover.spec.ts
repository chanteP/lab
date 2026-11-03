import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildEntityMesh, createMaterial } from './geometry';
import { SceneSynchronizer } from './viewport/SceneSynchronizer';
import { createDocument, createEntity } from '../types';
import { ENTITY_COLORS } from '../config/colors';

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
