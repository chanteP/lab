import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ref } from 'vue';
import { createDocument, createEntity, type EdgeTreatment, type ModelDocument, type Vec3, type VertexTreatment } from '../types';
import { buildEntityMesh, buildScene } from './geometry';
import { initializeManifold } from './modeling/ManifoldKernel';
import { resolveEdgeTreatment } from './modeling/EdgeTreatments';
import { resolveVertexTreatment } from './modeling/VertexTreatments';
import { SceneSynchronizer } from './viewport/SceneSynchronizer';
import { OverlayController } from './viewport/OverlayController';
import { pickLogicalEdge } from './viewport/EdgePicker';
import { pickLogicalVertex } from './viewport/VertexPicker';
import { GeometrySelector, type GeometryAnchor } from './viewport/GeometrySelector';
import { useEdgeTreatmentOperations } from '../composables/useEdgeTreatmentOperations';
import { GuideRenderer } from './viewport/GuideRenderer';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { hasDistinctVertexPriority } from './viewport/InteractionController';

await initializeManifold();

const treatment: EdgeTreatment = {
    id: 'top-right', type: 'chamfer', size: 3,
    edge: { a: [20, 20, -20], b: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0]] },
};

function fixture(treatments?: { edge?: EdgeTreatment[]; vertex?: VertexTreatment[] }): { document: ModelDocument; synchronizer: SceneSynchronizer } {
    const document = createDocument();
    const box = createEntity('box', 'box');
    box.edgeTreatments = treatments?.edge || [treatment];
    box.vertexTreatments = treatments?.vertex;
    document.entities.push(box);
    const synchronizer = new SceneSynchronizer({
        transform: { detach: () => undefined } as any,
        renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        isSketchMode: () => false, getTool: () => 'select', onStats: () => undefined, onContentRadius: () => undefined,
        onClearAltBorder: () => undefined, onClearSketchReferences: () => undefined, onUpdateExtrudeGuide: () => undefined,
        onRefreshSketchFaces: () => undefined, onRefreshSketchSelectionFeedback: () => undefined,
        onPlaneOrientation: () => undefined, isProfileIntersection: () => false, overlay: new OverlayController(),
    });
    synchronizer.sync(document);
    synchronizer.model.updateMatrixWorld(true);
    return { document, synchronizer };
}

function edgeAnchor(id = 'box'): GeometryAnchor {
    return {
        id, key: `${id}:edge:test`, type: 'edge', planar: false,
        normal: [1, 1, 0], localNormal: [1, 1, 0], point: [20, 20, 0], vertices: [[20, 20, -20], [20, 20, 20]], indices: [0, 1],
        localEdge: treatment.edge,
    };
}


function faceHit(mesh: THREE.Mesh, faceIndex: number) {
    const geometry = mesh.geometry, index = geometry.index;
    const vertices = [0, 1, 2].map((offset) => index ? index.getX(faceIndex * 3 + offset) : faceIndex * 3 + offset);
    const points = vertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, vertex));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    return { object: mesh, faceIndex, face: { a: vertices[0], b: vertices[1], c: vertices[2], normal }, point: points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3) } as unknown as THREE.Intersection;
}

test('treated boxes keep an invisible original topology proxy out of the export scene', () => {
    const { document, synchronizer } = fixture();
    assert.equal(buildScene(document).children.length, 1);
    const children = synchronizer.model.children.filter((child) => child.userData.entityId === 'box');
    assert.equal(children.length, 2);
    const proxy = children.find((child) => child.userData.selectionProxy)!;
    assert.equal(proxy.userData.topology.faces.length, 6);
    assert.equal(proxy.userData.topology.logicalEdges.length, 12);
    proxy.traverse((object) => {
        const material = (object as THREE.Mesh).material as THREE.Material | undefined;
        if (material) assert.equal(material.colorWrite, false);
    });
});

test('removed source edges lose their hot zones while trimmed final edges stay pickable and adjacent faces still extrude', () => {
    const { document, synchronizer } = fixture();
    const proxy = synchronizer.model.children.find((child) => child.userData.selectionProxy)!;
    const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
    camera.position.set(80, 80, 80); camera.lookAt(0, 20, 0); camera.updateMatrixWorld(true);
    const canvas = { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement;
    const sourcePoint = new THREE.Vector3(20, 40, 0).project(camera);
    const sourceHit = pickLogicalEdge({
        camera, canvas, model: synchronizer.model,
        event: { clientX: (sourcePoint.x + 1) * 400, clientY: (1 - sourcePoint.y) * 300 } as PointerEvent,
        thresholdPx: 2, selectThrough: false,
    });
    assert.equal(sourceHit, null, 'the removed source edge must not retain an invisible proxy hot zone');

    const finalEdge = visible.userData.topology.logicalEdges.find((edge: any) => edge.points.length >= 2);
    const a = new THREE.Vector3(...finalEdge.points[0]), b = new THREE.Vector3(...finalEdge.points[finalEdge.points.length - 1]);
    const finalPoint = a.lerp(b, 0.5).applyMatrix4(visible.matrixWorld).project(camera);
    const hit = pickLogicalEdge({
        camera, canvas, model: synchronizer.model,
        event: { clientX: (finalPoint.x + 1) * 400, clientY: (1 - finalPoint.y) * 300 } as PointerEvent,
        thresholdPx: 8, selectThrough: true,
    });
    assert.ok(hit, 'the trimmed final edge must remain pickable');
    let owner: THREE.Object3D | null = hit!.object;
    while (owner && !owner.userData.entityId) owner = owner.parent;
    assert.equal(owner, visible);
    const anchor = new GeometrySelector().createEdgeAnchor(hit!);
    assert.equal(anchor.finalTopology, true);
    assert.ok(new THREE.Vector3(...anchor.point).distanceTo(hit!.point) < 1e-6, 'arrow anchor must use the actual clicked edge position');
    const finalEdgeOperations = useEdgeTreatmentOperations({
        document: ref(document), activeTool: ref('select') as any, viewport: () => ({ getGeometryAnchor: () => anchor } as any),
        message: { warning: () => undefined, error: () => undefined } as any, pushHistory: () => undefined, popHistory: () => undefined, setTool: () => undefined,
    });
    assert.equal(finalEdgeOperations.getSelectedEdgeTreatment(), null, 'a final adjacent edge must not inherit a nearby treatment');

    const topology = proxy.userData.topology;
    const face = topology.faces.find((item: any) => item.planar && item.normal[0] > 0.99)!;
    const vertices: Vec3[] = [], indices: number[] = [];
    face.triangleIds.forEach((id: number) => topology.triangles[id].renderVertices.forEach((renderVertex: number) => {
        vertices.push(new THREE.Vector3().fromBufferAttribute((proxy as THREE.Mesh).geometry.attributes.position, renderVertex).toArray());
        indices.push(indices.length);
    }));
    const edited = { ...document.entities[0], faceOffset: { normal: face.normal, distance: 2, vertices, indices, faceIds: [face.id] } };
    const result = buildEntityMesh(edited, document);
    assert.equal(validateSolidGeometry(result.geometry).valid, true);
    assert.ok(edited.edgeTreatments?.length === 1);
    edited.edgeTreatments = [...edited.edgeTreatments!, {
        id: 'bottom-right', type: 'fillet', size: 2,
        edge: { a: [20, -20, -20], b: [20, -20, 20], normals: [[1, 0, 0], [0, -1, 0]] },
    }];
    const adjacent = buildEntityMesh(edited, document);
    assert.equal(validateSolidGeometry(adjacent.geometry).valid, true, 'adjacent edges must accept another treatment after a face edit');
});

test('treated faces expose trimmed regions while the generated face owns its treatment anchor', () => {
    const { document, synchronizer } = fixture();
    const entity = document.entities[0];
    const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
    const topology = visible.userData.topology;
    const selector = new GeometrySelector();
    const bevel = topology.faces.find((face: any) => face.normal[0] > 0.5 && face.normal[1] > 0.5)!;
    const bevelAnchor = selector.createFaceAnchor(faceHit(visible as THREE.Mesh, bevel.triangleIds[0]), entity);
    assert.equal(bevelAnchor.type, 'edge');
    assert.equal(bevelAnchor.edgeTreatmentId, treatment.id);
    assert.equal(bevelAnchor.generatedTreatment, true);
    assert.deepEqual(bevelAnchor.localNormal, bevel.normal);
    assert.ok(bevelAnchor.feedbackVertices?.length);

    const remaining = topology.faces.find((face: any) => face.planar && face.normal[0] > 0.99)!;
    const faceAnchor = selector.createFaceAnchor(faceHit(visible as THREE.Mesh, remaining.triangleIds[0]), entity);
    assert.equal(faceAnchor.type, 'face');
    assert.ok(faceAnchor.feedbackVertices?.length, 'selection feedback must use the final trimmed face');
    assert.notDeepEqual(faceAnchor.feedbackVertices, faceAnchor.vertices);
    const edited = { ...entity, faceOffset: { normal: faceAnchor.localNormal, distance: 2, vertices: faceAnchor.vertices, indices: faceAnchor.indices, faceIds: faceAnchor.faceIds } };
    const result = buildEntityMesh(edited, document);
    assert.equal(validateSolidGeometry(result.geometry).valid, true, 'trimmed face selection must retain a valid base-face edit');

    const operations = useEdgeTreatmentOperations({
        document: ref(document), activeTool: ref('select') as any, viewport: () => ({ getGeometryAnchor: () => bevelAnchor } as any),
        message: { warning: () => undefined, error: () => undefined } as any, pushHistory: () => undefined, popHistory: () => undefined, setTool: () => undefined,
    });
    operations.onEdgeTreatmentEdit(entity.id, bevelAnchor.localNormal, 0, 'start', bevelAnchor);
    operations.onEdgeTreatmentEdit(entity.id, bevelAnchor.localNormal, 1, 'move');
    operations.onEdgeTreatmentEdit(entity.id, bevelAnchor.localNormal, 0, 'end');
    assert.equal(entity.edgeTreatments?.length, 1);
    assert.equal(entity.edgeTreatments?.[0].size, 4, 'the generated face arrow must keep editing the same treatment');
});

test('a fillet patch is recognized by its curved domain even when its first triangle is tangent to a base face', () => {
    const round = { ...treatment, type: 'fillet' as const };
    const { document, synchronizer } = fixture({ edge: [round] });
    const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
    const curved = visible.userData.topology.faces.find((face: any) => !face.planar);
    assert.ok(curved);
    const anchor = new GeometrySelector().createFaceAnchor(faceHit(visible as THREE.Mesh, curved.triangleIds[0]), document.entities[0]);
    assert.equal(anchor.type, 'edge');
    assert.equal(anchor.generatedTreatment, true);
    assert.equal(anchor.edgeTreatmentId, round.id);
    assert.deepEqual(anchor.localNormal, visible.userData.topology.triangles[curved.triangleIds[0]].normal);
});

test('signed edge gestures switch between fillet and chamfer and keep the overlay in sync', () => {
    const document = ref(createDocument());
    document.value.entities.push(createEntity('box', 'box'));
    const activeTool = ref<'select'>('select');
    const operations = useEdgeTreatmentOperations({
        document, activeTool: activeTool as any, viewport: () => ({ getGeometryAnchor: () => anchor } as any), message: { warning: () => undefined, error: () => undefined } as any,
        pushHistory: () => undefined, popHistory: () => undefined, setTool: () => undefined,
    });
    const anchor = edgeAnchor();
    operations.onEdgeTreatmentEdit('box', anchor.localNormal, 0, 'start', anchor);
    operations.onEdgeTreatmentEdit('box', anchor.localNormal, -5, 'move');
    operations.onEdgeTreatmentEdit('box', anchor.localNormal, 0, 'end');
    const entity = document.value.entities[0];
    assert.equal(entity.edgeTreatments?.[0].type, 'fillet');
    assert.equal(entity.edgeTreatments?.[0].size, 5);
    operations.onEdgeTreatmentEdit('box', anchor.localNormal, 0, 'start', anchor);
    operations.onEdgeTreatmentEdit('box', anchor.localNormal, 7, 'move');
    operations.onEdgeTreatmentEdit('box', anchor.localNormal, 0, 'end');
    assert.equal(entity.edgeTreatments?.[0].type, 'chamfer');
    assert.equal(entity.edgeTreatments?.[0].size, 2);
    operations.updateEdgeTreatmentDistance(5);
    assert.equal(entity.edgeTreatments?.[0].type, 'fillet');
    assert.equal(entity.edgeTreatments?.[0].size, 5, 'numeric input must replace rather than accumulate the current size');
    operations.updateEdgeTreatmentDistance(-3);
    assert.equal(entity.edgeTreatments?.[0].type, 'chamfer');
    assert.equal(entity.edgeTreatments?.[0].size, 3);

    const overlay = new OverlayController();
    const guide = new GuideRenderer({
        overlay, model: new THREE.Group(), renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        getSelected: () => ['box'], getTool: () => 'select', getGeometryAnchor: () => anchor,
        getHoverFaceAnchor: () => null, getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm',
    });
    delete anchor.edgeTreatmentId;
    guide.update(document.value);
    const camera = new THREE.OrthographicCamera();
    camera.position.z = 100;
    camera.updateMatrixWorld(true);
    const item = overlay.project(camera, { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement).find((item) => item.kind === 'dimension' && item.target.kind === 'edgeTreatment');
    assert.equal(item, undefined, 'a removed source edge must not retain an arrow after treatment');
    assert.equal(operations.getSelectedEdgeTreatment()?.id, entity.edgeTreatments?.[0].id);
    assert.equal(operations.resetEdgeTreatment(), true);
    assert.equal(entity.edgeTreatments?.[0].size, 0);
    assert.equal(operations.resetEdgeTreatment(), false);
    guide.update(document.value);
    const restored = overlay.project(camera, { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement).find((item) => item.kind === 'dimension' && item.target.kind === 'edgeTreatment');
    const restoredValue = restored?.kind === 'dimension' ? restored.value : null;
    assert.ok(Math.abs(restoredValue || 0) < 1e-9);
});


test('generated corner chamfer and fillet faces own their active surface and treatment anchor', () => {
    for (const type of ['chamfer', 'fillet'] as const) {
        const corner: VertexTreatment = {
            id: `corner-${type}`, type, size: 3,
            vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
        };
        const { document, synchronizer } = fixture({ edge: [], vertex: [corner] });
        const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
        const topology = visible.userData.topology;
        const generated = type === 'fillet'
            ? topology.faces.find((face: any) => !face.planar)
            : topology.faces.find((face: any) => face.normal.every((value: number) => value > 0.4));
        assert.ok(generated, `${type} must create a generated corner face`);
        if (type === 'fillet') {
            assert.equal(topology.faces.filter((face: any) => !face.planar).length, 1, 'only the spherical patch is curved');
            assert.equal(topology.faces.filter((face: any) => face.planar).length, 6, 'the spherical patch must not absorb adjacent planar faces');
        }
        const selector = new GeometrySelector();
        const anchor = selector.createFaceAnchor(faceHit(visible as THREE.Mesh, generated.triangleIds[0]), document.entities[0]);
        assert.equal(anchor.type, 'vertex');
        assert.equal(anchor.vertexTreatmentId, corner.id);
        assert.equal(resolveVertexTreatment(document.entities[0], anchor)?.id, corner.id);
        assert.deepEqual(anchor.localVertex?.point, corner.vertex.point);
        assert.equal(anchor.generatedTreatment, true);
        assert.deepEqual(anchor.localNormal, generated.normal);

        const guide = new GuideRenderer({
            overlay: new OverlayController(), model: synchronizer.model, renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
            getSelected: () => ['box'], getTool: () => 'select', getGeometryAnchor: () => anchor,
            getHoverFaceAnchor: () => null, getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm',
        });
        guide.update(document);
        assert.ok(guide.faceFeedback.children.some((child) => child instanceof THREE.Mesh && !child.userData.vertexMarker && child.userData.activeSelection));
        assert.equal(guide.faceFeedback.children.some((child) => child.userData.vertexMarker), false);
        guide.dispose();
    }
});

test('generated chamfer and rounding anchors rebind after treatment size changes', () => {
    for (const type of ['chamfer', 'fillet'] as const) {
        const corner: VertexTreatment = {
            id: `live-corner-${type}`, type, size: 3,
            vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
        };
        const { document, synchronizer } = fixture(type === 'chamfer' ? { edge: [treatment], vertex: [] } : { edge: [], vertex: [corner] });
        const entity = document.entities[0];
        const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
        const selector = new GeometrySelector();
        const topology = visible.userData.topology;
        const generated = type === 'chamfer'
            ? topology.faces.find((face: any) => face.normal[0] > 0.4 && face.normal[1] > 0.4)
            : topology.faces.find((face: any) => !face.planar);
        const initial = selector.createFaceAnchor(faceHit(visible as THREE.Mesh, generated.triangleIds[0]), entity);
        assert.equal(initial.generatedTreatment, true);

        if (type === 'chamfer') entity.edgeTreatments![0].size = 6;
        else entity.vertexTreatments![0].size = 6;
        synchronizer.sync(document);
        const rebound = selector.rebindAnchor(initial, synchronizer.model, document);

        assert.ok(rebound, `${type} generated anchor must survive geometry rebuilds`);
        assert.equal(rebound.generatedTreatment, true);
        assert.equal(type === 'chamfer' ? rebound.edgeTreatmentId : rebound.vertexTreatmentId, type === 'chamfer' ? treatment.id : corner.id);
        assert.notDeepEqual(rebound.point, initial.point);
    }
});

test('rounding generated surface remains selectable after its adjacent face was extruded', () => {
    const corner: VertexTreatment = {
        id: 'moved-corner', type: 'fillet', size: 3,
        vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    };
    const { document, synchronizer } = fixture({ edge: [], vertex: [corner] });
    const entity = document.entities[0];
    entity.faceOffset = {
        normal: [1, 0, 0], distance: 10,
        vertices: [[20, -20, -20], [20, 20, -20], [20, 20, 20], [20, -20, 20]], indices: [0, 1, 2, 0, 2, 3], faceIds: ['right'],
    };
    synchronizer.sync(document);
    const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
    const generated = visible.userData.topology.faces.find((face: any) => !face.planar);
    assert.ok(generated);
    const anchor = new GeometrySelector().createFaceAnchor(faceHit(visible as THREE.Mesh, generated.triangleIds[0]), entity);

    assert.equal(anchor.type, 'vertex');
    assert.equal(anchor.generatedTreatment, true);
    assert.equal(anchor.vertexTreatmentId, corner.id);
    assert.deepEqual(anchor.localVertex?.point, [30, 20, 20]);
});

test('raycast selection owns the rounded surface instead of its three adjacent planes', () => {
    const corner: VertexTreatment = {
        id: 'ray-corner', type: 'fillet', size: 8,
        vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    };
    const { document, synchronizer } = fixture({ edge: [], vertex: [corner] });
    const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
    const generated = visible.userData.topology.faces.find((face: any) => !face.planar);
    const target = new THREE.Vector3(...generated.point).applyMatrix4(visible.matrixWorld);
    const origin = new THREE.Vector3(80, 80, 80);
    const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize());
    const hit = ray.intersectObject(visible, false)[0];
    assert.ok(hit);
    const anchor = new GeometrySelector().createFaceAnchor(hit, document.entities[0]);
    assert.equal(anchor.type, 'vertex');
    assert.equal(anchor.vertexTreatmentId, corner.id);

    const adjacentFace = visible.userData.topology.faces.find((face: any) => face.planar && face.normal[1] > 0.99);
    const planeHit = faceHit(visible as THREE.Mesh, adjacentFace.triangleIds[0]);
    const priorityAnchor = new GeometrySelector().createFaceAnchor(planeHit, document.entities[0]);
    assert.equal(priorityAnchor.type, 'face', 'adjacent planar triangles remain ordinary face selections');
});

test('a different cube corner wins over the existing rounded face and hover still renders', () => {
    const corner: VertexTreatment = {
        id: 'hover-corner', type: 'fillet', size: 8,
        vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    };
    const { document, synchronizer } = fixture({ edge: [], vertex: [corner] });
    const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
    const generated = visible.userData.topology.faces.find((face: any) => !face.planar);
    const anchor = new GeometrySelector().createFaceAnchor(faceHit(visible as THREE.Mesh, generated.triangleIds[0]), document.entities[0]);
    const otherCorner = { ...anchor, localVertex: { point: [-20, 20, 20] as [number, number, number], normals: corner.vertex.normals } };
    assert.equal(hasDistinctVertexPriority(otherCorner, anchor), true);
    assert.equal(hasDistinctVertexPriority(anchor, anchor), false);

    const guide = new GuideRenderer({
        overlay: new OverlayController(), model: synchronizer.model, renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        getSelected: () => [], getTool: () => 'select', getGeometryAnchor: () => null, getHoverFaceAnchor: () => anchor,
        getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm', getDocument: () => document,
    });
    guide.update(document);
    assert.ok(guide.faceFeedback.children.some((child) => !child.userData.activeSelection), 'hover must render the generated curved face');
    guide.dispose();
});

test('edge chamfer limit spans the full section while fillet keeps the safe radius limit', () => {
    const { document } = fixture();
    const anchor = edgeAnchor();
    const operations = useEdgeTreatmentOperations({
        document: ref(document), activeTool: ref('select') as any, viewport: () => ({ getGeometryAnchor: () => anchor } as any),
        message: { warning: () => undefined, error: () => undefined } as any, pushHistory: () => undefined, popHistory: () => undefined, setTool: () => undefined,
    });
    operations.updateEdgeTreatmentDistance(-40);
    assert.equal(document.entities[0].edgeTreatments?.[0].type, 'chamfer');
    assert.equal(document.entities[0].edgeTreatments?.[0].size, 40);
    operations.updateEdgeTreatmentDistance(40);
    assert.equal(document.entities[0].edgeTreatments?.[0].type, 'fillet');
    assert.equal(document.entities[0].edgeTreatments?.[0].size, 20);
});

test('rounded source corner and incident edges retain scoped proxy picking and editing', () => {
    const corner: VertexTreatment = {
        id: 'rounded-corner', type: 'fillet', size: 8,
        vertex: { point: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    };
    const { document, synchronizer } = fixture({ edge: [], vertex: [corner] });
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
    camera.position.set(80, 80, 80); camera.lookAt(0, 20, 0); camera.updateMatrixWorld(true);
    const canvas = { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement;
    const eventAt = (point: THREE.Vector3) => {
        const projected = point.project(camera);
        return { clientX: (projected.x + 1) * 400, clientY: (1 - projected.y) * 300 } as PointerEvent;
    };

    const vertexHit = pickLogicalVertex({ camera, canvas, model: synchronizer.model, event: eventAt(new THREE.Vector3(20, 40, 20)), thresholdPx: 8, selectThrough: false });
    assert.ok(vertexHit, 'the replaced source corner must remain pickable even at radius 8');
    assert.equal((vertexHit.object as THREE.Mesh).userData.selectionProxy, true);
    const selector = new GeometrySelector();
    const vertexAnchor = selector.createVertexAnchor(vertexHit)!;
    assert.equal(vertexAnchor.sourceVertexProxy, true);
    assert.equal(vertexAnchor.finalTopology, false);
    assert.equal(resolveVertexTreatment(document.entities[0], vertexAnchor)?.id, corner.id);

    const guide = new GuideRenderer({
        overlay: new OverlayController(), model: synchronizer.model, renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        getSelected: () => ['box'], getTool: () => 'select', getGeometryAnchor: () => vertexAnchor,
        getHoverFaceAnchor: () => null, getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm',
    });
    guide.update(document);
    assert.ok(guide.group.children.length > 0, 'the source corner proxy must retain its edit arrow');
    guide.dispose();

    const edgeHit = pickLogicalEdge({ camera, canvas, model: synchronizer.model, event: eventAt(new THREE.Vector3(20, 40, 0)), thresholdPx: 8, selectThrough: false });
    assert.ok(edgeHit, 'an incident source edge must remain pickable');
    let owner: THREE.Object3D | null = edgeHit.object;
    while (owner && !owner.userData.entityId) owner = owner.parent;
    assert.equal(owner?.userData.selectionProxy, true, 'the full source edge wins over its trimmed final segment');
    const edgeAnchor = selector.createEdgeAnchor(edgeHit);
    assert.deepEqual(edgeAnchor.localEdge?.a, [20, 20, -20]);
    assert.deepEqual(edgeAnchor.localEdge?.b, [20, 20, 20]);

    const operations = useEdgeTreatmentOperations({
        document: ref(document), activeTool: ref('select') as any, viewport: () => ({ getGeometryAnchor: () => edgeAnchor } as any),
        message: { warning: () => undefined, error: () => undefined } as any, pushHistory: () => undefined, popHistory: () => undefined, setTool: () => undefined,
    });
    operations.onEdgeTreatmentEdit('box', edgeAnchor.localNormal, 0, 'start', edgeAnchor);
    operations.onEdgeTreatmentEdit('box', edgeAnchor.localNormal, -2, 'move');
    operations.onEdgeTreatmentEdit('box', edgeAnchor.localNormal, 0, 'end');
    assert.equal(document.entities[0].edgeTreatments?.[0].type, 'fillet');
    assert.equal(document.entities[0].edgeTreatments?.[0].size, 2);
});
