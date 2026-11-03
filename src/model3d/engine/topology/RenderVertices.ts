import type * as THREE from 'three';

export type MergeVectors = { from: Uint32Array; to: Uint32Array };

export function geometryMergeVectors(geometry: THREE.BufferGeometry): MergeVectors | null {
    const from = geometry.userData.mergeFromVert as Uint32Array | undefined;
    const to = geometry.userData.mergeToVert as Uint32Array | undefined;
    return from && to && from.length > 0 && from.length === to.length ? { from, to } : null;
}

/** Kernel merge vectors are authoritative; render vertices without them remain independent. */
export function canonicalRenderVertices(geometry: THREE.BufferGeometry) {
    const merge = geometryMergeVectors(geometry);
    if (!merge) return null;
    const count = geometry.attributes.position?.count || 0;
    const parents = Array.from({ length: count }, (_, index) => index);
    const find = (value: number): number => {
        let root = value;
        while (parents[root] !== root) root = parents[root];
        while (parents[value] !== value) { const next = parents[value]; parents[value] = root; value = next; }
        return root;
    };
    for (let index = 0; index < merge.from.length; index++) {
        const from = merge.from[index], to = merge.to[index];
        if (from < count && to < count) parents[find(from)] = find(to);
    }
    return parents.map((_, index) => find(index));
}
