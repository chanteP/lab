import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyVertexTreatments } from './modeling/VertexTreatments';
import { initializeManifold } from './modeling/ManifoldKernel';
import { buildMeshTopology } from './topology/MeshTopology';
import { buildEntityMesh } from './geometry';
import { createDocument, createEntity, type VertexTreatment } from '../types';

await initializeManifold();

const treatment: VertexTreatment = {
    id: 'corner', type: 'chamfer', size: 3,
    vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
};

function volume(geometry: THREE.BufferGeometry) {
    const position = geometry.attributes.position, index = geometry.index;
    let sum = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let offset = 0; offset < (index?.count || position.count); offset += 3) {
        const ids = [0, 1, 2].map((corner) => index ? index.getX(offset + corner) : offset + corner);
        a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2]);
        sum += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(sum);
}

test('a corner chamfer creates one planar triangular face', () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const result = applyVertexTreatments(base, [treatment]);
    const entity = createEntity('box', 'box');
    const topology = buildMeshTopology(result, entity.id, entity, createDocument());
    assert.ok(volume(result) < volume(base));
    assert.equal(topology.faces.length, 7);
    assert.ok(topology.faces.every((face) => face.planar));
    base.dispose(); result.dispose();
});

test('a corner fillet creates a curved surface and follows a later face drag', () => {
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.vertexTreatments = [{ ...treatment, type: 'fillet' }];
    entity.faceOffset = {
        normal: [1, 0, 0], distance: 10,
        vertices: [[20, -20, -20], [20, 20, -20], [20, 20, 20], [20, -20, 20]], indices: [0, 1, 2, 0, 2, 3], faceIds: ['right'],
    };
    const direct = applyVertexTreatments(new THREE.BoxGeometry(50, 40, 40), [{ ...treatment, type: 'fillet', vertex: { ...treatment.vertex, point: [30, 20, 20] } }]);
    const result = buildEntityMesh(entity, document);
    const topology = buildMeshTopology(result.geometry, entity.id, entity, document);
    assert.ok(topology.faces.some((face) => !face.planar));
    const expectedBase = new THREE.BoxGeometry(50, 40, 40);
    expectedBase.translate(5, 0, 0);
    const expected = applyVertexTreatments(expectedBase, [{ ...treatment, type: 'fillet', vertex: { ...treatment.vertex, point: [30, 20, 20] } }]);
    assert.ok(Math.abs(volume(result.geometry) - volume(expected)) < 1e-5);
    result.geometry.dispose(); expectedBase.dispose(); expected.dispose();
});

test('topological corners are pickable and use the same signed treatment gesture', async () => {
    const { pickLogicalVertex } = await import('./viewport/VertexPicker');
    const { GeometrySelector } = await import('./viewport/GeometrySelector');
    const { useEdgeTreatmentOperations } = await import('../composables/useEdgeTreatmentOperations');
    const { ref } = await import('vue');
    const document = ref(createDocument());
    const entity = createEntity('box', 'box');
    document.value.entities.push(entity);
    const mesh = buildEntityMesh(entity, document.value);
    mesh.userData.entityId = entity.id;
    mesh.userData.topology = buildMeshTopology(mesh.geometry, entity.id, entity, document.value);
    const model = new THREE.Group();
    model.add(mesh); model.updateMatrixWorld(true);
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
    camera.position.set(80, 80, 80); camera.lookAt(0, 20, 0); camera.updateMatrixWorld(true);
    const point = new THREE.Vector3(20, 40, 20).project(camera);
    const hit = pickLogicalVertex({
        camera, canvas: { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement,
        model, event: { clientX: (point.x + 1) * 400, clientY: (1 - point.y) * 300 } as PointerEvent,
        thresholdPx: 18, selectThrough: false,
    });
    assert.ok(hit);
    const anchor = new GeometrySelector().createVertexAnchor(hit!)!;
    assert.equal(anchor.type, 'vertex');
    assert.equal(anchor.localVertex?.normals.length, 3);
    const operations = useEdgeTreatmentOperations({
        document, activeTool: ref('select') as any, viewport: () => ({ getGeometryAnchor: () => anchor } as any),
        message: { warning: () => undefined, error: () => undefined } as any,
        pushHistory: () => undefined, popHistory: () => undefined, setTool: () => undefined,
    });
    operations.onEdgeTreatmentEdit(entity.id, anchor.localNormal, 0, 'start', anchor);
    operations.onEdgeTreatmentEdit(entity.id, anchor.localNormal, -4, 'move');
    operations.onEdgeTreatmentEdit(entity.id, anchor.localNormal, 0, 'end');
    assert.equal(entity.vertexTreatments?.[0].type, 'fillet');
    assert.equal(entity.vertexTreatments?.[0].size, 4);
    operations.updateEdgeTreatmentDistance(-2);
    assert.equal(entity.vertexTreatments?.[0].type, 'chamfer');
    assert.equal(entity.vertexTreatments?.[0].size, 2);
});


test('corner processing runs after adjacent edge processing', async () => {
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.edgeTreatments = [{
        id: 'edge', type: 'chamfer', size: 2,
        edge: { a: [20, 20, -20], b: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0]] },
    }];
    entity.vertexTreatments = [treatment];
    const result = buildEntityMesh(entity, document);
    const base = new THREE.BoxGeometry(40, 40, 40);
    const edgeFirst = applyVertexTreatments((await import('./modeling/EdgeTreatments')).applyEdgeTreatments(base, entity.edgeTreatments), entity.vertexTreatments);
    assert.ok(Math.abs(volume(result.geometry) - volume(edgeFirst)) < 1e-5);
    result.geometry.dispose(); base.dispose(); edgeFirst.dispose();
});
