import * as THREE from 'three';

interface EdgePickOptions {
    camera: THREE.Camera;
    canvas: HTMLCanvasElement;
    model: THREE.Group;
    event: PointerEvent;
    thresholdPx: number;
    selectThrough: boolean;
}

function closestOnSegment(point: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
    const delta = b.clone().sub(a);
    const lengthSquared = delta.lengthSq();
    const t = lengthSquared ? THREE.MathUtils.clamp(point.clone().sub(a).dot(delta) / lengthSquared, 0, 1) : 0;
    return { t, distance: point.distanceTo(a.clone().addScaledVector(delta, t)) };
}

/** CSS-pixel edge picking with independent visibility filtering and devicePixelRatio-free thresholds. */
export function pickLogicalEdge({ camera, canvas, model, event, thresholdPx, selectThrough }: EdgePickOptions): THREE.Intersection | null {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
    const ndc = new THREE.Vector2(pointer.x / rect.width * 2 - 1, -(pointer.y / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const meshes = model.children.filter((child) => child.visible && !child.userData.selectionProxy && child instanceof THREE.Mesh) as THREE.Mesh[];
    const occlusions = selectThrough ? [] : raycaster.intersectObjects(meshes, false);
    const firstOcclusion = occlusions[0];
    let best: { score: number; intersection: THREE.Intersection } | null = null;
    model.children.forEach((body) => {
        if (!body.visible || (body.userData.edgeTreated && !body.userData.selectionProxy)) return;
        body.children.forEach((child) => {
            if (!(child instanceof THREE.LineSegments) || !child.userData.displayEdge || !child.visible) return;
            const positions = child.geometry.attributes.position;
            child.updateWorldMatrix(true, false);
            for (let segment = 0; segment + 1 < positions.count; segment += 2) {
                const aWorld = new THREE.Vector3().fromBufferAttribute(positions, segment).applyMatrix4(child.matrixWorld);
                const bWorld = new THREE.Vector3().fromBufferAttribute(positions, segment + 1).applyMatrix4(child.matrixWorld);
                const aProjected = aWorld.clone().project(camera), bProjected = bWorld.clone().project(camera);
                if (aProjected.z < -1 || aProjected.z > 1 || bProjected.z < -1 || bProjected.z > 1) continue;
                const a = new THREE.Vector2((aProjected.x + 1) * rect.width / 2, (1 - aProjected.y) * rect.height / 2);
                const b = new THREE.Vector2((bProjected.x + 1) * rect.width / 2, (1 - bProjected.y) * rect.height / 2);
                const closest = closestOnSegment(pointer, a, b);
                if (closest.distance > thresholdPx) continue;
                const point = aWorld.clone().lerp(bWorld, closest.t);
                const distance = raycaster.ray.origin.distanceTo(point);
                if (!body.userData.selectionProxy && firstOcclusion && firstOcclusion.distance < distance - 0.05) continue;
                const score = closest.distance + distance * 1e-7;
                if (!best || score < best.score) best = { score, intersection: { object: child, index: segment, point, distance } as unknown as THREE.Intersection };
            }
        });
    });
    return best?.intersection || null;
}
