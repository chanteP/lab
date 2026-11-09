import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { defaultViewFitMetrics } from './viewport/defaultView';

test('default view fitting keeps the requested origin centered and includes all offset content', () => {
    const box = new THREE.Box3(new THREE.Vector3(10, 10, 10), new THREE.Vector3(20, 20, 20));
    const origin = new THREE.Vector3(0, 0, 0);
    const fit = defaultViewFitMetrics(box, origin);
    assert.deepEqual(fit.center.toArray(), origin.toArray());
    assert.ok(Math.abs(fit.radius - Math.sqrt(20 ** 2 * 3)) < 1e-9);
    assert.ok(fit.radius > box.getSize(new THREE.Vector3()).length() / 2);
});

test('empty content still has a useful default fit radius', () => {
    const fit = defaultViewFitMetrics(new THREE.Box3(), new THREE.Vector3());
    assert.equal(fit.radius, 5);
});
