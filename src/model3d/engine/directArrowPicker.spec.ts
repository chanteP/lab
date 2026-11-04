import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pickDirectArrow } from './viewport/DirectArrowPicker';

test('direct arrows use a forgiving screen-space hit area', () => {
    const guides = new THREE.Group();
    const arrow = new THREE.Group();
    arrow.userData.arrowKey = 'edge-arrow';
    const handle = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
    handle.userData.directArrow = { id: 'box' };
    arrow.add(handle); guides.add(arrow);
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 200);
    camera.position.z = 100; camera.updateMatrixWorld(true);
    const canvas = { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement;
    const pick = (clientX: number, clientY: number) => pickDirectArrow({ guides, camera, canvas, event: { clientX, clientY } as PointerEvent, thresholdPx: 28 });
    assert.equal(pick(420, 300)?.data.id, 'box');
    assert.equal(pick(400, 327)?.data.id, 'box');
    assert.equal(pick(450, 300), null);
});
