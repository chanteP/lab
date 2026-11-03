import assert from 'node:assert/strict';
import test from 'node:test';
import { Spherical } from 'three';
import { advanceGizmoOrbit } from './viewport/gizmoOrbit';

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
