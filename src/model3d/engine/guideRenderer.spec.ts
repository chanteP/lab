import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GuideRenderer } from './viewport/GuideRenderer';
import { OverlayController } from './viewport/OverlayController';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import { createDocument } from '../types';

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
