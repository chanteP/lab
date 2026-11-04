import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Spherical, Vector3 } from 'three';
import { advanceGizmoOrbit, gizmoAxisDirection } from './viewport/gizmoOrbit';

test('gizmo dragging continues from its unsnapped orbit after a rendered axis snap', () => {
    const dragOrbit = new Spherical(100, Math.PI / 2, 0);
    advanceGizmoOrbit(dragOrbit, 2, 0);
    const renderedOrbit = dragOrbit.clone();
    renderedOrbit.theta = 0;

    advanceGizmoOrbit(dragOrbit, 2, 0);
    assert.ok(Math.abs(dragOrbit.theta + 0.036) < 1e-10);
    assert.equal(renderedOrbit.theta, 0);
});

test('gizmo orbit keeps the polar angle inside its safe range', () => {
    const dragOrbit = new Spherical(100, 0.01, 0);
    advanceGizmoOrbit(dragOrbit, 0, 100);
    assert.equal(dragOrbit.phi, 0.015);
    advanceGizmoOrbit(dragOrbit, 0, -1000);
    assert.equal(dragOrbit.phi, Math.PI - 0.015);
});

test('axis balls resolve to their signed world directions', () => {
    assert.deepEqual(gizmoAxisDirection('posZ').toArray(), [0, 0, 1]);
    assert.deepEqual(gizmoAxisDirection('negX').toArray(), [-1, 0, 0]);
});

test('sketch axis balls use the oriented plane basis', () => {
    const orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const direction = gizmoAxisDirection('posZ', orientation);
    assert.ok(direction.distanceTo(new Vector3(1, 0, 0)) < 1e-10);
});
