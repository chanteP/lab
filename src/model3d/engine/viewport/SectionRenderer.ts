import * as THREE from 'three';
import { INTERACTION } from '../../config/const';
import { applyHatchPattern, type HatchUniforms } from './HatchMaterial';

type SectionEntry = {
    source: THREE.Mesh;
    stencilMeshes: THREE.Mesh[];
    cap: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    radius: number;
    renderOrder: number;
    hatch: HatchUniforms;
};

/** Clip only the retained source surface; the cap remains on the exact physical section plane. */
export function sectionSurfaceClipPlane(plane: THREE.Plane, epsilon = INTERACTION.sectionSurfaceClipEpsilon) {
    const clipped = plane.clone();
    clipped.constant -= epsilon;
    return clipped;
}

/** Keep inner faces visible only during section view, restoring each material's original side afterwards. */
export function applySectionSurface(material: THREE.Material, clippingPlane: THREE.Plane | null) {
    if (material.userData.baseSide === undefined) material.userData.baseSide = material.side;
    material.side = clippingPlane ? THREE.DoubleSide : material.userData.baseSide;
    material.clippingPlanes = clippingPlane ? [clippingPlane] : [];
    material.needsUpdate = true;
}

/** Draws solid section caps with a per-body stencil pass; source geometry remains shared and editable. */
export class SectionRenderer {
    readonly group = new THREE.Group();
    private entries: SectionEntry[] = [];

    rebuild(sources: THREE.Mesh[], plane: THREE.Plane) {
        this.dispose();
        sources.forEach((source, index) => {
            // Keep each body's stencil -> cap pair atomic while all retained sources paint before every cap.
            const renderOrder = index === 0 ? 1 : 1001 + (index - 1) * 2;
            const base = new THREE.MeshBasicMaterial({
                transparent: true,
                depthTest: false,
                depthWrite: false,
                colorWrite: false,
                clippingPlanes: [plane],
                stencilWrite: true,
                stencilFunc: THREE.AlwaysStencilFunc,
            });
            const back = base.clone();
            back.side = THREE.BackSide;
            back.stencilFail = back.stencilZFail = back.stencilZPass = THREE.IncrementWrapStencilOp;
            const front = base.clone();
            front.side = THREE.FrontSide;
            front.stencilFail = front.stencilZFail = front.stencilZPass = THREE.DecrementWrapStencilOp;
            base.dispose();

            const stencilMeshes = [back, front].map((material) => {
                const mesh = new THREE.Mesh(source.geometry, material);
                mesh.renderOrder = renderOrder;
                mesh.matrixAutoUpdate = false;
                this.group.add(mesh);
                return mesh;
            });
            const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
            const capMaterial = new THREE.MeshStandardMaterial({
                color: sourceMaterial instanceof THREE.MeshStandardMaterial ? sourceMaterial.color : new THREE.Color('#9a9a9a'),
                roughness: 1,
                metalness: 0,
                side: THREE.DoubleSide,
                // Keep caps in the same transparent queue as x-ray sources, then paint them last by renderOrder.
                transparent: true,
                // Section walls must remain visible in front of both the outer and inner shell surfaces.
                depthTest: false,
                depthWrite: false,
                stencilWrite: true,
                stencilRef: 0,
                stencilFunc: THREE.NotEqualStencilFunc,
                stencilFail: THREE.ReplaceStencilOp,
                stencilZFail: THREE.ReplaceStencilOp,
                stencilZPass: THREE.ReplaceStencilOp,
            });
            const hatch = applyHatchPattern(capMaterial, { color: capMaterial.color.clone().multiplyScalar(0.45), opacity: 1 });
            const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), capMaterial);
            cap.renderOrder = 1000 + index * 2;
            cap.frustumCulled = false;
            cap.receiveShadow = true;
            cap.onAfterRender = (renderer) => renderer.clearStencil();
            this.group.add(cap);

            source.geometry.computeBoundingSphere();
            const sphere = source.geometry.boundingSphere;
            const radius = Math.max(1, (sphere?.radius || 1) * source.scale.length() * 2);
            this.entries.push({ source, stencilMeshes, cap, radius, renderOrder: source.renderOrder, hatch });
            // Caps paint after retained surfaces so inner faces cannot cover the physical section.
            source.renderOrder = 999;
        });
        this.update(plane);
    }

    update(plane: THREE.Plane) {
        const point = new THREE.Vector3();
        const target = new THREE.Vector3();
        this.entries.forEach((entry) => {
            const { source, stencilMeshes, cap, radius, hatch } = entry;
            source.updateWorldMatrix(true, false);
            stencilMeshes.forEach((mesh) => {
                mesh.visible = source.visible;
                mesh.matrix.copy(source.matrixWorld);
                mesh.matrixWorldNeedsUpdate = true;
            });
            cap.visible = source.visible;
            const center = source.geometry.boundingSphere
                ? source.geometry.boundingSphere.center.clone().applyMatrix4(source.matrixWorld)
                : source.getWorldPosition(new THREE.Vector3());
            plane.projectPoint(center, point);
            cap.position.copy(point);
            target.copy(point).sub(plane.normal);
            cap.lookAt(target);
            cap.scale.setScalar(radius * 2);
            const material = Array.isArray(source.material) ? source.material[0] : source.material;
            if (material instanceof THREE.MeshStandardMaterial) {
                cap.material.color.copy(material.color).multiplyScalar(0.72);
                hatch.uHatchColor.value.copy(material.color).multiplyScalar(0.32);
            }
            hatch.uHatchScale.value = cap.scale.x;
        });
    }

    dispose() {
        this.entries.forEach(({ source, stencilMeshes, cap, renderOrder }) => {
            source.renderOrder = renderOrder;
            stencilMeshes.forEach((mesh) => (mesh.material as THREE.Material).dispose());
            cap.geometry.dispose();
            cap.material.dispose();
            cap.onAfterRender = () => undefined;
        });
        this.entries = [];
        this.group.clear();
    }
}
