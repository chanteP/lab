import * as THREE from 'three';
import { INTERACTION } from '../../config/const';
import type { SketchPlane } from '../../types';
import type { CameraController } from './CameraController';
import { advanceGizmoOrbit } from './gizmoOrbit';

export type GizmoDragState = {
    pointerId: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
    moved: boolean;
    spherical: THREE.Spherical;
};

interface GizmoDragOptions {
    capture: (event: PointerEvent) => void;
    release: (event: PointerEvent) => void;
    rotatePlane: (event: PointerEvent, drag: GizmoDragState) => void;
}

/** Owns click/drag disambiguation and cleanup for both world and sketch orientation gizmos. */
export class GizmoDragController {
    private drag: GizmoDragState | null = null;
    get active() { return this.drag !== null; }

    constructor(private readonly cameraController: CameraController, private readonly options: GizmoDragOptions) {}
    private get controls() { return this.cameraController.controls; }
    private get camera() { return this.cameraController.camera; }

    contains(event: PointerEvent) {
        const rect = this.cameraController.renderer.domElement.getBoundingClientRect();
        return event.clientX >= rect.right - 128 && event.clientY >= rect.bottom - 140 && event.clientY <= rect.bottom - 12;
    }

    start(event: PointerEvent, sketchMode: boolean) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!sketchMode) this.camera.up.set(0, 1, 0);
        const rect = this.cameraController.renderer.domElement.getBoundingClientRect();
        const spherical = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
        this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, centerX: rect.right - 64, centerY: rect.bottom - 76, moved: false, spherical };
        this.options.capture(event);
        this.controls.enabled = false;
    }

    move(event: PointerEvent, sketchMode: boolean) {
        const drag = this.drag;
        if (!drag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.pointerId !== drag.pointerId) return;
        // Some touch/WebView paths lose pointerup; a released buttons mask must never leave a sticky orbit gesture.
        if (event.buttons === 0) return this.cancel(event);
        if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= INTERACTION.clickTolerancePx) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.moved = true;

        if (sketchMode) {
            this.options.rotatePlane(event, drag);
        } else {
            // Continue from the unsnapped orbit; snapping only changes the rendered camera, not the drag state.
            const spherical = advanceGizmoOrbit(drag.spherical, dx, dy);
            this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
            this.camera.lookAt(this.controls.target);
            this.cameraController.viewHelper.center.copy(this.controls.target);
            this.cameraController.viewHelper.snap();
        }
        drag.x = event.clientX;
        drag.y = event.clientY;
    }

    finish(event: PointerEvent, sketchMode: boolean, plane: SketchPlane | null) {
        const drag = this.drag;
        if (!drag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const shouldPickAxis = !drag.moved;
        this.drag = null;
        this.options.release(event);
        this.controls.enabled = true;
        if (shouldPickAxis) this.cameraController.snapGizmoCamera(event, sketchMode, plane);
        else this.controls.update();
    }

    cancel(event?: PointerEvent) {
        if (!this.drag) return;
        if (event) this.options.release(event);
        this.drag = null;
        this.controls.enabled = true;
        this.controls.update();
    }
}
