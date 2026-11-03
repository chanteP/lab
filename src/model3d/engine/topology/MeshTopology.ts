import * as THREE from 'three';
import type { ModelDocument, ModelEntity, Vec3 } from '../../types';
import { canonicalRenderVertices } from './RenderVertices';
import { analyticTriangleDomain } from './SurfaceDomains';
import type { BodyTopology, LogicalEdge, LogicalFace, SurfaceDomain, TopologicalEdge, TopologicalTriangle, TopologicalVertex } from './types';

const WELD_DIGITS = 4;
const PLANE_DISTANCE_TOLERANCE = 1e-3;
const SMOOTH_ANGLE = Math.cos(THREE.MathUtils.degToRad(15));
const EDGE_TANGENT_ANGLE = Math.cos(THREE.MathUtils.degToRad(12));

function pointKey(point: THREE.Vector3) { return point.toArray().map((value) => Number(value.toFixed(WELD_DIGITS))).join(','); }
function edgeKey(a: string, b: string) { return [a, b].sort().join(':'); }
function vector(value: Vec3) { return new THREE.Vector3(...value); }

function boundaryLoops(faceTriangles: TopologicalTriangle[], rawById: Map<string, TopologicalEdge>, triangleEdgeIds: Map<number, string[]>) {
    const faceTriangleIds = new Set(faceTriangles.map((triangle) => triangle.id));
    const directed = new Map<string, string[]>();
    faceTriangles.forEach((triangle) => {
        const edgeIds = triangleEdgeIds.get(triangle.id)!;
        for (let corner = 0; corner < 3; corner++) {
            const a = triangle.vertexIds[corner], b = triangle.vertexIds[(corner + 1) % 3];
            const raw = rawById.get(edgeIds[corner])!;
            const crossesFace = raw.triangleIds.some((id) => !faceTriangleIds.has(id));
            if (crossesFace || raw.triangleIds.length !== 2) directed.set(a, [...directed.get(a) || [], b]);
        }
    });
    const used = new Set<string>();
    const loops: string[][] = [];
    directed.forEach((targets, start) => targets.forEach((next) => {
        const startKey = edgeKey(start, next);
        if (used.has(startKey)) return;
        const loop = [start];
        let current = start, following = next;
        while (true) {
            used.add(edgeKey(current, following));
            loop.push(following);
            current = following;
            if (current === start) break;
            const candidate = (directed.get(current) || []).find((target) => !used.has(edgeKey(current, target)));
            if (!candidate) break;
            following = candidate;
        }
        if (loop.length >= 4 && loop[0] === loop[loop.length - 1]) loops.push(loop);
    }));
    return loops;
}

/** Builds body-local topology. Render vertices are welded only inside this body for adjacency queries. */
export function buildMeshTopology(geometry: THREE.BufferGeometry, bodyId: string, entity: ModelEntity, document: ModelDocument, revision = entity.revision || 0): BodyTopology {
    const positions = geometry.attributes.position;
    if (!positions) return { bodyId, revision, vertices: [], triangles: [], rawEdges: [], faces: [], logicalEdges: [], triangleFaceIds: [], changes: { faces: [], edges: [] } };
    const index = geometry.index;
    const vertices: TopologicalVertex[] = [];
    const vertexByPosition = new Map<string, number>();
    const canonical = canonicalRenderVertices(geometry);
    const triangles: TopologicalTriangle[] = [];
    const triangleCount = Math.floor((index?.count || positions?.count || 0) / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
        const renderVertices = [0, 1, 2].map((offset) => index ? index.getX(triangleIndex * 3 + offset) : triangleIndex * 3 + offset) as [number, number, number];
        const points = renderVertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(positions, vertex));
        const vertexIds = points.map((point, corner) => {
            const key = canonical ? `v${canonical[renderVertices[corner]]}` : pointKey(point);
            let vertexIndex = vertexByPosition.get(key);
            if (vertexIndex === undefined) {
                vertexIndex = vertices.length;
                vertexByPosition.set(key, vertexIndex);
                vertices.push({ id: `v${vertexIndex}`, point: point.toArray(), renderVertices: [] });
            }
            return vertices[vertexIndex].id;
        }) as [string, string, string];
        // Record render correspondence separately; duplicate render vertices remain available for seams and normals.
        renderVertices.forEach((renderVertex, corner) => {
            const vertex = vertices[Number(vertexIds[corner].slice(1))];
            if (!vertex.renderVertices.includes(renderVertex)) vertex.renderVertices.push(renderVertex);
        });
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        if (normal.lengthSq() < 1e-16) continue;
        normal.normalize();
        const center = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
        triangles.push({ id: triangles.length, renderVertices, vertexIds, normal: normal.toArray(), center: center.toArray() });
    }

    const rawEdges: TopologicalEdge[] = [];
    const rawByVertices = new Map<string, TopologicalEdge>();
    const triangleEdgeIds = new Map<number, string[]>();
    triangles.forEach((triangle) => {
        const ids: string[] = [];
        for (let corner = 0; corner < 3; corner++) {
            const a = triangle.vertexIds[corner], b = triangle.vertexIds[(corner + 1) % 3];
            const key = edgeKey(a, b);
            let edge = rawByVertices.get(key);
            if (!edge) {
                edge = { id: `te${rawEdges.length}`, vertexIds: [a, b], triangleIds: [] };
                rawByVertices.set(key, edge);
                rawEdges.push(edge);
            }
            if (!edge.triangleIds.includes(triangle.id)) edge.triangleIds.push(triangle.id);
            ids.push(edge.id);
        }
        triangleEdgeIds.set(triangle.id, ids);
    });

    const vertexPoints = new Map(vertices.map((vertex) => [vertex.id, vector(vertex.point)]));
    const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
    const triangleFaceIndex = Array.from({ length: triangles.length }, () => -1);
    const faceTriangleGroups: number[][] = [];
    const faceDomains: (SurfaceDomain | null)[] = [];
    for (const seed of triangles) {
        if (triangleFaceIndex[seed.id] >= 0) continue;
        const faceIndex = faceTriangleGroups.length;
        const group: number[] = [];
        const queue = [seed.id];
        const analytic = analyticTriangleDomain(seed, vertexPoints, entity, document);
        triangleFaceIndex[seed.id] = faceIndex;
        while (queue.length) {
            const triangleId = queue.shift()!;
            const triangle = triangles[triangleId];
            group.push(triangleId);
            const domain = analyticTriangleDomain(triangle, vertexPoints, entity, document);
            if (analytic && domain && analytic.kind === domain.kind) faceDomains[faceIndex] = analytic;
            triangleEdgeIds.get(triangleId)!.forEach((edgeId) => {
                const edge = rawEdges[Number(edgeId.slice(2))];
                if (edge.triangleIds.length !== 2) return;
                edge.triangleIds.forEach((neighborId) => {
                    if (triangleFaceIndex[neighborId] >= 0) return;
                    const neighbor = triangles[neighborId];
                    const neighborDomain = analyticTriangleDomain(neighbor, vertexPoints, entity, document);
                    let connected = false;
                    if (analytic && neighborDomain) connected = analytic.kind === neighborDomain.kind;
                    else if (!analytic && !neighborDomain) connected = vector(triangle.normal).dot(vector(neighbor.normal)) >= SMOOTH_ANGLE;
                    if (connected) {
                        triangleFaceIndex[neighborId] = faceIndex;
                        queue.push(neighborId);
                    }
                });
            });
        }
        faceTriangleGroups.push(group);
        if (!faceDomains[faceIndex]) faceDomains[faceIndex] = null;
    }

    const rawById = new Map(rawEdges.map((edge) => [edge.id, edge]));
    const faces: LogicalFace[] = faceTriangleGroups.map((triangleIds, faceIndex) => {
        const faceTriangles = triangleIds.map((id) => triangles[id]);
        const first = faceTriangles[0];
        let domain = faceDomains[faceIndex];
        if (!domain) {
            const planar = faceTriangles.every((triangle) => vector(first.normal).dot(vector(triangle.normal)) > 1 - 1e-4
                && Math.abs(vector(first.normal).dot(vector(triangle.center).sub(vector(first.center)))) <= PLANE_DISTANCE_TOLERANCE);
            domain = planar
                ? { kind: 'plane', normal: [...first.normal], offset: vector(first.normal).dot(vector(first.center)), analytic: true }
                : { kind: 'smooth', analytic: false };
        }
        const point = faceTriangles.reduce((sum, triangle) => sum.add(vector(triangle.center)), new THREE.Vector3()).multiplyScalar(1 / faceTriangles.length);
        return {
            id: `f${faceIndex}`, triangleIds, domain, normal: [...first.normal], point: point.toArray(), planar: domain.kind === 'plane',
            boundaryLoops: boundaryLoops(faceTriangles, rawById, triangleEdgeIds), edgeIds: [], adjacentFaceIds: [], sourceIds: [],
        };
    });
    const faceById = new Map(faces.map((face) => [face.id, face]));
    const triangleFaceIds = faces.map((face) => face.id);
    faces.forEach((face, faceIndex) => face.triangleIds.forEach((id) => { triangleFaceIds[id] = faces[faceIndex].id; }));

    const boundaryRawEdges = rawEdges.filter((edge) => {
        const adjacentFaces = new Set(edge.triangleIds.map((id) => triangleFaceIds[id]));
        return adjacentFaces.size > 1 || edge.triangleIds.length !== 2;
    });
    const incident = new Map<string, string[]>();
    boundaryRawEdges.forEach((edge) => edge.vertexIds.forEach((vertex) => incident.set(vertex, [...incident.get(vertex) || [], edge.id])));
    const used = new Set<string>();
    const logicalEdges: LogicalEdge[] = [];
    const direction = (edge: TopologicalEdge, from?: string) => {
        const a = vector(vertexById.get(edge.vertexIds[0])!.point);
        const b = vector(vertexById.get(edge.vertexIds[1])!.point);
        const result = b.sub(a).normalize();
        return from && edge.vertexIds[0] !== from ? result.negate() : result;
    };
    const facePair = (edge: TopologicalEdge) => [...new Set(edge.triangleIds.map((id) => triangleFaceIds[id]))].sort().join('|');
    const canJoin = (edge: TopologicalEdge, next: TopologicalEdge, vertex: string) => facePair(edge) === facePair(next)
        && Math.abs(direction(edge, vertex).dot(direction(next, vertex))) >= EDGE_TANGENT_ANGLE;

    boundaryRawEdges.forEach((start) => {
        if (used.has(start.id)) return;
        used.add(start.id);
        const rawIds = [start.id];
        const chain = [...start.vertexIds];
        const extend = (atStart: boolean) => {
            while (true) {
                const currentVertex = atStart ? chain[0] : chain[chain.length - 1];
                const currentRaw = rawById.get(atStart ? rawIds[0] : rawIds[rawIds.length - 1])!;
                const nextId = (incident.get(currentVertex) || []).find((id) => !used.has(id) && canJoin(currentRaw, rawById.get(id)!, currentVertex));
                if (!nextId) break;
                const next = rawById.get(nextId)!;
                used.add(nextId);
                const other = next.vertexIds[0] === currentVertex ? next.vertexIds[1] : next.vertexIds[0];
                if (atStart) { chain.unshift(other); rawIds.unshift(nextId); }
                else { chain.push(other); rawIds.push(nextId); }
            }
        };
        extend(false);
        extend(true);
        const faceIds = [...new Set(rawIds.flatMap((id) => rawById.get(id)!.triangleIds.map((triangleId) => triangleFaceIds[triangleId])))];
        const kind = rawIds.some((id) => rawById.get(id)!.triangleIds.length > 2) ? 'nonmanifold'
            : rawIds.some((id) => rawById.get(id)!.triangleIds.length < 2) ? 'open'
            : faceIds.length === 2 && Math.abs(vector(faceById.get(faceIds[0])!.normal).dot(vector(faceById.get(faceIds[1])!.normal))) > SMOOTH_ANGLE ? 'feature' : 'sharp';
        const segments = rawIds.map((id) => {
            const edge = rawById.get(id)!;
            return { id: `s${id}`, a: vertexById.get(edge.vertexIds[0])!.point, b: vertexById.get(edge.vertexIds[1])!.point };
        });
        logicalEdges.push({ id: `e${logicalEdges.length}`, vertexIds: [chain[0], chain[chain.length - 1]], faceIds, rawEdgeIds: rawIds, segments, kind, sourceIds: [] });
    });
    logicalEdges.forEach((edge) => edge.faceIds.forEach((faceId) => {
        const face = faceById.get(faceId)!;
        face.edgeIds.push(edge.id);
        edge.faceIds.forEach((neighbor) => { if (neighbor !== faceId && !face.adjacentFaceIds.includes(neighbor)) face.adjacentFaceIds.push(neighbor); });
    }));
    return { bodyId, revision, vertices, triangles, rawEdges, faces, logicalEdges, triangleFaceIds, changes: { faces: [], edges: [] } };
}
