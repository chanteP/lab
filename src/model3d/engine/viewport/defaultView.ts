import * as THREE from 'three';

export const DEFAULT_3D_VIEW_DIRECTION = new THREE.Vector3(0.65, 0.55, 0.75).normalize();

/** Fit around an explicit origin instead of shifting the camera target to the content bounds center. */
export function defaultViewFitMetrics(box: THREE.Box3, target?: THREE.Vector3) {
    const center = target?.clone() || box.getCenter(new THREE.Vector3());
    if (!target) return { center, radius: Math.max(box.getSize(new THREE.Vector3()).length() / 2, 5) };
    if (box.isEmpty()) return { center, radius: 5 };
    let radius = 5;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        radius = Math.max(radius, new THREE.Vector3(x, y, z).distanceTo(center));
    }
    return { center, radius };
}
