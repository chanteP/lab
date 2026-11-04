import * as THREE from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { entityProfileClosed } from '../profiles';
import { SKETCH_COLORS } from '../../config/colors';
import { INTERACTION } from '../../config/const';
import type { LengthUnit, ModelDocument, Vec3 } from '../../types';
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
    getSectionPlane: () => THREE.Plane | null;
    isSketchMode: () => boolean;
    getLengthUnit: () => LengthUnit;
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
        const material = new THREE.MeshStandardMaterial({ color: active ? SKETCH_COLORS.arrowActive : hovered ? SKETCH_COLORS.arrowHover : SKETCH_COLORS.arrow, transparent: true, depthTest: false, depthWrite: false, roughness: 0.48, metalness: 0, envMapIntensity: 0.35 });
        material.color.multiplyScalar(0.65);
        const arrowLength = length / 3;
        const headHeight = Math.min(4, arrowLength * 0.7);
        const shaftLength = Math.max(0.5, arrowLength - headHeight);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, shaftLength, 24), material);
        shaft.position.y = shaftLength / 2;
        const head = new THREE.Mesh(new THREE.ConeGeometry(2.2, headHeight, 32), material);
        head.position.y = shaftLength + headHeight / 2;
        shaft.castShadow = true;
        head.castShadow = true;
        shaft.receiveShadow = true;
        head.receiveShadow = true;
        group.add(shaft, head);
        group.position.copy(origin);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
        group.scale.setScalar(2.5);
        group.traverse((child) => { Object.assign(child.userData, data); child.userData.arrowKey = group.userData.arrowKey; child.renderOrder = 100; });
        return group;
    }

    update(document: ModelDocument) {
        clearGroup(this.group);
        this.options.overlay.clear('guide-label:');
        this.refreshFaceFeedback();
        if (this.options.isSketchMode() || this.options.getSectionPlane()) return;
        const tool = this.options.getTool();
        const selected = this.options.getSelected();
        const geometryAnchor = this.options.getGeometryAnchor();
        const geometryEntity = document.entities.find((item) => item.id === geometryAnchor?.id);
        if (['select', 'offsetFace'].includes(tool) && geometryAnchor?.type === 'face' && geometryAnchor.planar && geometryEntity?.kind !== 'sketch' && selected.includes(geometryAnchor.id)) {
            const entity = document.entities.find((item) => item.id === geometryAnchor.id);
            if (!entity || entity.kind === 'sphere') return;
            const normal = new THREE.Vector3(...geometryAnchor.normal).normalize();
            const origin = new THREE.Vector3(...geometryAnchor.point);
            const value = entity.faceOffset?.distance || 0;
            const length = 18;
            this.group.add(this.createThickArrow(origin, normal, length, { directArrow: { id: entity.id } }));
            this.options.overlay.set({
                id: 'guide-label:direct', kind: 'dimension', target: { kind: 'directFace' },
                position: origin.clone().add(normal.clone().multiplyScalar(length * 0.65)).toArray(), screenOffset: [76, 0],
                value, unit: this.options.getLengthUnit(), signed: true,
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
            if (geometryAnchor?.key.endsWith(':intersection') && selected.includes(geometryAnchor.id)) {
                center.copy(new THREE.Vector3(...geometryAnchor.point));
                normal.copy(new THREE.Vector3(...geometryAnchor.normal));
            }
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
            kind: 'dimension', target: { kind: 'extrudeDepth' },
            position: arrowOrigin.clone().add(normal.multiplyScalar(direction * 12)).toArray(), screenOffset: [76, 0],
            value: length, unit: this.options.getLengthUnit(),
        });
    }

    updateArrowColors() {
        this.group.children.forEach((group) => {
            const active = group.userData.arrowKey === this.activeArrowKey;
            const hovered = group.userData.arrowKey === this.hoverArrowKey;
            group.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                const material = object.material as THREE.MeshStandardMaterial;
                if (material.color) material.color.set(active ? SKETCH_COLORS.arrowActive : hovered ? SKETCH_COLORS.arrowHover : SKETCH_COLORS.arrow).multiplyScalar(0.65);
            });
        });
    }

    updateAnimation(camera: THREE.Camera, time: number) {
        const height = this.options.renderer.domElement.clientHeight || 1;
        const breath = Math.sin(time * 2.4);
        this.group.children.forEach((arrow) => {
            const origin = arrow.getWorldPosition(new THREE.Vector3());
            const worldPerPixel = camera instanceof THREE.PerspectiveCamera
                ? 2 * camera.position.distanceTo(origin) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height
                : (camera as THREE.OrthographicCamera).top ? ((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom) / height : 0.1;
            arrow.scale.setScalar(worldPerPixel * INTERACTION.arrowScreenLengthPx / 6);
            arrow.traverse((object) => {
                if (object instanceof THREE.Mesh) (object.material as THREE.MeshStandardMaterial).opacity = 0.76 + breath * 0.14;
            });
        });
        this.faceFeedback.children.forEach((object) => {
            if (!(object instanceof THREE.Mesh) || !object.userData.activeSelection) return;
            (object.material as THREE.Material).opacity = 0.42 + breath * 0.12;
        });
    }

    refreshFaceFeedback() {
        clearGroup(this.faceFeedback);
        if (this.options.isSketchMode()) return;
        const selected = this.options.getGeometryAnchor();
        const hovered = this.options.getHoverFaceAnchor();
        if (selected && this.options.getSelected().includes(selected.id)) this.renderAnchor(selected, true);
        if (hovered && hovered.key !== selected?.key) this.renderAnchor(hovered, false);
    }

    private renderAnchor(anchor: GeometryAnchor, active: boolean) {
        const color = active ? SKETCH_COLORS.activeDark : SKETCH_COLORS.active;
        if (anchor.type === 'edge' && anchor.vertices.length >= 2) {
            const canvas = this.options.renderer.domElement;
            const edge = createFatLine(anchor.vertices.map((point) => new THREE.Vector3(...point)), canvas.clientWidth, canvas.clientHeight);
            const material = edge.material as LineMaterial;
            material.color.set(color);
            material.linewidth = 4;
            material.clippingPlanes = this.options.getSectionPlane() ? [this.options.getSectionPlane()!] : [];
            edge.renderOrder = 14;
            this.faceFeedback.add(edge);
        } else if (anchor.vertices.length >= 3) {
            const geometry = new THREE.BufferGeometry().setFromPoints(anchor.vertices.map((point) => new THREE.Vector3(...point)));
            geometry.setIndex(anchor.indices);
            const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: active ? 0.48 : 0.3, side: THREE.DoubleSide,
                depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
                clippingPlanes: this.options.getSectionPlane() ? [this.options.getSectionPlane()!] : [],
            }));
            face.userData.activeSelection = active;
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
