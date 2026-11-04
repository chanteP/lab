import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMeshTopology } from './topology/MeshTopology';
import { createTopologyEdgeGeometry } from './viewport/TopologyEdges';
import { pickLogicalEdge } from './viewport/EdgePicker';
import { createDocument, createEntity } from '../types';

function fixture(camera: THREE.PerspectiveCamera) {
    const entity = createEntity('box', 'body');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    mesh.userData.entityId = entity.id;
    const topology = buildMeshTopology(mesh.geometry, entity.id, entity, createDocument());
    mesh.userData.topology = topology;
    const display = createTopologyEdgeGeometry(topology);
    const lines = new THREE.LineSegments(display.geometry);
    lines.userData.displayEdge = true;
    lines.userData.segmentEdgeIds = display.segmentEdgeIds;
    mesh.add(lines);
    const model = new THREE.Group();
    model.add(mesh);
    model.updateMatrixWorld(true);
    return { model, edge: topology.logicalEdges[0] };
}

test('edge picking uses CSS pixels and accepts a visible projected logical edge', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000);
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const { model } = fixture(camera);
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement;
    let hit: THREE.Intersection | null = null;
    for (const candidate of (model.children[0] as THREE.Mesh).userData.topology?.logicalEdges || []) {
        const midpoint = new THREE.Vector3(...candidate.segments[0].a).add(new THREE.Vector3(...candidate.segments[0].b)).multiplyScalar(0.5).project(camera);
        const event = { clientX: (midpoint.x + 1) * 400, clientY: (1 - midpoint.y) * 300 } as PointerEvent;
        hit ||= pickLogicalEdge({ camera, canvas, model, event, thresholdPx: 8, selectThrough: false });
    }
    assert(hit, 'at least one camera-facing edge must be pickable with occlusion enabled');
});

test('hidden edges require explicit Select Through', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000);
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const { model, edge } = fixture(camera);
    const hidden = model.children[0].children[0] as THREE.LineSegments;
    hidden.visible = false;
    const midpoint = new THREE.Vector3(...edge.segments[0].a).add(new THREE.Vector3(...edge.segments[0].b)).multiplyScalar(0.5).project(camera);
    const event = { clientX: (midpoint.x + 1) * 400, clientY: (1 - midpoint.y) * 300 } as PointerEvent;
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement;
    assert.equal(pickLogicalEdge({ camera, canvas, model, event, thresholdPx: 8, selectThrough: true }), null);
    assert.equal(pickLogicalEdge({ camera, canvas, model, event, thresholdPx: 8, selectThrough: true }), null, 'Select Through does not include display-disabled edges');
});

test('occluded back edges never win over a front face even with larger hot zones', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000);
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const { model } = fixture(camera);
    const topology = (model.children[0] as THREE.Mesh).userData.topology;
    const back = topology.logicalEdges.find((edge: any) => {
        const middle = new THREE.Vector3(...edge.segments[0].a).add(new THREE.Vector3(...edge.segments[0].b));
        return middle.x + middle.y + middle.z < 0;
    });
    const midpoint = new THREE.Vector3(...back.segments[0].a).add(new THREE.Vector3(...back.segments[0].b)).multiplyScalar(0.5).project(camera);
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement;
    const event = { clientX: (midpoint.x + 1) * 400, clientY: (1 - midpoint.y) * 300 } as PointerEvent;
    assert.equal(pickLogicalEdge({ camera, canvas, model, event, thresholdPx: 16, selectThrough: false }), null);
    assert.ok(pickLogicalEdge({ camera, canvas, model, event, thresholdPx: 16, selectThrough: true }));
});
