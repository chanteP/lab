import * as THREE from 'three';
import { uid } from '../../utils/id';
import { domainsEqual } from './SurfaceDomains';
import type { BodyTopology, LogicalEdge, LogicalFace, TopologyChange, TopologyChangeKind } from './types';

function faceKey(topology: BodyTopology, face: LogicalFace) {
    const points = face.triangleIds.flatMap((id) => topology.triangles[id].vertexIds).map((id) => topology.vertices.find((vertex) => vertex.id === id)!.point);
    return [...new Set(points.map((point) => point.map((value) => Number(value.toFixed(5))).join(',')))].sort().join('|');
}
function edgeKey(edge: LogicalEdge) {
    return edge.segments.flatMap((segment) => [segment.a, segment.b]).map((point) => point.map((value) => Number(value.toFixed(5))).join(',')).sort().join('|');
}
function faceBounds(topology: BodyTopology, face: LogicalFace) {
    const box = new THREE.Box3();
    face.triangleIds.forEach((id) => topology.triangles[id].vertexIds.forEach((vertexId) => box.expandByPoint(new THREE.Vector3(...topology.vertices.find((vertex) => vertex.id === vertexId)!.point))));
    return box;
}
function edgeBounds(edge: LogicalEdge) {
    const box = new THREE.Box3();
    edge.segments.forEach((segment) => { box.expandByPoint(new THREE.Vector3(...segment.a)); box.expandByPoint(new THREE.Vector3(...segment.b)); });
    return box;
}
function overlaps(a: THREE.Box3, b: THREE.Box3) { return a.clone().expandByScalar(1e-3).intersectsBox(b.clone().expandByScalar(1e-3)); }
function change(previousIds: string[], nextIds: string[], forced?: TopologyChangeKind): TopologyChange {
    let kind = forced;
    if (!kind) kind = !previousIds.length ? 'created' : !nextIds.length ? 'deleted'
        : previousIds.length === 1 && nextIds.length === 1 ? 'unchanged'
        : previousIds.length === 1 ? 'split' : nextIds.length === 1 ? 'merge' : 'ambiguous';
    return { kind, previousIds, nextIds };
}

/** Geometry is matching evidence only. Persistent IDs are retained or issued independently of coordinates. */
export function reconcileTopology(previous: BodyTopology | null | undefined, next: BodyTopology): BodyTopology {
    if (!previous || previous.bodyId !== next.bodyId) return next;
    const initialFaceIds = next.faces.map((face) => face.id);
    const vertexIds = new Map(previous.vertices.map((vertex) => [vertex.point.map((value) => Number(value.toFixed(5))).join(','), vertex.id]));
    const vertexIdMap = new Map<string, string>();
    next.vertices.forEach((vertex) => {
        const initialId = vertex.id;
        vertex.id = vertexIds.get(vertex.point.map((value) => Number(value.toFixed(5))).join(',')) || uid();
        vertexIdMap.set(initialId, vertex.id);
    });
    const remapVertex = (id: string) => vertexIdMap.get(id) || id;
    next.triangles.forEach((triangle) => { triangle.vertexIds = triangle.vertexIds.map(remapVertex) as [string, string, string]; });
    next.rawEdges.forEach((edge) => { edge.vertexIds = edge.vertexIds.map(remapVertex) as [string, string]; });
    next.logicalEdges.forEach((edge) => { edge.vertexIds = edge.vertexIds.map(remapVertex) as [string, string]; });
    next.faces.forEach((face) => { face.boundaryLoops = face.boundaryLoops.map((loop) => loop.map(remapVertex)); });

    const previousUnmatched = new Set(previous.faces.map((face) => face.id));
    const nextUnmatched = new Set(next.faces.map((face) => face.id));
    const previousByKey = new Map(previous.faces.map((face) => [faceKey(previous, face), face]));
    const faceChanges: TopologyChange[] = [];
    next.faces.forEach((face) => {
        const match = previousByKey.get(faceKey(next, face));
        if (!match || !previousUnmatched.has(match.id)) return;
        face.sourceIds = [match.id];
        previousUnmatched.delete(match.id);
        nextUnmatched.delete(face.id);
        faceChanges.push(change([match.id], [face.id], 'unchanged'));
    });

    // Candidate pairs form provenance components. Many-to-many relationships stay explicitly ambiguous.
    const pairs: [string, string][] = [];
    previous.faces.filter((face) => previousUnmatched.has(face.id)).forEach((oldFace) => next.faces.filter((face) => nextUnmatched.has(face.id)).forEach((newFace) => {
        if (oldFace.domain.kind !== 'smooth' && domainsEqual(oldFace.domain, newFace.domain) && overlaps(faceBounds(previous, oldFace), faceBounds(next, newFace))) pairs.push([oldFace.id, newFace.id]);
    }));
    const visited = new Set<string>();
    pairs.forEach(([oldSeed, newSeed]) => {
        if (visited.has(`${oldSeed}|${newSeed}`)) return;
        const oldIds = new Set<string>(), newIds = new Set<string>();
        let growing = true;
        while (growing) {
            growing = false;
            pairs.forEach((pair) => {
                if (visited.has(pair.join('|')) || oldIds.size && !oldIds.has(pair[0]) && !newIds.has(pair[1])) return;
                visited.add(pair.join('|'));
                if (!oldIds.has(pair[0])) { oldIds.add(pair[0]); growing = true; }
                if (!newIds.has(pair[1])) { newIds.add(pair[1]); growing = true; }
            });
        }
        const oldList = [...oldIds], newList = [...newIds];
        const relation = change(oldList, newList);
        oldList.forEach((id) => previousUnmatched.delete(id));
        relation.nextIds.forEach((id) => {
            const face = next.faces.find((item) => item.id === id)!;
            face.sourceIds = oldList;
            nextUnmatched.delete(id);
        });
        faceChanges.push(relation);
    });
    previousUnmatched.forEach((id) => faceChanges.push(change([id], [], 'deleted')));
    nextUnmatched.forEach((id) => faceChanges.push(change([], [id], 'created')));

    const usedFaceIds = new Set<string>();
    const faceIdMap = new Map<string, string>();
    next.faces.forEach((face, index) => {
        const oneToOne = face.sourceIds.length === 1 && faceChanges.some((item) => item.kind === 'unchanged' && item.nextIds.includes(face.id));
        let id = oneToOne ? face.sourceIds[0] : face.id;
        if (!oneToOne && (previous.faces.some((old) => old.id === id) || usedFaceIds.has(id))) id = uid();
        face.id = id;
        usedFaceIds.add(id);
        faceIdMap.set(initialFaceIds[index], id);
    });
    faceChanges.forEach((item) => { item.nextIds = item.nextIds.map((id) => faceIdMap.get(id) || id); });
    next.changes.faces = faceChanges;
    next.triangleFaceIds = next.triangles.map((triangle) => {
        const faceIndex = next.faces.findIndex((face) => face.triangleIds.includes(triangle.id));
        return faceIndex >= 0 ? next.faces[faceIndex].id : '';
    });
    next.logicalEdges.forEach((edge) => { edge.faceIds = edge.faceIds.map((id) => faceIdMap.get(id) || id); });
    next.faces.forEach((face) => {
        face.edgeIds = next.logicalEdges.filter((edge) => edge.faceIds.includes(face.id)).map((edge) => edge.id);
        face.adjacentFaceIds = next.logicalEdges.filter((edge) => edge.faceIds.includes(face.id)).flatMap((edge) => edge.faceIds).filter((id, index, ids) => id !== face.id && ids.indexOf(id) === index);
    });

    const previousEdges = new Map(previous.logicalEdges.map((edge) => [edgeKey(edge), edge]));
    const edgeChanges: TopologyChange[] = [];
    next.logicalEdges.forEach((edge) => {
        const match = previousEdges.get(edgeKey(edge));
        if (match) {
            edge.id = match.id;
            edge.sourceIds = [match.id];
            edgeChanges.push(change([match.id], [edge.id], 'unchanged'));
        } else {
            const nextFaceSources = new Set(next.faces.filter((face) => edge.faceIds.includes(face.id)).flatMap((face) => face.sourceIds));
            const candidates = previous.logicalEdges.filter((old) => old.faceIds.some((id) => nextFaceSources.has(id)) && overlaps(edgeBounds(old), edgeBounds(edge)));
            edge.sourceIds = candidates.length === 1 ? [candidates[0].id] : [];
            if (previous.logicalEdges.some((old) => old.id === edge.id)) edge.id = uid();
            edgeChanges.push(change(edge.sourceIds, [edge.id], edge.sourceIds.length ? 'split' : 'created'));
        }
    });
    previous.logicalEdges.filter((edge) => !next.logicalEdges.some((item) => item.sourceIds.includes(edge.id))).forEach((edge) => edgeChanges.push(change([edge.id], [], 'deleted')));
    next.changes.edges = edgeChanges;
    return next;
}
