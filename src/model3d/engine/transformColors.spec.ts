import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { AXIS_COLORS } from '../config/colors';
import { applyTransformControlColors } from './viewport/transformColors';

test('translate, rotate and scale handles use the shared axis colors and cached colors', () => {
    const transform = new TransformControls(new THREE.PerspectiveCamera());
    applyTransformControlColors(transform);
    transform.getHelper().updateMatrixWorld(true);
    const expected = { X: AXIS_COLORS.x, Y: AXIS_COLORS.y, Z: AXIS_COLORS.z, YZ: AXIS_COLORS.x, XZ: AXIS_COLORS.y, XY: AXIS_COLORS.z };
    const found = new Set<string>();
    const control = transform as unknown as { _gizmo: { gizmo: Record<string, THREE.Object3D>; helper: Record<string, THREE.Object3D> } };
    [...Object.values(control._gizmo.gizmo), ...Object.values(control._gizmo.helper)].forEach((group) => {
        group.traverse((object) => {
            const color = expected[object.name as keyof typeof expected];
            const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial & { _color?: THREE.Color };
            if (!color || !material?.color) return;
            assert.equal(material.color.getStyle(), new THREE.Color(color).getStyle());
            assert.equal(material._color?.getStyle(), new THREE.Color(color).getStyle());
            found.add(object.name);
        });
    });
    Object.keys(expected).forEach((name) => assert.ok(found.has(name), `${name} handles must be recolored`));
});
