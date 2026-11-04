import * as THREE from 'three';
import { INTERACTION } from '../../config/const';
import type { EditPhase } from '../Viewport';
import type { Point2 } from '../../types';

interface SketchAssetDragOptions {
    point: (event: PointerEvent, id: string) => Point2 | null;
    onGesture: (id: string, index: number, point: Point2, phase: EditPhase) => void;
    onState: (active: boolean) => void;
    onFinish: () => void;
}

type Drag = { id: string; index: number; startX: number; startY: number; startPoint: Point2; moved: boolean };

/** Raster/SVG corner pointer state, including click thresholds and cancellation. */
export class SketchAssetDragController {
    private drag: Drag | null = null;
    get active() { return !!this.drag; }

    constructor(private readonly options: SketchAssetDragOptions) {}

    pointerDown(event: PointerEvent, markers: THREE.Object3D[], raycaster: THREE.Raycaster) {
        const hit = raycaster.intersectObjects(markers, false)[0];
        const corner = hit?.object.userData.assetCorner as { id: string; index: number } | undefined;
        if (!corner) return false;
        const startPoint = this.options.point(event, corner.id);
        if (!startPoint) return true;
        this.drag = { ...corner, startX: event.clientX, startY: event.clientY, startPoint, moved: false };
        this.options.onState(true);
        return true;
    }

    move(event: PointerEvent) {
        if (!this.drag) return false;
        if (!this.drag.moved) {
            if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) < INTERACTION.sketchDragThresholdPx) return true;
            this.drag.moved = true;
            this.options.onGesture(this.drag.id, this.drag.index, this.drag.startPoint, 'start');
        }
        const point = this.options.point(event, this.drag.id);
        if (point) this.options.onGesture(this.drag.id, this.drag.index, point, 'move');
        return true;
    }

    end(event: PointerEvent) {
        if (!this.drag) return false;
        if (this.drag.moved) {
            const point = this.options.point(event, this.drag.id);
            if (point) this.options.onGesture(this.drag.id, this.drag.index, point, 'end');
        }
        this.cleanup();
        this.options.onFinish();
        return true;
    }

    cancel() {
        if (!this.drag) return;
        if (this.drag.moved) this.options.onGesture(this.drag.id, this.drag.index, this.drag.startPoint, 'cancel');
        this.cleanup();
    }

    reset() { this.drag = null; }

    private cleanup() {
        this.drag = null;
        this.options.onState(false);
    }
}
