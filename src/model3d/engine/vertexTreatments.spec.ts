import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyVertexTreatments } from './modeling/VertexTreatments';
import { initializeManifold } from './modeling/ManifoldKernel';
import { buildMeshTopology } from './topology/MeshTopology';
import { buildEntityMesh } from './geometry';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { createDocument, createEntity, type VertexTreatment } from '../types';
import { buildVertexRoundingCutter, VERTEX_ROUNDING_CENTER_RATIO } from './modeling/VertexRoundingGeometry';

await initializeManifold();

const treatment: VertexTreatment = {
    id: 'corner', type: 'chamfer', size: 3,
    vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
};

test('convex rounding cutter is a closed oriented solid', () => {
    const cutter = buildVertexRoundingCutter(3, [20, 20, 20], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    const result = validateSolidGeometry(cutter);
    assert.equal(result.valid, true, JSON.stringify(result));
    cutter.dispose();
});

test('rounding center stays outside the boundary chord instead of collapsing into a recess', () => {
    assert.ok(VERTEX_ROUNDING_CENTER_RATIO > 1 / (2 - Math.SQRT1_2));
    assert.ok(VERTEX_ROUNDING_CENTER_RATIO >= 0.87 && VERTEX_ROUNDING_CENTER_RATIO < 0.9, '101-point symmetry profiles must not reintroduce the concave intervals present at 0.86');
});

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
    const indices = result.index ? Array.from(result.index.array) : [];
    assert.equal(indices.some((index) => new THREE.Vector3().fromBufferAttribute(result.attributes.position, index).distanceTo(new THREE.Vector3(20, 20, 20)) < 1e-5), false);
    base.dispose(); result.dispose();
});

test('all cube corners remove sharp remnants and expose the external spherical surface', () => {
    const cases = [3, 8].flatMap((size) => [1, -1].flatMap((x) => [1, -1].flatMap((y) => [1, -1].map((z) => ({ size, signs: [x, y, z] })))));
    for (const { size, signs } of cases) {
        const point = signs.map((sign) => sign * 20) as [number, number, number];
        const normals = signs.map((sign, axis) => [0, 0, 0].map((value, index) => index === axis ? sign : value)) as [number, number, number][];
        const corner = new THREE.Vector3(...point);
        const base = new THREE.BoxGeometry(40, 40, 40);
        const vertexTreatment = { ...treatment, type: 'fillet' as const, size, vertex: { point, normals } };
        const result = applyVertexTreatments(base, [vertexTreatment]);
        assert.ok(volume(result) < volume(base) - 0.05, 'fillet must remove material instead of only retessellating the box');
        assert.equal(validateSolidGeometry(result).valid, true, `corner ${point.join(',')} must remain a closed solid`);
        const position = result.attributes.position;
        const indices = result.index ? Array.from(result.index.array) : Array.from({ length: position.count }, (_, index) => index);
        for (const other of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]) {
            if (other.every((sign, axis) => sign === signs[axis])) continue;
            const untouched = new THREE.Vector3(other[0] * 20, other[1] * 20, other[2] * 20);
            const preserved = indices.some((index) => new THREE.Vector3().fromBufferAttribute(position, index).distanceTo(untouched) < 1e-4);
            assert.equal(preserved, true, `untreated corner ${other.join(',')} must remain sharp and unchanged`);
        }
        const sharpRemnant = indices.map((index) => new THREE.Vector3().fromBufferAttribute(position, index)).some((vertex) => vertex.distanceTo(corner) < 0.05);
        assert.equal(sharpRemnant, false, `corner ${point.join(',')} must not retain sharp fragments at radius ${size}`);
        const normal = new THREE.Vector3(...signs).normalize();
        const origin = corner.clone().addScaledVector(normal, 60);
        const direction = corner.clone().sub(origin);
        direction.x *= 1.01;
        const ray = new THREE.Raycaster(origin, direction.normalize());
        const firstHit = ray.intersectObject(new THREE.Mesh(result, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), false)[0];
        assert.ok(firstHit, `corner ${point.join(',')} at radius ${size} must expose a rounded outer surface`);
        const axisAligned = normals.some((normal) => Math.abs(firstHit.face!.normal.dot(new THREE.Vector3(...normal))) > 0.999);
        assert.equal(axisAligned, false, `corner ${point.join(',')} must expose curved fillet geometry`);
        base.dispose(); result.dispose();
    }
});

test('vertex rounding replaces the corner with one convex tangent patch without chamfer bands', () => {
    const radius = 3;
    const base = new THREE.BoxGeometry(40, 40, 40);
    const result = applyVertexTreatments(base, [{ ...treatment, type: 'fillet', size: radius }]);
    const entity = createEntity('box', 'box');
    entity.vertexTreatments = [{ ...treatment, type: 'fillet', size: radius }];
    const topology = buildMeshTopology(result, 'box', entity, createDocument());
    const cutter = buildVertexRoundingCutter(radius, [20, 20, 20], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    assert.ok(Math.abs((volume(base) - volume(result)) - volume(cutter)) < 1e-4);

    assert.equal(validateSolidGeometry(result).valid, true);
    assert.equal(topology.faces.filter((face) => face.planar).length, 6);
    assert.equal(topology.faces.filter((face) => !face.planar).length, 1);
    topology.faces.filter((face) => face.planar).forEach((face) => face.triangleIds.forEach((id) => {
        topology.triangles[id].renderVertices.forEach((vertex) => {
            const normal = new THREE.Vector3().fromBufferAttribute(result.attributes.normal, vertex);
            assert.ok(normal.dot(new THREE.Vector3(...face.normal)) > 0.999, 'adjacent planes must retain flat render normals');
        });
    }));
    const origin = new THREE.Vector3(80, 80, 80);
    const direction = new THREE.Vector3(-1, -1, -1).normalize();
    const hit = new THREE.Raycaster(origin, direction).intersectObject(new THREE.Mesh(result), false)[0];
    assert.ok(hit);
    const expectedCenter = 20 - radius + radius * VERTEX_ROUNDING_CENTER_RATIO;
    assert.ok(Math.abs(hit.point.x - expectedCenter) < 0.05, 'the diagonal surface must bulge outward instead of forming a spherical recess');

    const positions = result.attributes.position;
    const indices = result.index ? Array.from(result.index.array) : [];
    for (const point of [[20, 20, 17], [20, 17, 20], [17, 20, 20]] as [number, number, number][]) {
        assert.ok(indices.some((index) => new THREE.Vector3().fromBufferAttribute(positions, index).distanceTo(new THREE.Vector3(...point)) < 1e-4));
    }
    base.dispose(); result.dispose(); cutter.dispose();
});

test('a corner fillet creates a curved surface and follows a later face drag', () => {
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.vertexTreatments = [{ ...treatment, type: 'fillet' }];
    entity.faceOffset = {
        normal: [1, 0, 0], distance: 10,
        vertices: [[20, -20, -20], [20, 20, -20], [20, 20, 20], [20, -20, 20]], indices: [0, 1, 2, 0, 2, 3], faceIds: ['right'],
    };
    const result = buildEntityMesh(entity, document);
    const topology = buildMeshTopology(result.geometry, entity.id, entity, document);
    assert.ok(topology.faces.some((face) => !face.planar));
    const expectedBase = new THREE.BoxGeometry(50, 40, 40);
    expectedBase.translate(5, 0, 0);
    const expected = applyVertexTreatments(expectedBase, [{ ...treatment, type: 'fillet', vertex: { ...treatment.vertex, point: [30, 20, 20] } }], entity, document);
    assert.ok(Math.abs(volume(result.geometry) - volume(expected)) < Math.max(1e-5, volume(expected) * 0.001));
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

test('vertex rounding retains an existing incident edge chamfer outside the spherical region', async () => {
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.edgeTreatments = [{
        id: 'edge', type: 'chamfer', size: 2,
        edge: { a: [20, 20, -20], b: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0]] },
    }];
    entity.vertexTreatments = [{ ...treatment, type: 'fillet' }];
    const result = buildEntityMesh(entity, document);
    const topology = buildMeshTopology(result.geometry, entity.id, entity, document);
    const curved = topology.faces.filter((face) => !face.planar);

    assert.equal(validateSolidGeometry(result.geometry).valid, true);
    assert.ok(curved.length >= 1);
    assert.ok(curved.every((face) => face.domain.kind !== 'cylinder'), 'an existing edge chamfer may split but must not extend the vertex sphere into a cylinder');
    const edgeOnly = (await import('./modeling/EdgeTreatments')).applyEdgeTreatments(new THREE.BoxGeometry(40, 40, 40), entity.edgeTreatments);
    assert.ok(volume(result.geometry) < volume(edgeOnly));
    result.geometry.dispose(); edgeOnly.dispose();
});
