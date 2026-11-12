import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { extrudeDragDistance } from './viewport/extrudeDrag';

const canvas = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;

test('extrude drag follows actual projected pixels across perspective zoom levels', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const near = extrudeDragDistance(camera, canvas, [0, 0, 0], [0, 1, 0], 0, -30)!;
    camera.position.z = 200;
    camera.updateMatrixWorld();
    const far = extrudeDragDistance(camera, canvas, [0, 0, 0], [0, 1, 0], 0, -30)!;
    assert(near > 0 && far > 0);
    assert(Math.abs(far / near - 2) < 1e-6, 'same screen movement represents half the world distance at twice the zoom');
    assert(Math.abs(near - 30 / (600 / (2 * 100 * Math.tan(Math.PI / 8)))) < 1e-6);
});

test('extrude drag uses viewport height and orthographic projection instead of a distance heuristic', () => {
    const camera = new THREE.OrthographicCamera(-40, 40, 30, -30, 0.1, 100);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const delta = extrudeDragDistance(camera, canvas, [0, 0, 0], [0, 1, 0], 0, -10)!;
    assert.equal(delta, 1);
});

test('camera-facing extrusion axes do not produce an unbounded fallback distance', () => {
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    assert.equal(extrudeDragDistance(camera, canvas, [0, 0, 0], [0, 0, 1], 0, 1000), null);
});
