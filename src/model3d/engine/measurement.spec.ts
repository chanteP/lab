import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeasurementRenderer } from './viewport/MeasurementRenderer';
import { OverlayController, type ViewportOverlay } from './viewport/OverlayController';

function measurement() {
    const overlay = new OverlayController();
    const labels: ViewportOverlay[] = [];
    overlay.set = (item) => { labels.push(item); };
    const renderer = { domElement: { clientWidth: 1000, clientHeight: 800 } } as THREE.WebGLRenderer;
    return { renderer: new MeasurementRenderer((value) => `${Number(value.toFixed(2))} mm`, overlay, renderer), labels };
}

function lastLabel(labels: ViewportOverlay[]) {
    const item = labels[labels.length - 1];
    if (item.kind !== 'label') throw new Error('Expected a measurement label');
    return item.text;
}

test('sketch measurement keeps only the latest point pair and connects consecutive clicks', () => {
    const { renderer, labels } = measurement();
    renderer.addSketchPoint(new THREE.Vector3(0, 0, 0));
    renderer.addSketchPoint(new THREE.Vector3(3, 4, 0));
    assert.equal(renderer.points.length, 2);
    assert.equal(lastLabel(labels), '5 mm');

    renderer.addSketchPoint(new THREE.Vector3(3, 4, 12));
    assert.deepEqual(renderer.points.map((point) => point.toArray()), [[3, 4, 0], [3, 4, 12]]);
    assert.equal(lastLabel(labels), '12 mm');
    assert.equal(renderer.group.children.filter((object) => object.userData.sketchMeasureMarker).length, 2);
});

test('sketch measurement creates no document geometry and scales only its two screen markers', () => {
    const { renderer } = measurement();
    renderer.addSketchPoint(new THREE.Vector3(0, 0, 0));
    renderer.addSketchPoint(new THREE.Vector3(1, 0, 0));
    renderer.updateSketchMarkers(0.5);
    const markers = renderer.group.children.filter((object) => object.userData.sketchMeasureMarker);
    assert.equal(markers.length, 2);
    markers.forEach((marker) => assert.equal(marker.scale.x, 2));
});
