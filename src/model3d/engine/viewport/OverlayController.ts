import * as THREE from 'three';
import type { LengthUnit, SketchEdgeConstraint, Vec3 } from '../../types';
import type { SketchDimension } from '../Viewport';

export type ViewportOverlay = {
    id: string;
    position: Vec3;
} & ({
    kind: 'dimension';
    target: SketchDimension;
    value: number;
    unit: LengthUnit;
} | {
    kind: 'lock';
    entityId: string;
    index: number;
    edge: boolean;
    rule?: SketchEdgeConstraint;
    order: number;
    active: boolean;
    linked: boolean;
    color: string;
} | {
    kind: 'label';
    text: string;
    className: string;
    action?: 'extrude-dimension';
});

export type ProjectedViewportOverlay = ViewportOverlay & { x: number; y: number };

/** Plain overlay view-models; Three.js objects never enter Vue state. */
export class OverlayController {
    private readonly items = new Map<string, ViewportOverlay>();

    set(item: ViewportOverlay) {
        this.items.set(item.id, item);
    }

    clear(prefix: string) {
        this.items.forEach((_, id) => { if (id.startsWith(prefix)) this.items.delete(id); });
    }

    project(camera: THREE.Camera, canvas: HTMLCanvasElement): ProjectedViewportOverlay[] {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const projected: ProjectedViewportOverlay[] = [];
        this.items.forEach((item) => {
            const point = new THREE.Vector3(...item.position).project(camera);
            if (point.z < -1 || point.z > 1) return;
            projected.push({ ...item, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 });
        });
        return projected;
    }

    clearAll() {
        this.items.clear();
    }
}
