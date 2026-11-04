import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDocument, createEntity } from '../types';
import { splitSemanticShapeToLines } from './sketchSemanticSplit';
import { buildScene } from './geometry';
import { buildSketchRegionPreviews } from './viewport/SketchRegionPreview';
import { SceneSynchronizer } from './viewport/SceneSynchronizer';
import { OverlayController } from './viewport/OverlayController';
import { uniqueClosedProfile } from './profileIntersection';

function fixture() {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.planeId = 'plane';
    rectangle.points = [[0, 0], [40, 0], [40, 20], [0, 20]];
    rectangle.curves = { 1: { c1: [50, 5], c2: [50, 15] } };
    const lines = splitSemanticShapeToLines(rectangle, (() => { let id = 0; return () => `line-${++id}`; })());
    document.entities.push(...lines);
    return document;
}

test('open Bezier lines retain a viewport-only closed face after leaving sketch mode', () => {
    const document = fixture();
    const previews = buildSketchRegionPreviews(document);
    assert.equal(previews.length, 1);
    assert.ok((previews[0].geometry.attributes.position?.count || 0) > 0);
    assert.equal(previews[0].userData.regionProfile, true);
    assert.deepEqual(previews[0].userData.profilePoints, uniqueClosedProfile(document.entities, 'plane'));
    assert.equal((previews[0].material as THREE.MeshBasicMaterial).opacity, 0.22);
    assert.equal(buildScene(document).children.length, 4, 'region previews must not enter the document/export scene');

    const synchronizer = new SceneSynchronizer({
        transform: { detach: () => undefined } as any,
        renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as THREE.WebGLRenderer,
        isSketchMode: () => false, getTool: () => 'select', onStats: () => undefined, onContentRadius: () => undefined,
        onClearAltBorder: () => undefined, onClearSketchReferences: () => undefined, onUpdateExtrudeGuide: () => undefined,
        onRefreshSketchFaces: () => undefined, onRefreshSketchSelectionFeedback: () => undefined,
        onPlaneOrientation: () => undefined, isProfileIntersection: () => false, overlay: new OverlayController(),
    });
    synchronizer.sync(document);
    const rendered = synchronizer.model.children.find((child) => child.userData.regionProfile)!;
    assert.equal(rendered.visible, true);
    assert.equal((rendered as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity, 0.22);
});
