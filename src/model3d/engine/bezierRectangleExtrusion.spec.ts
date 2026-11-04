import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDocument, createEntity, type ModelEntity, type Vec3 } from '../types';
import { splitSemanticShapeToLines } from './sketchSemanticSplit';
import { computeSketchFaces } from './sketchFaces';
import { buildEntityMesh } from './geometry';
import { buildMeshTopology } from './topology/MeshTopology';
import { reconcileTopology } from './topology/TopologyTracker';
import { uniqueClosedProfile } from './profileIntersection';
import { GeometrySelector } from './viewport/GeometrySelector';
import { initializeManifold } from './modeling/ManifoldKernel';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { bakeEntityGeometry } from './modeling/BakedGeometry';

await initializeManifold();

function triangleHit(mesh: THREE.Mesh, faceIndex: number) {
    const geometry = mesh.geometry, index = geometry.index;
    const vertices = [0, 1, 2].map((offset) => index ? index.getX(faceIndex * 3 + offset) : faceIndex * 3 + offset);
    const points = vertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, vertex));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    return { object: mesh, faceIndex, face: { a: vertices[0], b: vertices[1], c: vertices[2], normal }, point: points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3) } as unknown as THREE.Intersection;
}

test('Bezier rectangle closes, extrudes and exposes five editable planes plus one curved face', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.planeId = 'plane';
    rectangle.points = [[0, 0], [40, 0], [40, 20], [0, 20]];
    rectangle.curves = { 1: { c1: [50, 5], c2: [50, 15] } };
    const lines = splitSemanticShapeToLines(rectangle, (() => { let id = 0; return () => `line-${++id}`; })());
    document.entities.push(...lines);
    const faces = computeSketchFaces(document.entities, 'plane');
    assert.equal(faces.length, 1, 'split lines must form one closed region');
    assert.equal(uniqueClosedProfile([lines[0]], 'plane'), null);
    const region = uniqueClosedProfile(document.entities, 'plane');
    assert.ok(region, 'any one open line can start the unique region extrusion');

    const body = Object.assign(createEntity('extrude', 'body'), {
        planeId: 'plane', profileType: 'polygon', open: false, depth: 10, position: [0, 0, 0] as Vec3,
        points: region!,
        analyticCurves: {},
    });
    document.entities.push(body);
    assert.equal(body.open, false, 'region bodies must be closed even when the picked line is open');
    const draftMesh = buildEntityMesh(body, document);
    const previousTopology = buildMeshTopology(draftMesh.geometry, body.id, body, document);
    bakeEntityGeometry(body, document);
    const mesh = buildEntityMesh(body, document);
    mesh.userData.entityId = body.id;
    const topology = reconcileTopology(previousTopology, buildMeshTopology(mesh.geometry, body.id, body, document), body.faceEdit);
    mesh.userData.topology = topology;
    assert.equal(topology.faces.length, 6);
    assert.equal(topology.faces.filter((face) => face.planar).length, 5);
    assert.equal(topology.faces.filter((face) => !face.planar).length, 1);

    const selector = new GeometrySelector();
    topology.faces.forEach((face) => {
        const anchor = selector.createFaceAnchor(triangleHit(mesh, face.triangleIds[0]), body);
        assert.equal(anchor.id, body.id);
        assert.equal(anchor.planar, face.planar);
        if (!face.planar) return;
        const vertices: Vec3[] = [], indices: number[] = [];
        face.triangleIds.forEach((id) => topology.triangles[id].renderVertices.forEach((renderVertex) => {
            vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, renderVertex).toArray());
            indices.push(indices.length);
        }));
        const edited: ModelEntity = JSON.parse(JSON.stringify(body));
        edited.faceOffset = { normal: face.normal, distance: 1, vertices, indices, faceIds: [face.id] };
        const result = buildEntityMesh(edited, document);
        assert.equal(validateSolidGeometry(result.geometry).valid, true, `${face.id} must remain draggable`);
        result.geometry.dispose();
    });
});
