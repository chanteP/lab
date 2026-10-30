import * as THREE from 'three';
import { VIEWPORT_COLORS } from '../../config/colors';
import { clearGroup } from './renderUtils';
import type { OverlayController } from './OverlayController';

/** Two-point measurement geometry and its labels. */
export class MeasurementRenderer {
    readonly group = new THREE.Group();
    readonly points: THREE.Vector3[] = [];
    hoverFace: THREE.Mesh | null = null;

    constructor(private readonly formatLength: (value: number) => string, private readonly overlay: OverlayController) {}

    clearHoverFace() {
        if (!this.hoverFace) return;
        this.group.remove(this.hoverFace);
        this.hoverFace.geometry.dispose();
        (this.hoverFace.material as THREE.Material).dispose();
        this.hoverFace = null;
    }

    showHoverFace(hit: THREE.Intersection) {
        this.clearHoverFace();
        if (!hit.face) return;
        const mesh = hit.object as THREE.Mesh;
        const positions = mesh.geometry.attributes.position;
        const indices = mesh.geometry.index;
        const faceIndices = indices ? [indices.getX(hit.faceIndex! * 3), indices.getX(hit.faceIndex! * 3 + 1), indices.getX(hit.faceIndex! * 3 + 2)] : [hit.face.a, hit.face.b, hit.face.c];
        const points = faceIndices.map((index) => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
        const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).multiplyScalar(0.04);
        points.forEach((point) => point.add(normal));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        geometry.setIndex([0, 1, 2]);
        this.hoverFace = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: this.points.length ? VIEWPORT_COLORS.measureFaceActive : VIEWPORT_COLORS.measureFace, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }));
        this.hoverFace.renderOrder = 8;
        this.group.add(this.hoverFace);
    }

    addPoint(point: THREE.Vector3) {
        this.points.push(point.clone());
        const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: this.points.length === 1 ? VIEWPORT_COLORS.measureStart : VIEWPORT_COLORS.measureEnd, depthTest: false }));
        marker.position.copy(point);
        marker.renderOrder = 9;
        this.group.add(marker);
        this.clearHoverFace();
        if (this.points.length === 2) this.draw();
    }

    private label(text: string, position: THREE.Vector3, className = '') {
        this.overlay.set({ id: `measure-label:${className || 'total'}`, kind: 'label', position: position.toArray(), text, className });
    }

    private doubleArrow(a: THREE.Vector3, b: THREE.Vector3, color: string, label?: string, labelClass = '') {
        const direction = b.clone().sub(a);
        const length = direction.length();
        if (length < 0.0001) return;
        direction.normalize();
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, depthTest: false }));
        line.renderOrder = 9;
        this.group.add(line);
        const height = Math.min(3, Math.max(1.2, length * 0.08));
        [[a, direction.clone().negate()], [b, direction]].forEach(([point, dir]) => {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(height * 0.32, height, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir as THREE.Vector3);
            cone.position.copy(point as THREE.Vector3).add((dir as THREE.Vector3).clone().multiplyScalar(height / 2));
            cone.renderOrder = 9;
            this.group.add(cone);
        });
        if (label) this.label(label, a.clone().lerp(b, 0.5), labelClass);
    }

    draw() {
        this.overlay.clear('measure-label:');
        const [a, b] = this.points;
        this.doubleArrow(a, b, VIEWPORT_COLORS.measureStart, this.formatLength(a.distanceTo(b)), 'measure-total');
        const x = new THREE.Vector3(b.x, a.y, a.z), y = new THREE.Vector3(b.x, b.y, a.z);
        if (Math.abs(b.x - a.x) > 0.0001) this.doubleArrow(a, x, VIEWPORT_COLORS.measureX, this.formatLength(Math.abs(b.x - a.x)), 'axis-x');
        if (Math.abs(b.y - a.y) > 0.0001) this.doubleArrow(x, y, VIEWPORT_COLORS.measureY, this.formatLength(Math.abs(b.y - a.y)), 'axis-y');
        if (Math.abs(b.z - a.z) > 0.0001) this.doubleArrow(y, b, VIEWPORT_COLORS.measureZ, this.formatLength(Math.abs(b.z - a.z)), 'axis-z');
    }

    clear() {
        this.clearHoverFace();
        clearGroup(this.group);
        this.overlay.clear('measure-label:');
        this.points.length = 0;
        this.hoverFace = null;
    }

    dispose() {
        this.clear();
    }
}
