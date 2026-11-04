import * as THREE from 'three';
import type { LengthUnit, Point2, SketchEdgeConstraint, Vec3 } from '../../types';
import type { SketchDimension } from '../Viewport';

export type ViewportOverlay = {
    id: string;
    position: Vec3;
    screenOffset?: Point2;
} & ({
    kind: 'dimension';
    target: SketchDimension | { kind: 'directFace' } | { kind: 'edgeTreatment' } | { kind: 'extrudeDepth' };
    value: number;
    unit: LengthUnit;
    signed?: boolean;
    angle?: number;
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
    kind: 'booleanButton';
    entityId: string;
    sign: 1 | -1;
} | {
    kind: 'label';
    text: string;
    className: string;
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
            projected.push({
                ...item,
                x: (point.x + 1) * width / 2 + (item.screenOffset?.[0] || 0),
                y: (1 - point.y) * height / 2 + (item.screenOffset?.[1] || 0),
            });
        });
        return projected;
    }

    clearAll() {
        this.items.clear();
    }
}
