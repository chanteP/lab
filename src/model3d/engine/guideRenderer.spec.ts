import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GuideRenderer } from './viewport/GuideRenderer';
import { OverlayController } from './viewport/OverlayController';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import { createDocument, createEntity } from '../types';
import { buildEntityMesh } from './geometry';
import { GeometrySelector } from './viewport/GeometrySelector';
import { buildMeshTopology } from './topology/MeshTopology';

function faceHit(mesh: THREE.Mesh, faceIndex: number) {
    const geometry = mesh.geometry, index = geometry.index;
    const vertices = [0, 1, 2].map((offset) => index ? index.getX(faceIndex * 3 + offset) : faceIndex * 3 + offset);
    const points = vertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, vertex));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    return { object: mesh, faceIndex, face: { a: vertices[0], b: vertices[1], c: vertices[2], normal }, point: points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3) } as unknown as THREE.Intersection;
}

function anchor(type: 'face' | 'edge'): GeometryAnchor {
    return {
        id: 'deleted-entity', key: `deleted-entity:${type}:stale`, type, planar: type === 'face',
        normal: [0, 1, 0], localNormal: [0, 1, 0], point: [0, 0, 0], vertices: [], indices: [],
    };
}

test('stale geometry anchors are ignored after their entity is deleted', () => {
    for (const tool of ['select', 'offsetFace', 'extrude', 'fillet', 'chamfer'] as const) {
        for (const type of ['face', 'edge'] as const) {
            const geometryAnchor = anchor(type);
            const renderer = new GuideRenderer({
                overlay: new OverlayController(), model: new THREE.Group(),
                renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
                getSelected: () => [geometryAnchor.id], getTool: () => tool,
                getGeometryAnchor: () => geometryAnchor, getHoverFaceAnchor: () => null,
                getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm',
            });
            assert.doesNotThrow(() => renderer.update(createDocument()), `${tool}/${type}`);
            renderer.dispose();
        }
    }
});

test('region extrusion arrow starts at the sketch plane instead of beyond the moving cap', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const profile = createEntity('sketch', 'line');
    profile.planeId = 'plane';
    profile.points = [[0, 0], [40, 0]];
    profile.open = true;
    const body = createEntity('extrude', 'body');
    body.planeId = 'plane';
    body.position = [0, 0, 0];
    body.points = [[0, 0], [40, 0], [40, 20], [0, 20]];
    body.depth = 12;
    body.direction = 1;
    body.sideMode = 'one';
    document.entities.push(profile, body);
    const model = new THREE.Group();
    model.add(buildEntityMesh(body, document));
    const renderer = new GuideRenderer({
        overlay: new OverlayController(), model,
        renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        getSelected: () => [profile.id], getTool: () => 'extrude', getGeometryAnchor: () => null,
        getHoverFaceAnchor: () => null, getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm',
    });

    renderer.update(document);

    assert.equal(renderer.group.children.length, 1);
    assert.ok(Math.abs(renderer.group.children[0].position.y - 12) < 1e-8, 'arrow origin must coincide with the extruded cap');
    renderer.dispose();
});

test('active face and arrow follow the owner matrix during transform dragging', () => {
    const document = createDocument();
    const entity = createEntity('box', 'box');
    entity.position = [0, 0, 0];
    document.entities.push(entity);
    const mesh = buildEntityMesh(entity, document);
    const model = new THREE.Group();
    model.add(mesh);
    mesh.userData.topology = buildMeshTopology(mesh.geometry, entity.id, entity, document);
    const face = mesh.userData.topology.faces.find((item: any) => item.normal[1] > 0.99);
    const geometryAnchor = new GeometrySelector().createFaceAnchor(faceHit(mesh, face.triangleIds[0]), entity);
    const renderer = new GuideRenderer({
        overlay: new OverlayController(), model,
        renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        getSelected: () => [entity.id], getTool: () => 'offsetFace', getGeometryAnchor: () => geometryAnchor,
        getHoverFaceAnchor: () => null, getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm', getDocument: () => document,
    });
    renderer.update(document);
    const initialX = (renderer.faceFeedback.children[0] as THREE.Mesh).geometry.attributes.position.getX(0);

    mesh.position.x = 10;
    renderer.updateAnimation(new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500), 1);

    assert.equal((renderer.faceFeedback.children[0] as THREE.Mesh).geometry.attributes.position.getX(0), initialX + 10);
    assert.equal(renderer.group.children[0].position.x, 10);
    renderer.dispose();
});

test('closed sketch selection shows one signed extrusion arrow and its length input', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const profile = createEntity('sketch', 'profile');
    Object.assign(profile, { planeId: 'plane', profileType: 'rectangle' as const, points: [[-5, -5], [5, -5], [5, 5], [-5, 5]], open: false });
    document.entities.push(profile);
    const overlay = new OverlayController();
    const model = new THREE.Group();
    model.add(buildEntityMesh(profile, document));
    const renderer = new GuideRenderer({
        overlay, model, renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        getSelected: () => [profile.id], getTool: () => 'select', getGeometryAnchor: () => null,
        getHoverFaceAnchor: () => null, getSectionPlane: () => null, isSketchMode: () => false, getLengthUnit: () => 'mm',
    });
    renderer.update(document);
    assert.equal(renderer.group.children.length, 1);
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 100);
    camera.position.z = 10;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const [input] = overlay.project(camera, { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement);
    assert.equal(input?.kind, 'dimension');
    assert.equal(input?.kind === 'dimension' && input.target.kind, 'sketchExtrude');
    assert.equal(input?.kind === 'dimension' && input.signed, true);
    renderer.dispose();
});
