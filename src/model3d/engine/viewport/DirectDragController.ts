import * as THREE from 'three';
import type { EditPhase } from '../Viewport';
import type { Vec3 } from '../../types';
import type { GeometryAnchor } from './GeometrySelector';

interface DirectDragOptions {
    onEdit: (id: string, normal: Vec3, delta: number, phase: EditPhase, anchor?: GeometryAnchor) => void;
    onState: (state: { x: number; y: number; active: boolean }) => void;
    onPreview: (anchor: GeometryAnchor, delta: number, worldNormal: Vec3) => void;
}

/** Owns only face-arrow pointer state, absolute projection and RAF coalescing. */
export class DirectDragController {
    private drag: { id: string; normal: Vec3; worldNormal: Vec3; x: number; y: number; anchor: GeometryAnchor } | null = null;
    private frame = 0;
    private pendingDelta: number | null = null;
    get active() { return this.drag !== null; }

    constructor(private readonly options: DirectDragOptions) {}

    start(event: PointerEvent, id: string, normal: Vec3, worldNormal: Vec3, anchor: GeometryAnchor) {
        const frozen = { ...anchor, vertices: anchor.vertices.map((point) => [...point] as Vec3) };
        this.drag = { id, normal, worldNormal, x: event.clientX, y: event.clientY, anchor: frozen };
        this.options.onState({ x: event.clientX, y: event.clientY, active: true });
        this.options.onEdit(id, normal, 0, 'start', anchor);
    }

    private apply(delta: number) {
        if (!this.drag) return;
        this.options.onEdit(this.drag.id, this.drag.normal, delta, 'move');
        this.options.onPreview(this.drag.anchor, delta, this.drag.worldNormal);
    }

    private flush() {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
        if (this.pendingDelta !== null) this.apply(this.pendingDelta);
        this.pendingDelta = null;
    }

    move(event: PointerEvent, camera: THREE.Camera, target: THREE.Vector3) {
        if (!this.drag) return;
        this.options.onState({ x: event.clientX, y: event.clientY, active: true });
        const scale = Math.max(0.025, camera.position.distanceTo(target) * 0.002);
        const origin = new THREE.Vector3(...this.drag.anchor.point);
        const from = origin.clone().project(camera);
        const to = origin.clone().add(new THREE.Vector3(...this.drag.worldNormal)).project(camera);
        const direction = new THREE.Vector2(to.x - from.x, -(to.y - from.y));
        if (direction.lengthSq() < 0.000001) direction.set(0, -1);
        direction.normalize();
        this.pendingDelta = ((event.clientX - this.drag.x) * direction.x + (event.clientY - this.drag.y) * direction.y) * scale;
        if (!this.frame) this.frame = requestAnimationFrame(() => this.flush());
    }

    private cleanup() {
        this.drag = null;
        this.pendingDelta = null;
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    end() {
        if (!this.drag) return;
        this.flush();
        this.options.onEdit(this.drag.id, this.drag.normal, 0, 'end');
        this.cleanup();
    }

    cancel() {
        if (!this.drag) return;
        this.options.onEdit(this.drag.id, this.drag.normal, 0, 'cancel');
        this.options.onState({ x: 0, y: 0, active: false });
        this.cleanup();
    }

    dispose() { this.cleanup(); }
}
