import * as THREE from 'three';

interface VertexPickOptions {
    camera: THREE.Camera;
    canvas: HTMLCanvasElement;
    model: THREE.Group;
    event: PointerEvent;
    thresholdPx: number;
    selectThrough: boolean;
}

/** CSS-pixel topological vertex picking against the visible final topology. */
export function pickLogicalVertex({ camera, canvas, model, event, thresholdPx, selectThrough }: VertexPickOptions) {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
    const ndc = new THREE.Vector2(pointer.x / rect.width * 2 - 1, -(pointer.y / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const meshes = model.children.filter((child) => child.visible && !child.userData.selectionProxy && child instanceof THREE.Mesh) as THREE.Mesh[];
    const firstOcclusion = selectThrough ? null : raycaster.intersectObjects(meshes, false)[0];
    let best: { score: number; intersection: THREE.Intersection & { vertexId: string } } | null = null;
    model.children.forEach((body) => {
        if (!body.visible || body.userData.selectionProxy) return;
        const topology = body.userData.topology;
        if (!topology) return;
        body.updateWorldMatrix(true, false);
        topology.vertices.forEach((vertex: any) => {
            const world = new THREE.Vector3(...vertex.point).applyMatrix4(body.matrixWorld);
            const projected = world.clone().project(camera);
            if (projected.z < -1 || projected.z > 1) return;
            const x = (projected.x + 1) * rect.width / 2, y = (1 - projected.y) * rect.height / 2;
            const pixelDistance = Math.hypot(pointer.x - x, pointer.y - y);
            if (pixelDistance > thresholdPx) return;
            const distance = raycaster.ray.origin.distanceTo(world);
            if (!body.userData.selectionProxy && firstOcclusion && firstOcclusion.distance < distance - 2) return;
            const score = pixelDistance + distance * 1e-7;
            const intersection = { object: body, point: world, distance, vertexId: vertex.id } as THREE.Intersection & { vertexId: string };
            if (!best || score < best.score) best = { score, intersection };
        });
    });
    return best?.intersection || null;
}
