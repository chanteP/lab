import * as THREE from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { entityProfileClosed } from '../profiles';
import { SKETCH_COLORS } from '../../config/colors';
import type { ModelDocument, Vec3 } from '../../types';
import type { ViewTool } from '../Viewport';
import { clearGroup, createFatLine } from './renderUtils';
import type { OverlayController } from './OverlayController';
import type { GeometryAnchor } from './GeometrySelector';

export type { GeometryAnchor } from './GeometrySelector';

interface GuideRendererOptions {
    overlay: OverlayController;
    model: THREE.Group;
    renderer: THREE.WebGLRenderer;
    getSelected: () => string[];
    getTool: () => ViewTool;
    getGeometryAnchor: () => GeometryAnchor | null;
    getHoverFaceAnchor: () => GeometryAnchor | null;
    isSketchMode: () => boolean;
    formatLength: (value: number) => string;
}

/** Direct-edit/extrude arrows and the face or edge feedback associated with them. */
export class GuideRenderer {
    readonly group = new THREE.Group();
    readonly faceFeedback = new THREE.Group();
    activeArrowKey: string | null = null;
    hoverArrowKey: string | null = null;

    constructor(private readonly options: GuideRendererOptions) {}

    private createThickArrow(origin: THREE.Vector3, normal: THREE.Vector3, length: number, data: Record<string, any>) {
        const group = new THREE.Group();
        group.userData.arrowKey = JSON.stringify(data);
        const active = group.userData.arrowKey === this.activeArrowKey;
        const hovered = group.userData.arrowKey === this.hoverArrowKey;
        const material = new THREE.MeshBasicMaterial({ color: active ? SKETCH_COLORS.arrowActive : hovered ? SKETCH_COLORS.arrowHover : SKETCH_COLORS.arrow, depthTest: true, depthWrite: true, toneMapped: false, side: THREE.DoubleSide });
        const arrowLength = length / 3;
        const headHeight = Math.min(4, arrowLength * 0.7);
        const shaftLength = Math.max(0.5, arrowLength - headHeight);
        const shape = new THREE.Shape([
            new THREE.Vector2(-1.3, 0), new THREE.Vector2(-1.3, shaftLength), new THREE.Vector2(-2.2, shaftLength),
            new THREE.Vector2(0, arrowLength), new THREE.Vector2(2.2, shaftLength), new THREE.Vector2(1.3, shaftLength), new THREE.Vector2(1.3, 0),
        ]);
        const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
        const outlineMaterial = new THREE.LineBasicMaterial({ color: SKETCH_COLORS.arrowOutline, depthTest: true, depthWrite: false, toneMapped: false });
        const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints().map((point) => new THREE.Vector3(point.x, point.y, 0))), outlineMaterial);
        group.add(arrow, outline);
        group.position.copy(origin);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
        group.scale.setScalar(2.5);
        group.traverse((child) => { Object.assign(child.userData, data); child.userData.arrowKey = group.userData.arrowKey; child.renderOrder = 100; });
        outline.renderOrder = 101;
        return group;
    }

    update(document: ModelDocument) {
        clearGroup(this.group);
        this.options.overlay.clear('guide-label:');
        this.refreshFaceFeedback();
        if (this.options.isSketchMode()) return;
        const tool = this.options.getTool();
        const selected = this.options.getSelected();
        const geometryAnchor = this.options.getGeometryAnchor();
        if (['select', 'offsetFace'].includes(tool) && geometryAnchor?.type === 'face' && selected.includes(geometryAnchor.id)) {
            const entity = document.entities.find((item) => item.id === geometryAnchor.id);
            if (!entity) return;
            const normal = new THREE.Vector3(...geometryAnchor.normal).normalize();
            const origin = new THREE.Vector3(...geometryAnchor.point);
            const value = entity.faceOffset?.distance || 0;
            origin.add(normal.clone().multiplyScalar(value));
            const length = 18;
            this.group.add(this.createThickArrow(origin, normal, length, { directArrow: { id: entity.id } }));
            this.options.overlay.set({
                id: 'guide-label:direct', kind: 'label', position: origin.clone().add(normal.clone().multiplyScalar(length)).toArray(),
                text: this.options.formatLength(value), className: 'extrude-dimension', action: 'extrude-dimension',
            });
            return;
        }
        if (tool === 'select') {
            const profiles = selected.map((id) => document.entities.find((item) => item.id === id && item.kind === 'sketch' && entityProfileClosed(item))).filter(Boolean) as ModelDocument['entities'];
            if (!profiles.length) return;
            const box = new THREE.Box3();
            profiles.forEach((profile) => {
                const object = this.options.model.children.find((item) => item.userData.entityId === profile.id);
                if (object) box.expandByObject(object);
            });
            if (box.isEmpty()) return;
            const center = box.getCenter(new THREE.Vector3());
            const plane = document.planes.find((item) => item.id === profiles[0].planeId);
            const normal = plane ? new THREE.Vector3(...plane.normal).normalize() : new THREE.Vector3(0, 1, 0);
            for (const direction of [1, -1] as const) {
                this.group.add(this.createThickArrow(center, normal.clone().multiplyScalar(direction), 18, { extrudeArrow: { profileId: profiles[profiles.length - 1].id, direction } }));
            }
            return;
        }
        if (tool !== 'extrude') return;
        const profile = document.entities.find((item) => item.id === selected[selected.length - 1] && item.kind === 'sketch');
        const body = document.entities.find((item) => item.profileId === profile?.id);
        if (!profile || !body) return;
        const object = this.options.model.children.find((item) => item.userData.entityId === profile.id);
        if (!object) return;
        const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
        const plane = document.planes.find((item) => item.id === profile.planeId);
        const normal = plane ? new THREE.Vector3(...plane.normal) : new THREE.Vector3(0, 1, 0);
        const direction = body.direction === -1 ? -1 : 1;
        const length = Math.max(3, body.depth || 3);
        const arrowOrigin = center.clone().add(normal.clone().multiplyScalar(direction * length));
        this.group.add(this.createThickArrow(arrowOrigin, normal.clone().multiplyScalar(direction), 18, { directArrow: { id: body.id, normal: [0, 1, 0] as Vec3 } }));
        this.options.overlay.set({
            id: 'guide-label:extrude',
            kind: 'label',
            position: arrowOrigin.clone().add(normal.multiplyScalar(direction * 18)).toArray(),
            text: this.options.formatLength(length),
            className: 'extrude-dimension',
            action: 'extrude-dimension',
        });
    }

    updateArrowColors() {
        this.group.children.forEach((group) => {
            const active = group.userData.arrowKey === this.activeArrowKey;
            const hovered = group.userData.arrowKey === this.hoverArrowKey;
            group.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                const material = object.material as THREE.MeshBasicMaterial;
                if (material.color) material.color.set(active ? SKETCH_COLORS.arrowActive : hovered ? SKETCH_COLORS.arrowHover : SKETCH_COLORS.arrow);
            });
        });
    }

    refreshFaceFeedback() {
        clearGroup(this.faceFeedback);
        if (this.options.isSketchMode()) return;
        const selected = this.options.getGeometryAnchor();
        const hovered = this.options.getHoverFaceAnchor();
        if (selected && this.options.getSelected().includes(selected.id)) this.renderAnchor(selected, true);
        if (hovered && hovered.id !== selected?.id) this.renderAnchor(hovered, false);
    }

    private renderAnchor(anchor: GeometryAnchor, active: boolean) {
        const color = active ? SKETCH_COLORS.active : SKETCH_COLORS.hoverFill;
        if (anchor.type === 'edge' && anchor.vertices.length >= 2) {
            const canvas = this.options.renderer.domElement;
            const edge = createFatLine(anchor.vertices.map((point) => new THREE.Vector3(...point)), canvas.clientWidth, canvas.clientHeight);
            const material = edge.material as LineMaterial;
            material.color.set(color);
            material.linewidth = 4;
            edge.renderOrder = 14;
            this.faceFeedback.add(edge);
        } else if (anchor.vertices.length >= 3) {
            const geometry = new THREE.BufferGeometry().setFromPoints(anchor.vertices.map((point) => new THREE.Vector3(...point)));
            geometry.setIndex(anchor.indices);
            const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: active ? 0.48 : 0.3, side: THREE.DoubleSide,
                depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
            }));
            face.renderOrder = 13;
            this.faceFeedback.add(face);
        }
    }

    dispose() {
        clearGroup(this.group);
        clearGroup(this.faceFeedback);
        this.options.overlay.clear('guide-label:');
    }
}
