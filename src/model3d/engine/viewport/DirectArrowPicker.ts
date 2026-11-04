import * as THREE from 'three';

interface DirectArrowPickOptions {
    guides: THREE.Group;
    camera: THREE.Camera;
    canvas: HTMLCanvasElement;
    event: PointerEvent;
    thresholdPx: number;
}

/** Screen-space handle picking avoids tiny/offset WebGL mesh hit areas. */
export function pickDirectArrow({ guides, camera, canvas, event, thresholdPx }: DirectArrowPickOptions) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    let best: { score: number; data: { id: string; normal?: [number, number, number] }; key: string } | null = null;
    guides.children.forEach((arrow) => {
        const data = arrow.children[0]?.userData.directArrow;
        if (!data) return;
        arrow.updateWorldMatrix(true, true);
        const center = new THREE.Box3().setFromObject(arrow).getCenter(new THREE.Vector3()).project(camera);
        if (center.z < -1 || center.z > 1) return;
        const screenX = (center.x + 1) * rect.width / 2, screenY = (1 - center.y) * rect.height / 2;
        const distance = Math.hypot(x - screenX, y - screenY);
        if (distance > thresholdPx) return;
        if (!best || distance < best.score) best = { score: distance, data, key: arrow.userData.arrowKey };
    });
    return best;
}
