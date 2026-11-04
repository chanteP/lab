import * as THREE from 'three';
import type { ModelDocument, OperationState } from '../../types';
import { buildBooleanRegions } from '../geometry';
import { clearGroup } from './renderUtils';
import type { OverlayController } from './OverlayController';

export type BooleanPreviewState = Extract<OperationState, { type: 'boolean' }>;
const PLUS_COLOR = '#7c3aed';
const MINUS_COLOR = '#a92f3d';

/** Disjoint Venn-region preview only; no result or source model is added to the document. */
export class BooleanPreviewController {
    readonly group = new THREE.Group();
    private originals: { object: THREE.Object3D; visible: boolean }[] = [];
    private hoverKey: string | null = null;

    constructor(private readonly overlay: OverlayController) {}

    reset() {
        this.originals = [];
        this.hoverKey = null;
        clearGroup(this.group);
        this.overlay.clear('boolean-button:');
    }

    restore() {
        this.originals.forEach(({ object, visible }) => object.visible = visible);
        this.reset();
    }

    apply(model: THREE.Group, document: ModelDocument, state: BooleanPreviewState) {
        this.restore();
        model.children.forEach((object) => {
            this.originals.push({ object, visible: object.visible });
            object.visible = false;
        });

        buildBooleanRegions(document, state.operandIds).forEach((region) => {
            const sign = state.regionSigns[region.key] || -1;
            const color = sign === 1 ? PLUS_COLOR : MINUS_COLOR;
            const mesh = new THREE.Mesh(region.geometry, new THREE.MeshStandardMaterial({
                color, transparent: true, opacity: sign === 1 ? 0.36 : 0.2,
                depthWrite: false, roughness: 1, metalness: 0, emissive: '#000000', emissiveIntensity: 0,
            }));
            mesh.userData.regionKey = region.key;
            mesh.renderOrder = 10;
            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(region.geometry, 25),
                new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }),
            );
            edges.renderOrder = 11;
            mesh.add(edges);
            this.group.add(mesh);
            this.overlay.set({ id: `boolean-button:${region.key}`, kind: 'booleanButton', entityId: region.key, sign, position: region.center });
        });
    }

    setHover(key: string | null) { this.hoverKey = key; }

    updateAnimation(time: number) {
        this.group.children.forEach((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const material = object.material as THREE.MeshStandardMaterial;
            const active = object.userData.regionKey === this.hoverKey;
            material.emissive.set(active ? PLUS_COLOR : '#000000');
            material.emissiveIntensity = active ? 0.1 + (Math.sin(time * 5) + 1) * 0.06 : 0;
        });
    }

    dispose() { this.reset(); }
}
