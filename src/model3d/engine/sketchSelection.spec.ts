import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InteractionController } from './viewport/InteractionController';
import { createDocument, createEntity } from '../types';

test('a single closed 3D sketch resolves its individual hit face without requiring another entity', () => {
    const document = createDocument();
    document.planes.push({ id: 'plane', name: 'XZ', kind: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], visible: true });
    const sketch = createEntity('sketch', 'sketch');
    sketch.planeId = 'plane';
    sketch.profileType = 'rectangle';
    sketch.points = [[0, 0], [10, 0], [10, 10], [0, 10]];
    document.entities.push(sketch);
    const controller = Object.create(InteractionController.prototype) as any;
    controller.sceneSynchronizer = { document };
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape()));
    mesh.userData.entityId = sketch.id;

    const anchor = controller.sketchIntersectionAnchor([{ object: mesh, point: new THREE.Vector3(5, 0, -5) }]);

    assert.equal(anchor.type, 'face');
    assert.equal(anchor.id, sketch.id);
    assert.equal(anchor.profilePoints.length, 4);
    assert.notEqual(anchor.profilePoints, null);
});

test('multi-point translation uses the selected content center as its operation anchor', () => {
    const document = createDocument();
    const rectangle = createEntity('sketch', 'rectangle');
    rectangle.profileType = 'rectangle';
    rectangle.points = [[0, 0], [10, 0], [10, 10], [0, 10]];
    document.entities.push(rectangle);
    const controller = Object.create(InteractionController.prototype) as any;
    controller.sceneSynchronizer = { document, selected: [rectangle.id] };
    controller.sketchRenderer = { selectedPointRefs: [] };

    assert.deepEqual(controller.sketchSelectionAnchor([100, 100]), [5, 5]);
});

test('undo cancellation clears sketch gestures and consumes the remaining pointerup', () => {
    const controller = Object.create(InteractionController.prototype) as any;
    let reset = false, cleared = false;
    controller.sketchDrag = { moved: true };
    controller.shapeDrag = { moved: true };
    controller.assetEditor = { reset: () => reset = true };
    controller.cameraController = { controls: { enabled: false } };
    controller.container = { classList: { remove: () => undefined } };
    controller.sketchRenderer = { clearReferences: () => cleared = true };
    controller.cancelSketchGesture();
    assert.equal(controller.sketchDrag, null);
    assert.equal(controller.shapeDrag, null);
    assert.equal(controller.sketchSelectionGuardPointerUp, true);
    assert.equal(controller.controls.enabled, true);
    assert.equal(reset, true);
    assert.equal(cleared, true);
});
