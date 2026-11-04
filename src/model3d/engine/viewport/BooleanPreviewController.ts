import * as THREE from 'three';
import type { ModelDocument, ModelEntity, OperationState } from '../../types';
import { buildEntityMesh } from '../geometry';
import { VIEWPORT_COLORS } from '../../config/colors';
import { clearGroup } from './renderUtils';
import type { OverlayController } from './OverlayController';

export type BooleanPreviewState = Extract<OperationState, { type: 'boolean' }>;
type PreviewMaterial = THREE.Material & { color?: THREE.Color; opacity: number; transparent: boolean; depthWrite: boolean; depthTest: boolean };
type MaterialSnapshot = { material: PreviewMaterial; color?: THREE.Color; opacity: number; transparent: boolean; depthWrite: boolean; depthTest: boolean };

/** Temporary CSG visualization only; no preview result enters the document or entity tree. */
export class BooleanPreviewController {
    readonly group = new THREE.Group();
    private originals: { object: THREE.Object3D; visible: boolean; materials: MaterialSnapshot[] }[] = [];

    constructor(private readonly overlay: OverlayController) {}

    reset() {
        this.originals = [];
        clearGroup(this.group);
        this.overlay.clear('boolean-button:');
    }

    restore() {
        this.originals.forEach(({ object, visible, materials }) => {
            object.visible = visible;
            materials.forEach((snapshot) => {
                if (snapshot.color && snapshot.material.color) snapshot.material.color.copy(snapshot.color);
                snapshot.material.opacity = snapshot.opacity;
                snapshot.material.transparent = snapshot.transparent;
                snapshot.material.depthWrite = snapshot.depthWrite;
                snapshot.material.depthTest = snapshot.depthTest;
                snapshot.material.needsUpdate = true;
            });
        });
        this.reset();
    }

    apply(model: THREE.Group, document: ModelDocument, state: BooleanPreviewState) {
        this.restore();
        const selected = new Set(state.operandIds);
        const objects = [...model.children];
        state.operandIds.forEach((id) => {
            if (objects.some((object) => object.userData.entityId === id)) return;
            const entity = document.entities.find((item) => item.id === id);
            if (!entity) return;
            const mesh = buildEntityMesh(entity, document);
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: VIEWPORT_COLORS.bodyEdge }));
            edges.userData.displayEdge = true;
            mesh.add(edges);
            this.group.add(mesh);
            objects.push(mesh);
        });
        objects.forEach((object) => {
            const id = object.userData.entityId;
            const materials: MaterialSnapshot[] = [];
            object.traverse((child) => {
                if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.LineSegments)) return;
                const list = (Array.isArray(child.material) ? child.material : [child.material]) as PreviewMaterial[];
                list.forEach((material) => materials.push({
                    material, color: material.color?.clone(), opacity: material.opacity,
                    transparent: material.transparent, depthWrite: material.depthWrite, depthTest: material.depthTest,
                }));
            });
            this.originals.push({ object, visible: object.visible, materials });
            object.visible = selected.has(id);
            if (!object.visible) return;

            const sign = state.signs[id] || 1;
            const color = sign === 1 ? VIEWPORT_COLORS.booleanTool : '#a92f3d';
            object.traverse((child) => {
                if (child.userData.displayEdge) {
                    const material = (child as THREE.LineSegments).material as THREE.LineBasicMaterial;
                    material.color.set(color);
                    material.opacity = 1;
                    material.depthTest = false;
                    return;
                }
                if (!(child instanceof THREE.Mesh)) return;
                const material = child.material as THREE.MeshStandardMaterial;
                material.color.set(color);
                material.transparent = true;
                material.opacity = state.operation === 'intersect' ? 0.1 : 0.3;
                material.depthWrite = false;
            });

            const bounds = new THREE.Box3().setFromObject(object);
            if (!bounds.isEmpty()) {
                const center = bounds.getCenter(new THREE.Vector3());
                this.overlay.set({ id: `boolean-button:${id}`, kind: 'booleanButton', entityId: id, sign, position: center.toArray() });
            }
        });

        if (state.operation === 'intersect' && state.operandIds.some((id) => state.signs[id] === 1)) this.renderIntersection(document, state);
    }

    private renderIntersection(document: ModelDocument, state: BooleanPreviewState) {
        const preview: ModelEntity = {
            id: '__boolean_intersection_preview__', parentId: null, name: '交集预览', kind: 'boolean', color: VIEWPORT_COLORS.booleanTarget,
            visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
            operation: 'intersect', operands: [...state.operandIds], operandSigns: { ...state.signs },
        };
        const mesh = buildEntityMesh(preview, document);
        mesh.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            const material = child.material as THREE.MeshStandardMaterial;
            material.color.set(VIEWPORT_COLORS.booleanTarget);
            material.transparent = true;
            material.opacity = 0.58;
            material.depthWrite = false;
            child.renderOrder = 20;
        });
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry, 25),
            new THREE.LineBasicMaterial({ color: VIEWPORT_COLORS.booleanTarget, transparent: true, opacity: 1, depthTest: false }),
        );
        edges.renderOrder = 21;
        this.group.add(mesh, edges);
    }

    dispose() { this.reset(); }
}
