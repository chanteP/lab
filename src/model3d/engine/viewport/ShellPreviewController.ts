import * as THREE from 'three';
import { clearGroup } from './renderUtils';

export type ShellPreview = { entityId: string; geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4; keepSource?: boolean };

/** Viewport-only shell result; source entities and the document stay untouched until commit. */
export class ShellPreviewController {
    readonly group = new THREE.Group();
    private originals: { object: THREE.Object3D; visible: boolean }[] = [];

    get active() { return this.group.children.length > 0; }

    reset() {
        this.originals.forEach(({ object, visible }) => object.visible = visible);
        this.originals = [];
        clearGroup(this.group);
    }

    apply(model: THREE.Group, previews: ShellPreview[]) {
        this.reset();
        previews.forEach(({ entityId, geometry, matrix, keepSource }) => {
            const source = model.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh && child.userData.entityId === entityId && !child.userData.selectionProxy);
            if (!source) { geometry.dispose(); return; }
            if (!keepSource) {
                this.originals.push({ object: source, visible: source.visible });
                source.visible = false;
            }
            const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
            const material = sourceMaterial instanceof THREE.MeshStandardMaterial
                ? sourceMaterial.clone()
                : new THREE.MeshStandardMaterial({ color: '#8ca3b0', roughness: 1, metalness: 0 });
            material.transparent = false;
            material.opacity = 1;
            material.depthWrite = true;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.entityId = entityId;
            mesh.userData.shellPreview = true;
            if (matrix) {
                mesh.matrixAutoUpdate = false;
                mesh.matrix.copy(matrix);
                mesh.matrixWorldNeedsUpdate = true;
            } else {
                mesh.position.copy(source.position);
                mesh.quaternion.copy(source.quaternion);
                mesh.scale.copy(source.scale);
            }
            this.group.add(mesh);
        });
    }

    dispose() { this.reset(); }
}
