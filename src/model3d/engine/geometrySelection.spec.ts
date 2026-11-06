import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GeometrySelector, measureSelectionStats, type GeometryAnchor } from './viewport/GeometrySelector';
import { buildMeshTopology } from './topology/MeshTopology';
import { createTopologyEdgeGeometry } from './viewport/TopologyEdges';
import { planeHelperPosition } from './viewport/SceneSynchronizer';
import { INTERACTION } from '../config/const';
import { createDocument, createEntity } from '../types';
import { buildEntityMesh } from './geometry';
import { initializeManifold } from './modeling/ManifoldKernel';

await initializeManifold();

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

test('selection stats measure only selected bodies and their combined world bounds', () => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 10));
    a.userData.entityId = 'a';
    b.userData.entityId = 'b';
    b.position.x = 20;

    const stats = measureSelectionStats([a, b], ['a', 'b'], 'mixed', null);

    assert.equal(stats?.objects, 2);
    assert.equal(stats?.faces, 0);
    assert.equal(stats?.triangles, 24);
    assert.deepEqual(stats?.size, [30, 20, 10]);
    assert.equal(measureSelectionStats([a, b], [], null, null), null);
});

test('face selection stats use face triangles and bounds instead of the whole body', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30));
    mesh.userData.entityId = 'box';
    mesh.position.set(5, 10, 15);
    mesh.updateMatrixWorld(true);
    const anchor = new GeometrySelector().createFaceAnchor(hit(mesh, 0));

    const stats = measureSelectionStats([mesh], ['box'], 'face', anchor as GeometryAnchor);

    assert.equal(stats?.objects, 0);
    assert.equal(stats?.faces, 1);
    assert.equal(stats?.triangles, 2);
    assert.deepEqual(stats?.size, [0, 20, 30]);
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

test('coplanar disconnected fragments remain independent logical faces', () => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(2, 0, 0), new THREE.Vector3(3, 0, 0), new THREE.Vector3(2, 0, 1),
    ]);
    const mesh = new THREE.Mesh(geometry);
    const selector = new GeometrySelector();
    const anchor = selector.createFaceAnchor(hit(mesh, 0));

    assert.equal(anchor.planar, true);
    assert.equal(anchor.vertices.length, 3);
    assert.notEqual(selector.createFaceAnchor(hit(mesh, 0)).key, selector.createFaceAnchor(hit(mesh, 1)).key);
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

test('face anchors rebind to the current topology after direct face extrusion', () => {
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.position = [0, 0, 0];
    document.entities.push(entity);
    const mesh = buildEntityMesh(entity, document);
    mesh.userData.topology = buildMeshTopology(mesh.geometry, entity.id, entity, document);
    const selector = new GeometrySelector();
    const face = mesh.userData.topology.faces.find((item) => item.normal[1] > 0.99)!;
    const anchor = selector.createFaceAnchor(hit(mesh, face.triangleIds[0]), entity);
    entity.faceOffset = { normal: [0, 1, 0], distance: 5, vertices: anchor.vertices, indices: anchor.indices, faceIds: anchor.faceIds };
    const nextMesh = buildEntityMesh(entity, document);
    const model = new THREE.Group();
    model.add(nextMesh);

    const rebound = selector.rebindAnchor(anchor, model, document)!;

    assert.equal(rebound.point[1], 25);
    assert.ok((rebound.feedbackVertices || rebound.vertices).every((point) => Math.abs(point[1] - 25) < 1e-4));
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

test('circular logical-edge highlighting follows the ordered seam without cross-loop jumps', () => {
    const radius = 10;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 20, 32));
    mesh.userData.entityId = 'cylinder';
    const topology = buildMeshTopology(mesh.geometry, 'cylinder', Object.assign(createEntity('cylinder', 'cylinder'), { radius }), createDocument());
    mesh.userData.topology = topology;
    const display = createTopologyEdgeGeometry(topology);
    const lines = new THREE.LineSegments(display.geometry);
    lines.userData.segmentEdgeIds = display.segmentEdgeIds;
    mesh.add(lines);
    mesh.updateMatrixWorld(true);
    const anchor = new GeometrySelector().createEdgeAnchor({ object: lines, index: 0 } as unknown as THREE.Intersection);
    const maxChord = 2 * radius * Math.sin(Math.PI / 32) + 0.001;
    for (let index = 1; index < anchor.vertices.length; index++) {
        assert(new THREE.Vector3(...anchor.vertices[index]).distanceTo(new THREE.Vector3(...anchor.vertices[index - 1])) <= maxChord, 'highlight must not connect unrelated arc vertices');
    }
});


test('a stale triangle-face mapping falls back to the hit triangle instead of throwing', () => {
    const document = createDocument();
    const entity = createEntity('box', 'box');
    document.entities.push(entity);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    mesh.userData.entityId = entity.id;
    const topology = buildMeshTopology(mesh.geometry, entity.id, entity, document);
    topology.triangleFaceIds = topology.triangleFaceIds.map(() => 'deleted-face');
    mesh.userData.topology = topology;
    const selector = new GeometrySelector();
    assert.doesNotThrow(() => selector.createFaceAnchor(hit(mesh, 0), entity));
});


test('construction plane helpers offset only their display position in the negative normal direction', () => {
    const plane = { id: 'p', name: 'P', kind: 'XZ' as const, origin: [1, 2, 3] as [number, number, number], normal: [0, 0, 1] as [number, number, number], u: [1, 0, 0] as [number, number, number], v: [0, 1, 0] as [number, number, number], visible: true };
    assert.deepEqual(planeHelperPosition(plane), [1, 2, 3 - INTERACTION.planeHelperOffset]);
    assert.deepEqual(plane.origin, [1, 2, 3], 'the modeling plane coordinates must not be changed');
});
