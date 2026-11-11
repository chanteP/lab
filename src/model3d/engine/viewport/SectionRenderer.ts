import * as THREE from 'three';

type SectionEntry = {
    source: THREE.Mesh;
    stencilMeshes: THREE.Mesh[];
    cap: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    radius: number;
    renderOrder: number;
};

/** Clip only the retained source surface; the cap remains on the exact physical section plane. */
export function sectionSurfaceClipPlane(plane: THREE.Plane, epsilon = 0.0001) {
    const clipped = plane.clone();
    clipped.constant -= epsilon;
    return clipped;
}

/** Draws solid section caps with a per-body stencil pass; source geometry remains shared and editable. */
export class SectionRenderer {
    readonly group = new THREE.Group();
    private entries: SectionEntry[] = [];

    rebuild(sources: THREE.Mesh[], plane: THREE.Plane) {
        this.dispose();
        sources.forEach((source, index) => {
            const renderOrder = index * 2 + 1;
            const base = new THREE.MeshBasicMaterial({
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
                stencilWrite: true,
                stencilRef: 0,
                stencilFunc: THREE.NotEqualStencilFunc,
                stencilFail: THREE.ReplaceStencilOp,
                stencilZFail: THREE.ReplaceStencilOp,
                stencilZPass: THREE.ReplaceStencilOp,
            });
            const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), capMaterial);
            cap.renderOrder = renderOrder + 0.5;
            cap.frustumCulled = false;
            cap.receiveShadow = true;
            cap.onAfterRender = (renderer) => renderer.clearStencil();
            this.group.add(cap);

            source.geometry.computeBoundingSphere();
            const sphere = source.geometry.boundingSphere;
            const radius = Math.max(1, (sphere?.radius || 1) * source.scale.length() * 2);
            this.entries.push({ source, stencilMeshes, cap, radius, renderOrder: source.renderOrder });
            // The retained surface must paint after every cap so normal depth testing remains authoritative.
            source.renderOrder = 1000;
        });
        this.update(plane);
    }

    update(plane: THREE.Plane) {
        const point = new THREE.Vector3();
        const target = new THREE.Vector3();
        this.entries.forEach((entry) => {
            const { source, stencilMeshes, cap, radius } = entry;
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
            if (material instanceof THREE.MeshStandardMaterial) cap.material.color.copy(material.color);
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
