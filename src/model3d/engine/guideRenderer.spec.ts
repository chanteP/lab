import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GuideRenderer } from './viewport/GuideRenderer';
import { OverlayController } from './viewport/OverlayController';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import { createDocument, createEntity } from '../types';
import { buildEntityMesh } from './geometry';

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
