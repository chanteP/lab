import * as THREE from 'three';
import { entityProfileClosed } from '../profiles';
import { SKETCH_COLORS } from '../../config/colors';
import type { ModelDocument, Vec3 } from '../../types';
import type { ViewTool } from '../Viewport';
import { clearGroup } from './renderUtils';
import type { OverlayController } from './OverlayController';

export type GeometryAnchor = { id: string; normal: Vec3; localNormal: Vec3; point: Vec3; type: 'face' | 'edge'; vertices: Vec3[]; indices: number[] };

interface GuideRendererOptions {
    overlay: OverlayController;
    model: THREE.Group;
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
        const highlighted = group.userData.arrowKey === this.activeArrowKey || group.userData.arrowKey === this.hoverArrowKey;
        const material = new THREE.MeshBasicMaterial({ color: highlighted ? SKETCH_COLORS.hoverLine : SKETCH_COLORS.arrow, depthTest: false, depthWrite: false, toneMapped: false });
        const arrowLength = length / 3;
        const headHeight = Math.min(4, arrowLength * 0.7);
        const shaftLength = Math.max(0.5, arrowLength - headHeight);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, shaftLength, 16), material);
        shaft.position.y = shaftLength / 2;
        const head = new THREE.Mesh(new THREE.ConeGeometry(2.2, headHeight, 20), material);
        head.position.y = shaftLength + headHeight / 2;
        const outlineMaterial = new THREE.LineBasicMaterial({ color: SKETCH_COLORS.arrowOutline, depthTest: false, depthWrite: false, toneMapped: false });
        const shaftOutline = new THREE.LineSegments(new THREE.EdgesGeometry(shaft.geometry), outlineMaterial);
        const headOutline = new THREE.LineSegments(new THREE.EdgesGeometry(head.geometry), outlineMaterial);
        shaftOutline.position.copy(shaft.position);
        headOutline.position.copy(head.position);
        group.add(shaft, head, shaftOutline, headOutline);
        group.position.copy(origin);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
        group.scale.setScalar(2.5);
        group.traverse((child) => { Object.assign(child.userData, data); child.userData.arrowKey = group.userData.arrowKey; child.renderOrder = 100; });
        shaftOutline.renderOrder = headOutline.renderOrder = 101;
        return group;
    }

    update(document: ModelDocument) {
        clearGroup(this.group);
        this.options.overlay.clear('guide-label:');
        this.refreshFaceFeedback();
        if (this.options.isSketchMode()) return;
        const tool = this.options.getTool();
        const selected = this.options.getSelected();
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
        const geometryAnchor = this.options.getGeometryAnchor();
        if (['offsetFace', 'fillet', 'chamfer'].includes(tool) && geometryAnchor) {
            const entity = document.entities.find((item) => item.id === geometryAnchor.id);
            if (!entity) return;
            const normal = new THREE.Vector3(...geometryAnchor.normal).normalize();
            const origin = new THREE.Vector3(...geometryAnchor.point);
            const value = tool === 'offsetFace' ? entity.faceOffset?.distance || 0 : entity.edge?.size || 3;
            origin.add(normal.clone().multiplyScalar(value));
            const length = 18;
            this.group.add(this.createThickArrow(origin, normal, length, { directArrow: { id: entity.id } }));
            this.options.overlay.set({
                id: 'guide-label:direct',
                kind: 'label',
                position: origin.clone().add(normal.clone().multiplyScalar(length)).toArray(),
                text: this.options.formatLength(value),
                className: 'extrude-dimension',
                action: 'extrude-dimension',
            });
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
            const active = group.userData.arrowKey && (group.userData.arrowKey === this.activeArrowKey || group.userData.arrowKey === this.hoverArrowKey);
            group.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                const material = object.material as THREE.MeshBasicMaterial;
                if (material.color) material.color.set(active ? SKETCH_COLORS.hoverLine : SKETCH_COLORS.arrow);
            });
        });
    }

    refreshFaceFeedback() {
        clearGroup(this.faceFeedback);
        const anchor = this.options.getHoverFaceAnchor() || (['offsetFace', 'fillet', 'chamfer'].includes(this.options.getTool()) ? this.options.getGeometryAnchor() : null);
        if (!anchor) return;
        if (anchor.type === 'edge' && anchor.vertices.length >= 2) {
            const a = new THREE.Vector3(...anchor.vertices[0]), b = new THREE.Vector3(...anchor.vertices[1]);
            const direction = b.clone().sub(a);
            const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, direction.length(), 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.hoverLine, depthTest: false }));
            edge.position.copy(a).lerp(b, 0.5);
            edge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
            edge.renderOrder = 14;
            this.faceFeedback.add(edge);
        } else {
            const geometry = new THREE.BufferGeometry().setFromPoints(anchor.vertices.map((point) => new THREE.Vector3(...point)));
            geometry.setIndex(anchor.indices);
            const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.hoverFill, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthTest: false }));
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
