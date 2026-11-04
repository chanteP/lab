import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ref } from 'vue';
import { createDocument, createEntity, type EdgeTreatment, type ModelDocument, type Vec3 } from '../types';
import { buildEntityMesh, buildScene } from './geometry';
import { initializeManifold } from './modeling/ManifoldKernel';
import { resolveEdgeTreatment } from './modeling/EdgeTreatments';
import { SceneSynchronizer } from './viewport/SceneSynchronizer';
import { OverlayController } from './viewport/OverlayController';
import { pickLogicalEdge } from './viewport/EdgePicker';
import { GeometrySelector, type GeometryAnchor } from './viewport/GeometrySelector';
import { useEdgeTreatmentOperations } from '../composables/useEdgeTreatmentOperations';
import { GuideRenderer } from './viewport/GuideRenderer';
import { validateSolidGeometry } from './modeling/GeometryValidator';

await initializeManifold();

const treatment: EdgeTreatment = {
    id: 'top-right', type: 'chamfer', size: 3,
    edge: { a: [20, 20, -20], b: [20, 20, 20], normals: [[1, 0, 0], [0, 1, 0]] },
};

function fixture(): { document: ModelDocument; synchronizer: SceneSynchronizer } {
    const document = createDocument();
    const box = createEntity('box', 'box');
    box.edgeTreatments = [treatment];
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

test('original edges remain pickable through the final treated surface and adjacent faces still extrude', () => {
    const { document, synchronizer } = fixture();
    const proxy = synchronizer.model.children.find((child) => child.userData.selectionProxy)!;
    const edge = proxy.children.find((child) => child.userData.displayEdge)!;
    const segmentIndex = edge.userData.segmentEdgeIds.findIndex((id: string) => proxy.userData.topology.logicalEdges.find((item: any) => item.id === id)?.points.some((point: Vec3) => point[0] === 20 && point[1] === 20));
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
    camera.position.set(80, 80, 80); camera.lookAt(0, 20, 0); camera.updateMatrixWorld(true);
    const point = new THREE.Vector3(20, 40, 0).project(camera);
    const hit = pickLogicalEdge({
        camera, canvas: { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement,
        model: synchronizer.model, event: { clientX: (point.x + 1) * 400, clientY: (1 - point.y) * 300 } as PointerEvent,
        thresholdPx: 8, selectThrough: false,
    });
    assert.ok(hit, 'original edge must remain pickable');
    let owner: THREE.Object3D | null = hit!.object;
    while (owner && !owner.userData.entityId) owner = owner.parent;
    assert.equal(owner?.userData.selectionProxy, true);
    const anchor = new GeometrySelector().createEdgeAnchor(hit!);
    assert.ok(new THREE.Vector3(...anchor.point).distanceTo(hit!.point) < 1e-6, 'arrow anchor must use the actual clicked edge position');
    assert.equal(resolveEdgeTreatment(document.entities[0], anchor)?.id, treatment.id);

    const topology = proxy.userData.topology;
    const face = topology.faces.find((item: any) => item.planar && item.normal[0] > 0.99)!;
    const vertices: Vec3[] = [], indices: number[] = [];
    face.triangleIds.forEach((id: number) => topology.triangles[id].renderVertices.forEach((renderVertex: number) => {
        vertices.push(new THREE.Vector3().fromBufferAttribute(proxy.geometry.attributes.position, renderVertex).toArray());
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

test('treated faces expose the remaining region while the bevel face reselects its edge', () => {
    const { document, synchronizer } = fixture();
    const entity = document.entities[0];
    const visible = synchronizer.model.children.find((child) => child.userData.entityId === 'box' && !child.userData.selectionProxy)!;
    const topology = visible.userData.topology;
    const selector = new GeometrySelector();
    const bevel = topology.faces.find((face: any) => face.normal[0] > 0.5 && face.normal[1] > 0.5)!;
    const bevelAnchor = selector.createFaceAnchor(faceHit(visible as THREE.Mesh, bevel.triangleIds[0]), entity);
    assert.equal(bevelAnchor.type, 'edge');
    assert.equal(bevelAnchor.edgeTreatmentId, treatment.id);

    const remaining = topology.faces.find((face: any) => face.planar && face.normal[0] > 0.99)!;
    const faceAnchor = selector.createFaceAnchor(faceHit(visible as THREE.Mesh, remaining.triangleIds[0]), entity);
    assert.equal(faceAnchor.type, 'face');
    assert.ok(faceAnchor.feedbackVertices?.length, 'selection feedback must use the final trimmed face');
    assert.notDeepEqual(faceAnchor.feedbackVertices, faceAnchor.vertices);
    const edited = { ...entity, faceOffset: { normal: faceAnchor.localNormal, distance: 2, vertices: faceAnchor.vertices, indices: faceAnchor.indices, faceIds: faceAnchor.faceIds } };
    const result = buildEntityMesh(edited, document);
    assert.equal(validateSolidGeometry(result.geometry).valid, true, 'trimmed face selection must retain a valid base-face edit');
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
    assert.equal(item?.value, -3);
    assert.equal(item?.signed, true);
});
