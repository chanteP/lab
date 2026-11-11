import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import * as THREE from 'three';
import { initializeManifold } from './modeling/ManifoldKernel';
import { evaluateShell, type ShellOpening } from './modeling/Shell';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { buildEntityMesh } from './geometry';
import { buildMeshTopology } from './topology/MeshTopology';
import { createDocument, createEntity } from '../types';

before(async () => { await initializeManifold(); });

function cap(y: number, normal: [number, number, number]): ShellOpening {
    return {
        normal,
        vertices: [[-5, y, -5], [-5, y, 5], [5, y, 5], [-5, y, -5], [5, y, 5], [5, y, -5]],
        indices: [0, 1, 2, 3, 4, 5],
    };
}

function volume(geometry: THREE.BufferGeometry) {
    const position = geometry.attributes.position;
    const index = geometry.index!;
    let value = 0;
    for (let i = 0; i < index.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(i));
        const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 1));
        const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 2));
        value += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(value);
}

test('shell retains the requested wall and opens the selected face', () => {
    const result = evaluateShell(new THREE.BoxGeometry(10, 10, 10), [cap(5, [0, 1, 0])], 1);
    const validation = validateSolidGeometry(result);
    assert(validation.valid, validation.errors.join(', '));
    assert(Math.abs(volume(result) - 424) < 1e-4, `volume=${volume(result)}`);
    assert.deepEqual(result.boundingBox!.min.toArray(), [-5, -5, -5]);
    assert.deepEqual(result.boundingBox!.max.toArray(), [5, 5, 5], 'opening the cavity must not shorten the adjacent outer walls');
});

test('multiple selected faces become independent openings in one shell', () => {
    const result = evaluateShell(new THREE.BoxGeometry(10, 10, 10), [cap(5, [0, 1, 0]), cap(-5, [0, -1, 0])], 1);
    const validation = validateSolidGeometry(result);
    assert(validation.valid, validation.errors.join(', '));
    assert(Math.abs(volume(result) - 360) < 1e-4, `volume=${volume(result)}`);
});

test('an excessive wall thickness fails without producing a non-manifold result', () => {
    assert.throws(() => evaluateShell(new THREE.BoxGeometry(10, 10, 10), [cap(5, [0, 1, 0])], 6), /壁厚过大/);
});

test('increasing wall thickness hollows the interior without shrinking outer walls', () => {
    for (const thickness of [1, 2, 3]) {
        const result = evaluateShell(new THREE.BoxGeometry(10, 10, 10), [cap(5, [0, 1, 0])], thickness);
        const inner = 10 - thickness * 2;
        const expected = 1000 - inner ** 3 - inner ** 2 * thickness;
        assert(Math.abs(volume(result) - expected) < 1e-4, `thickness=${thickness}, volume=${volume(result)}`);
        assert.deepEqual(result.boundingBox!.min.toArray(), [-5, -5, -5]);
        assert.deepEqual(result.boundingBox!.max.toArray(), [5, 5, 5]);
    }
});

test('adjacent selected faces open through their shared edge without leaving a beam', () => {
    const side: ShellOpening = {
        normal: [1, 0, 0],
        vertices: [[5, -5, -5], [5, -5, 5], [5, 5, 5], [5, -5, -5], [5, 5, 5], [5, 5, -5]], indices: [0, 1, 2, 3, 4, 5],
    };
    const result = evaluateShell(new THREE.BoxGeometry(10, 10, 10), [cap(5, [0, 1, 0]), side], 1);
    const validation = validateSolidGeometry(result);
    assert(validation.valid, validation.errors.join(', '));
    assert(Math.abs(volume(result) - 350) < 1e-4, `shared rim must be removed, volume=${volume(result)}`);
    assert.deepEqual(result.boundingBox!.min.toArray(), [-5, -5, -5]);
    assert.deepEqual(result.boundingBox!.max.toArray(), [5, 5, 5]);
});

test('adjacent sides of a regular pentagonal prism join without an extra recessed notch', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const body = createEntity('extrude', 'pentagon');
    body.planeId = 'plane';
    body.profileType = 'polygon';
    body.points = [[10, 0], [3.0901699437, 9.510565163], [-8.090169944, 5.877852523], [-8.090169944, -5.877852523], [3.0901699437, -9.510565163]];
    body.depth = 10;
    body.position = [0, 0, 0];
    document.entities.push(body);
    const mesh = buildEntityMesh(body, document);
    mesh.geometry.computeBoundingBox();
    const topology = buildMeshTopology(mesh.geometry, body.id, body, document);
    const sides = topology.faces.filter((face) => face.planar && Math.abs(face.normal[1]) < 1e-6);
    const shared = topology.logicalEdges.find((edge) => edge.faceIds.length === 2 && edge.faceIds.every((id) => sides.some((face) => face.id === id)))!;
    const openings = shared.faceIds.map((id): ShellOpening => {
        const face = topology.faces.find((item) => item.id === id)!;
        const vertices: [number, number, number][] = [], indices: number[] = [];
        face.triangleIds.forEach((triangleId) => topology.triangles[triangleId].renderVertices.forEach((renderVertex) => {
            vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, renderVertex).toArray());
            indices.push(indices.length);
        }));
        return { normal: face.normal, vertices, indices };
    });
    const result = evaluateShell(mesh.geometry, openings, 1);
    const validation = validateSolidGeometry(result);
    assert(validation.valid, validation.errors.join(', '));
    assert(Math.abs(validation.volume - 753.0035985994373) < 1e-4, `volume=${validation.volume}`);
    assert(Math.abs(result.boundingBox!.min.z - mesh.geometry.boundingBox!.min.z) < 1e-6, 'shared-edge joint must not recess the original outer silhouette');
    assert.deepEqual(result.boundingBox!.max.toArray(), mesh.geometry.boundingBox!.max.toArray());
});
