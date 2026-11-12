import * as THREE from 'three';
import type { Vec3 } from '../../types';

/** Converts pointer pixels along the extrusion direction using the actual camera projection. */
export function extrudeDragDistance(camera: THREE.Camera, canvas: HTMLCanvasElement, origin: Vec3, worldNormal: Vec3, deltaX: number, deltaY: number) {
    const from = new THREE.Vector3(...origin).project(camera);
    const to = new THREE.Vector3(...origin).add(new THREE.Vector3(...worldNormal).normalize()).project(camera);
    const direction = new THREE.Vector2(
        (to.x - from.x) * (canvas.clientWidth || 1) / 2,
        -(to.y - from.y) * (canvas.clientHeight || 1) / 2,
    );
    const pixelsPerUnit = direction.length();
    // A nearly camera-facing axis has no stable screen mapping; never substitute an unbounded distance estimate.
    if (pixelsPerUnit < 0.001) return null;
    direction.divideScalar(pixelsPerUnit);
    return (deltaX * direction.x + deltaY * direction.y) / pixelsPerUnit;
}
