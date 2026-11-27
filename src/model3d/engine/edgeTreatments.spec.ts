import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyEdgeTreatments, resolveEdgeTreatment } from './modeling/EdgeTreatments';
import { evaluateBoolean, initializeManifold } from './modeling/ManifoldKernel';
import type { EdgeTreatment, ModelEntity } from '../types';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { buildMeshTopology } from './topology/MeshTopology';
import { createDocument, createEntity } from '../types';
import { ref } from 'vue';
import { useEdgeTreatmentOperations } from '../composables/useEdgeTreatmentOperations';

await initializeManifold();

const treatment: EdgeTreatment = {
    id: 'edge', type: 'chamfer', size: 3,
    edge: { a: [20, 20, -20], b: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0]] },
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

test('chamfer cuts only the referenced box edge and retains outer bounds', async () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const result = applyEdgeTreatments(base, [treatment]);
    result.computeBoundingBox();
    assert.ok(volume(result) < volume(base));
    assert.deepEqual(result.boundingBox!.min.toArray(), [-20, -20, -20]);
    assert.deepEqual(result.boundingBox!.max.toArray(), [20, 20, 20]);
    const { buildMeshTopology } = await import('./topology/MeshTopology');
    const { createDocument, createEntity } = await import('../types');
    const document = createDocument();
    const entity = createEntity('box', 'box');
    const topology = buildMeshTopology(result, 'box', entity, document);
    assert.equal(topology.faces.length, 7);
    assert.ok(topology.faces.every((face) => face.planar), 'chamfer must create a planar bevel, never a fillet surface');
    base.dispose(); result.dispose();
});

test('fillet produces a curved edge with more render vertices than chamfer', () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const chamfer = applyEdgeTreatments(base, [treatment]);
    const fillet = applyEdgeTreatments(base, [{ ...treatment, type: 'fillet' }]);
    assert.ok(fillet.attributes.position.count > chamfer.attributes.position.count);
    assert.ok(volume(fillet) < volume(base));
    base.dispose(); chamfer.dispose(); fillet.dispose();
});


test('a triangular-prism fillet is a true radius-r cylinder tangent to both non-orthogonal faces', () => {
    const radius = 4;
    const base = new THREE.CylinderGeometry(30, 30, 40, 3, 1, false);
    const document = createDocument();
    const entity = createEntity('cylinder', 'prism');
    const topology = buildMeshTopology(base, entity.id, entity, document);
    const edge = topology.logicalEdges.find((item) => {
        if (item.faceIds.length !== 2 || item.points.length < 2) return false;
        return Math.abs(item.points[0][1] - item.points[item.points.length - 1][1]) > 30;
    })!;
    const a = new THREE.Vector3(...edge.points[0]);
    const b = new THREE.Vector3(...edge.points[edge.points.length - 1]);
    const normals = edge.faceIds.map((id) => new THREE.Vector3(...topology.faces.find((face) => face.id === id)!.normal).normalize());
    assert.ok(Math.abs(normals[0].dot(normals[1])) > 0.1, 'fixture must use a non-right dihedral angle');
    const dot = normals[0].dot(normals[1]);
    const center = a.clone().add(normals[0].clone().add(normals[1]).multiplyScalar(-radius / (1 + dot)));
    const result = applyEdgeTreatments(base, [{
        id: 'prism-edge', type: 'fillet', size: radius,
        edge: { a: a.toArray(), b: b.toArray(), normals: normals.map((normal) => normal.toArray()) },
    }]);
    const position = result.attributes.position;
    const indices = result.index ? Array.from(result.index.array) : [];
    const hasVertex = (expected: THREE.Vector3) => indices.some((index) => new THREE.Vector3().fromBufferAttribute(position, index).distanceTo(expected) < 2e-4);
    const tangentPoints = normals.map((normal) => center.clone().addScaledVector(normal, radius));
    const arcMiddle = center.clone().add(normals[0].clone().add(normals[1]).normalize().multiplyScalar(radius));
    for (const axialPoint of [a, b]) {
        const offset = axialPoint.clone().sub(a);
        tangentPoints.forEach((point) => assert.ok(hasVertex(point.clone().add(offset)), 'both face tangency points must be present'));
        assert.ok(hasVertex(arcMiddle.clone().add(offset)), 'the circular arc midpoint must lie on the non-orthogonal edge fillet');
    }
    assert.equal(validateSolidGeometry(result).valid, true);
    base.dispose(); result.dispose();
});

test('a full-width edge chamfer produces a closed right triangular prism', () => {
    const base = new THREE.BoxGeometry(40, 40, 40);
    const result = applyEdgeTreatments(base, [{ ...treatment, size: 40 }]);
    assert.equal(validateSolidGeometry(result).valid, true);
    assert.ok(Math.abs(volume(result) - 32000) < 1e-4);
    assert.deepEqual(result.boundingBox!.max.toArray(), [20, 20, 20]);
    base.dispose(); result.dispose();
});

test('a generated parallel edge resolves to its original treatment', () => {
    const entity = { edgeTreatments: [treatment] } as ModelEntity;
    const anchor = { localEdge: { a: [18, 20, -20], b: [18, 20, 20], normals: treatment.edge.normals } } as GeometryAnchor;
    assert.equal(resolveEdgeTreatment(entity, anchor)?.id, 'edge');
});

test('baking a body does not apply its parametric edge treatment twice', async () => {
    const { buildEntityMesh } = await import('./geometry');
    const { bakeEntityGeometry } = await import('./modeling/BakedGeometry');
    const { createDocument, createEntity } = await import('../types');
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.edgeTreatments = [treatment];
    const before = buildEntityMesh(entity, document);
    bakeEntityGeometry(entity, document);
    const after = buildEntityMesh(entity, document);
    assert.ok(Math.abs(volume(before.geometry) - volume(after.geometry)) < 1e-6);
    before.geometry.dispose(); after.geometry.dispose();
});

test('edge treatments follow A/B/C face drags instead of remaining at the old edge', async () => {
    const { buildEntityMesh } = await import('./geometry');
    const { createDocument, createEntity } = await import('../types');
    for (const axis of [0, 1, 2] as const) {
        const document = createDocument();
        const entity = createEntity('box', 'box');
        entity.edgeTreatments = [treatment];
        const normal: [number, number, number] = [0, 0, 0];
        normal[axis] = 1;
        const vertices: [number, number, number][] = axis === 0
            ? [[20, -20, -20], [20, 20, -20], [20, 20, 20], [20, -20, 20]]
            : axis === 1 ? [[-20, 20, -20], [20, 20, -20], [20, 20, 20], [-20, 20, 20]]
            : [[-20, -20, 20], [20, -20, 20], [20, 20, 20], [-20, 20, 20]];
        entity.faceOffset = { normal, distance: 10, vertices, indices: [0, 1, 2, 0, 2, 3], faceIds: [`face-${axis}`] };
        const result = buildEntityMesh(entity, document);

        const size: [number, number, number] = [40, 40, 40];
        size[axis] += 10;
        const center: [number, number, number] = [0, 0, 0];
        center[axis] = 5;
        const base = new THREE.BoxGeometry(...size);
        base.translate(...center);
        const movedTreatment = JSON.parse(JSON.stringify(treatment)) as EdgeTreatment;
        if (axis === 2) movedTreatment.edge.b[axis] += 10;
        else {
            movedTreatment.edge.a[axis] += 10;
            movedTreatment.edge.b[axis] += 10;
        }
        const expected = applyEdgeTreatments(base, [movedTreatment]);
        assert.ok(Math.abs(volume(result.geometry) - volume(expected)) < 1e-5, `face ${axis} produced a joined old/new body`);
        result.geometry.dispose(); expected.dispose(); base.dispose();
    }
});

test('a boolean step concave edge adds a tangent weld-like fillet', () => {
    const slab = new THREE.BoxGeometry(40, 10, 40).translate(0, 5, 0);
    const column = new THREE.BoxGeometry(10, 30, 10).translate(-15, 20, -15);
    const stepped = evaluateBoolean(slab, column, 'union');
    const radius = 3;
    const result = applyEdgeTreatments(stepped, [{
        id: 'concave-step', type: 'fillet', size: radius,
        edge: { a: [-10, 10, -20], b: [-10, 10, -10], normals: [[1, 0, 0], [0, 1, 0]] },
    }]);

    assert.ok(volume(result) > volume(stepped) + 0.05, 'a concave fillet must add weld material instead of cutting the step');
    assert.equal(validateSolidGeometry(result).valid, true, JSON.stringify(validateSolidGeometry(result)));
    assert.equal(validateSolidGeometry(result).components, 1);
    const entity = createEntity('box', 'step');
    const topology = buildMeshTopology(result, entity.id, entity, createDocument());
    assert.ok(topology.faces.some((face) => !face.planar), 'the concave edge must expose a curved weld surface');
    const indices = result.index ? Array.from(result.index.array) : [];
    const hasVertex = (expected: THREE.Vector3) => indices.some((index) => new THREE.Vector3().fromBufferAttribute(result.attributes.position, index).distanceTo(expected) < 2e-4);
    const center = new THREE.Vector3(-7, 13, 0);
    const overlap = Math.max(0.01, radius * 0.01);
    for (const z of [-20 - overlap, -10 + overlap]) {
        assert.ok(hasVertex(new THREE.Vector3(-7, 10, z)), 'the top-plane tangent point must be retained');
        assert.ok(hasVertex(new THREE.Vector3(-10, 13, z)), 'the column-plane tangent point must be retained');
        const arcMiddle = center.clone().add(new THREE.Vector3(-1, -1, 0).normalize().multiplyScalar(radius));
        arcMiddle.z = z;
        assert.ok(hasVertex(arcMiddle), 'the weld arc must bulge toward the original concave edge');
    }

    slab.dispose(); column.dispose(); stepped.dispose(); result.dispose();
});

test('adjacent concave treatments extend into a 45-degree junction by default', () => {
    for (const type of ['fillet', 'chamfer'] as const) {
        const slab = new THREE.BoxGeometry(40, 10, 40).translate(0, 5, 0);
        const column = new THREE.BoxGeometry(10, 30, 10).translate(-15, 20, -15);
        const stepped = evaluateBoolean(slab, column, 'union');
        const radius = 3;
        const treatments: EdgeTreatment[] = [{
            id: 'concave-z', type, size: radius,
            edge: { a: [-10, 10, -20], b: [-10, 10, -10], normals: [[1, 0, 0], [0, 1, 0]] },
        }, {
            id: 'concave-x', type, size: radius,
            edge: { a: [-20, 10, -10], b: [-10, 10, -10], normals: [[0, 0, 1], [0, 1, 0]] },
        }];
        const result = applyEdgeTreatments(stepped, treatments);
        const indices = result.index ? Array.from(result.index.array) : [];
        const hasVertex = (expected: THREE.Vector3) => indices.some((index) => new THREE.Vector3().fromBufferAttribute(result.attributes.position, index).distanceTo(expected) < 2e-4);

        assert.equal(validateSolidGeometry(result).valid, true, JSON.stringify(validateSolidGeometry(result)));
        assert.ok(hasVertex(new THREE.Vector3(-7, 10, -7)), `${type} treatments must meet on the 45-degree plane x = z at their shared corner`);

        slab.dispose(); column.dispose(); stepped.dispose(); result.dispose();
    }
});

test('disabling either side of an adjacent concave junction retains square ends', () => {
    const slab = new THREE.BoxGeometry(40, 10, 40).translate(0, 5, 0);
    const column = new THREE.BoxGeometry(10, 30, 10).translate(-15, 20, -15);
    const stepped = evaluateBoolean(slab, column, 'union');
    const treatments: EdgeTreatment[] = [{
        id: 'concave-z', type: 'fillet', size: 3, joinAdjacent: false,
        edge: { a: [-10, 10, -20], b: [-10, 10, -10], normals: [[1, 0, 0], [0, 1, 0]] },
    }, {
        id: 'concave-x', type: 'fillet', size: 3,
        edge: { a: [-20, 10, -10], b: [-10, 10, -10], normals: [[0, 0, 1], [0, 1, 0]] },
    }];
    const result = applyEdgeTreatments(stepped, treatments);
    const indices = result.index ? Array.from(result.index.array) : [];
    const hasJoinedVertex = indices.some((index) => new THREE.Vector3().fromBufferAttribute(result.attributes.position, index).distanceTo(new THREE.Vector3(-7, 10, -7)) < 2e-4);

    assert.equal(hasJoinedVertex, false, 'one disabled side must disable the shared 45-degree extension');
    assert.equal(validateSolidGeometry(result).valid, true, JSON.stringify(validateSolidGeometry(result)));

    slab.dispose(); column.dispose(); stepped.dispose(); result.dispose();
});

test('edge panel join state defaults from treated neighbors and saves a manual override', () => {
    const document = ref(createDocument());
    const entity = createEntity('box', 'step');
    const neighbor: EdgeTreatment = {
        id: 'concave-z', type: 'fillet', size: 3,
        edge: { a: [-10, 10, -20], b: [-10, 10, -10], normals: [[1, 0, 0], [0, 1, 0]] },
    };
    entity.edgeTreatments = [neighbor];
    document.value.entities.push(entity);
    const anchor = {
        id: entity.id, type: 'edge', finalTopology: false,
        localEdge: { a: [-20, 10, -10], b: [-10, 10, -10], normals: [[0, 0, 1], [0, 1, 0]] },
    } as GeometryAnchor;
    let history = 0;
    const operations = useEdgeTreatmentOperations({
        document, activeTool: ref('select') as any, viewport: () => ({ getGeometryAnchor: () => anchor } as any),
        message: { warning: () => undefined } as any, pushHistory: () => { history++; }, popHistory: () => undefined, setTool: () => undefined,
    });

    assert.equal(operations.getSelectedEdgeJoinState(), true, 'a treated neighbor enables the default');
    operations.updateEdgeTreatmentJoin(false);
    assert.equal(entity.edgeTreatments?.length, 2);
    assert.equal(entity.edgeTreatments?.[1]?.size, 0, 'the panel can save the option before a size is dragged');
    assert.equal(operations.getSelectedEdgeJoinState(), false);
    operations.updateEdgeTreatmentJoin(true);
    assert.equal(operations.getSelectedEdgeJoinState(), true);
    assert.equal(history, 2);

    entity.edgeTreatments = [];
    assert.equal(operations.getSelectedEdgeJoinState(), false, 'an isolated edge defaults to off');
});
