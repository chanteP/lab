import * as THREE from 'three';
import type { BodyTopology } from '../topology/types';

/** Only true logical boundaries become display/picking edges; triangulation and seams stay hidden. */
export function createTopologyEdgeGeometry(topology: BodyTopology) {
    const positions: number[] = [];
    const segmentEdgeIds: string[] = [];
    topology.logicalEdges.forEach((edge) => {
        if (edge.kind === 'open' || edge.kind === 'nonmanifold') return;
        edge.segments.forEach((segment) => {
            positions.push(...segment.a, ...segment.b);
            segmentEdgeIds.push(edge.id);
        });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return { geometry, segmentEdgeIds };
}
