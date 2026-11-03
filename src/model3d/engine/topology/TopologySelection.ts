import * as THREE from 'three';
import { domainsEqual } from './SurfaceDomains';
import type { BodyTopology, LogicalEdge, LogicalFace } from './types';

function tangentAt(edge: LogicalEdge, atStart: boolean) {
    if (edge.points.length < 2) return new THREE.Vector3();
    const a = atStart ? edge.points[1] : edge.points[edge.points.length - 2];
    const b = atStart ? edge.points[0] : edge.points[edge.points.length - 1];
    return new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
}

export function expandTangentFaces(topology: BodyTopology, seeds: LogicalFace[]) {
    const selected = new Map(seeds.map((face) => [face.id, face]));
    const queue = [...seeds];
    while (queue.length) {
        const face = queue.shift()!;
        face.adjacentFaceIds.forEach((id) => {
            if (selected.has(id)) return;
            const neighbor = topology.faces.find((item) => item.id === id);
            if (!neighbor || domainsEqual(face.domain, neighbor.domain)) return;
            const shared = topology.logicalEdges.find((edge) => edge.faceIds.includes(face.id) && edge.faceIds.includes(id));
            if (shared?.kind !== 'feature') return;
            selected.set(id, neighbor);
            queue.push(neighbor);
        });
    }
    return [...selected.values()];
}

export function expandTangentEdges(topology: BodyTopology, seeds: LogicalEdge[]) {
    const selected = new Map(seeds.map((edge) => [edge.id, edge]));
    const queue = seeds.map((edge) => ({ edge, atEnd: true }));
    while (queue.length) {
        const { edge, atEnd } = queue.shift()!;
        const vertexId = edge.vertexIds[atEnd ? 1 : 0];
        if (edge.vertexIds[0] === edge.vertexIds[1]) continue;
        const candidates = topology.logicalEdges.filter((candidate) => candidate.id !== edge.id && !selected.has(candidate.id)
            && candidate.vertexIds.includes(vertexId) && candidate.faceIds.slice().sort().join('|') === edge.faceIds.slice().sort().join('|')
            && Math.abs(tangentAt(edge, !atEnd).dot(tangentAt(candidate, candidate.vertexIds[0] !== vertexId))) > Math.cos(THREE.MathUtils.degToRad(12)));
        if (candidates.length !== 1) continue;
        const next = candidates[0];
        selected.set(next.id, next);
        queue.push({ edge: next, atEnd: next.vertexIds[0] === vertexId });
    }
    return [...selected.values()];
}
