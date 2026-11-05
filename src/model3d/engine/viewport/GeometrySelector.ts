import * as THREE from 'three';
import { buildMeshTopology } from '../topology/MeshTopology';
import { domainsEqual } from '../topology/SurfaceDomains';
import { expandTangentEdges, expandTangentFaces } from '../topology/TopologySelection';
import type { BodyTopology, LogicalFace } from '../topology/types';
import { createDocument, createEntity, type ModelEntity, type Point2, type SelectionKind, type Vec3 } from '../../types';

export type GeometryAnchor = {
    id: string;
    key: string;
    normal: Vec3;
    localNormal: Vec3;
    point: Vec3;
    type: 'face' | 'edge' | 'vertex';
    planar: boolean;
    vertices: Vec3[];
    indices: number[];
    profilePoints?: Point2[];
    faceIds?: string[];
    edgeIds?: string[];
    edgeTreatmentId?: string;
    localEdge?: { a: Vec3; b: Vec3; normals: Vec3[] };
    vertexId?: string;
    vertexTreatmentId?: string;
    localVertex?: { point: Vec3; normals: Vec3[] };
    feedbackVertices?: Vec3[];
    feedbackIndices?: number[];
    /** Picked from the visible treated topology rather than the invisible base proxy. */
    finalTopology?: boolean;
    /** A generated chamfer/fillet surface edits its treatment through its own face feedback. */
    generatedTreatment?: boolean;
    revision?: number;
};
export type Surface = { id: string; vertices: Vec3[]; indices: number[]; point: Vec3; planar: boolean; normal: Vec3; triangles: number[]; face: LogicalFace };
export type SelectionStats = { objects: number; faces: number; triangles: number; size: Vec3 };

/** Measures world-axis dimensions and only the triangles belonging to the current body/face selection. */
export function measureSelectionStats(objects: THREE.Mesh[], selectedIds: string[], kind: SelectionKind, anchor: GeometryAnchor | null): SelectionStats | null {
    if (kind === 'face' && anchor?.type === 'face' && selectedIds.includes(anchor.id)) {
        const box = new THREE.Box3().setFromPoints(anchor.vertices.map((point) => new THREE.Vector3(...point)));
        return { objects: 0, faces: 1, triangles: anchor.indices.length / 3, size: box.isEmpty() ? [0, 0, 0] : box.getSize(new THREE.Vector3()).toArray() };
    }
    const selected = objects.filter((object) => selectedIds.includes(object.userData.entityId) && !object.userData.selectionProxy);
    if (!selected.length) return null;
    const box = new THREE.Box3();
    let triangles = 0;
    selected.forEach((object) => {
        object.updateWorldMatrix(true, true);
        box.expandByObject(object);
        triangles += (object.geometry.index?.count || object.geometry.attributes.position?.count || 0) / 3;
    });
    return { objects: selected.length, faces: 0, triangles: Math.round(triangles), size: box.getSize(new THREE.Vector3()).toArray() };
}

/** Resolves raycast hits to logical topology. Triangle and display-segment indices never become persistent IDs. */
export class GeometrySelector {
    private surfaceCache = new WeakMap<BodyTopology, Map<string, Surface>>();
    clear() { this.surfaceCache = new WeakMap(); }

    private topology(mesh: THREE.Mesh): BodyTopology {
        const existing = mesh.userData.topology as BodyTopology | undefined;
        if (existing) return existing;
        const entity = createEntity('box', mesh.userData.entityId || mesh.uuid);
        const topology = buildMeshTopology(mesh.geometry, entity.id, entity, createDocument());
        mesh.userData.topology = topology;
        return topology;
    }

    private surface(mesh: THREE.Mesh, face: LogicalFace): Surface {
        const topology = this.topology(mesh);
        const cached = this.surfaceCache.get(topology);
        if (cached?.has(face.id)) return cached.get(face.id)!;
        mesh.updateWorldMatrix(true, false);
        const vertices: Vec3[] = [];
        const indices: number[] = [];
        face.triangleIds.forEach((triangleId) => {
            topology.triangles[triangleId].renderVertices.forEach((renderVertex) => {
                vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, renderVertex).applyMatrix4(mesh.matrixWorld).toArray());
                indices.push(indices.length);
            });
        });
        const surface = { id: face.id, vertices, indices, point: face.point, planar: face.planar, normal: face.normal, triangles: face.triangleIds, face };
        const cache = this.surfaceCache.get(topology) || new Map<string, Surface>();
        cache.set(face.id, surface);
        this.surfaceCache.set(topology, cache);
        return surface;
    }

    collectSurface(mesh: THREE.Mesh, hit: THREE.Intersection): Surface {
        const topology = this.topology(mesh);
        const triangleId = hit.faceIndex ?? 0;
        const faceId = topology.triangleFaceIds[triangleId];
        let face = topology.faces.find((item) => item.id === faceId) || topology.faces[0];
        if (!face) {
            // A stale triangle-to-face mapping must not turn a pointer selection into a runtime failure.
            const triangle = topology.triangles[triangleId];
            const normal = triangle?.normal || [0, 1, 0];
            const center = triangle?.center || [0, 0, 0];
            face = {
                id: `__triangle_${triangleId}`, triangleIds: triangle ? [triangleId] : [],
                domain: { kind: 'plane', normal: [...normal], offset: new THREE.Vector3(...normal).dot(new THREE.Vector3(...center)), analytic: true },
                normal: [...normal], point: [...center], planar: true, boundaryLoops: [], edgeIds: [], adjacentFaceIds: [], sourceIds: [],
            };
        }
        return this.surface(mesh, face);
    }

    private createTreatedFaceAnchor(hit: THREE.Intersection, entity: ModelEntity): GeometryAnchor | null {
        const mesh = hit.object as THREE.Mesh;
        const baseMesh = mesh.userData.baseMesh as THREE.Mesh | undefined;
        const baseTopology = baseMesh?.userData.topology as BodyTopology | undefined;
        if (!baseMesh || !baseTopology) return null;
        const finalSurface = this.collectSurface(mesh, hit);
        const surfacePoint = new THREE.Vector3(...finalSurface.point).applyMatrix4(mesh.matrixWorld);
        const surfaceNormal = new THREE.Vector3(...finalSurface.normal).normalize();
        const triangle = this.topology(mesh).triangles[hit.faceIndex ?? 0];
        const anchorNormal = finalSurface.planar ? finalSurface.normal : triangle?.normal || finalSurface.normal;
        const anchorPoint = finalSurface.planar ? finalSurface.point : triangle?.center || finalSurface.point;
        const point = new THREE.Vector3(...anchorPoint).applyMatrix4(mesh.matrixWorld);
        const normal = new THREE.Vector3(...anchorNormal).normalize();
        const localPoint = new THREE.Vector3(...anchorPoint);
        const feedback = {
            feedbackVertices: finalSurface.vertices,
            feedbackIndices: finalSurface.indices,
            finalTopology: true,
            generatedTreatment: true,
        };

        // Generated corner surfaces own their hot zone and normal; the source corner only supplies the edit ID.
        for (const treatment of entity.vertexTreatments || []) {
            const adjacent = treatment.type === 'fillet' && !finalSurface.planar ? false : treatment.vertex.normals.some((wanted) => Math.abs(surfaceNormal.dot(new THREE.Vector3(...wanted).normalize())) > 0.995);
            const corner = new THREE.Vector3(...treatment.vertex.point);
            if (adjacent || localPoint.distanceTo(corner) > treatment.size * 2.5 + 0.25) continue;
            return {
                id: entity.id, key: `${entity.id}:vertex:${treatment.id}`, normal: normal.clone().transformDirection(mesh.matrixWorld).toArray(),
                localNormal: [...anchorNormal], point: point.toArray(), type: 'vertex', planar: false,
                vertices: finalSurface.vertices, indices: finalSurface.indices, vertexTreatmentId: treatment.id,
                localVertex: JSON.parse(JSON.stringify(treatment.vertex)), revision: baseTopology.revision, ...feedback,
            };
        }

        // Generated edge surfaces follow the same rule: face feedback and a face-normal arrow, never source-edge feedback.
        for (const treatment of entity.edgeTreatments || []) {
            const adjacent = treatment.type === 'fillet' && !finalSurface.planar ? false : treatment.edge.normals.some((wanted) => Math.abs(surfaceNormal.dot(new THREE.Vector3(...wanted).normalize())) > 0.995);
            if (adjacent) continue;
            const a = new THREE.Vector3(...treatment.edge.a), b = new THREE.Vector3(...treatment.edge.b);
            const direction = b.clone().sub(a), lengthSquared = direction.lengthSq();
            const t = lengthSquared ? THREE.MathUtils.clamp(localPoint.clone().sub(a).dot(direction) / lengthSquared, 0, 1) : 0;
            if (localPoint.distanceTo(a.clone().addScaledVector(direction, t)) > treatment.size * 1.5 + 0.25) continue;
            return {
                id: entity.id, key: `${entity.id}:edge:${treatment.id}`, normal: normal.clone().transformDirection(mesh.matrixWorld).toArray(),
                localNormal: [...anchorNormal], point: point.toArray(), type: 'edge', planar: false,
                vertices: finalSurface.vertices, indices: finalSurface.indices, edgeTreatmentId: treatment.id,
                localEdge: JSON.parse(JSON.stringify(treatment.edge)), revision: baseTopology.revision, ...feedback,
            };
        }

        // Remaining base faces retain their base geometry for Face Extrude, but feedback uses only the trimmed final region.
        const candidates = baseTopology.faces.flatMap((face) => {
            if (!face.planar || surfaceNormal.dot(new THREE.Vector3(...face.normal)) < 0.995) return [];
            const center = new THREE.Vector3(...face.point).applyMatrix4(baseMesh.matrixWorld);
            return [{ face, distance: center.distanceTo(surfacePoint) }];
        }).sort((a, b) => a.distance - b.distance);
        const face = candidates[0]?.face;
        if (!face) return null;
        const baseSurface = this.surface(baseMesh, face);
        return {
            id: entity.id, key: `${entity.id}:face:${face.id}`, normal: new THREE.Vector3(...face.normal).transformDirection(baseMesh.matrixWorld).toArray(),
            localNormal: [...face.normal], point: new THREE.Vector3(...face.point).applyMatrix4(baseMesh.matrixWorld).toArray(), type: 'face', planar: true,
            vertices: baseSurface.vertices, indices: baseSurface.indices, faceIds: [face.id], revision: baseTopology.revision,
            feedbackVertices: finalSurface.vertices, feedbackIndices: finalSurface.indices, finalTopology: true,
        };
    }

    createFaceAnchor(hit: THREE.Intersection, entity?: ModelEntity, includeTangent = false): GeometryAnchor {
        const mesh = hit.object as THREE.Mesh;
        if (entity && !mesh.userData.selectionProxy && [...(entity.edgeTreatments || []), ...(entity.vertexTreatments || [])].some((treatment) => treatment.size > 0)) {
            const treated = this.createTreatedFaceAnchor(hit, entity);
            if (treated) return treated;
        }
        const topology = this.topology(mesh);
        const selected = this.collectSurface(mesh, hit);
        const seedFace = selected.face;
        const faces = includeTangent ? expandTangentFaces(topology, [seedFace]) : [seedFace];
        const surfaces = faces.map((face) => this.surface(mesh, face));
        const vertices = surfaces.flatMap((surface) => surface.vertices);
        const indices: number[] = [];
        surfaces.forEach((surface) => {
            const offset = indices.length;
            indices.push(...surface.indices.map((index) => index + offset));
        });
        const localNormal = (hit.face?.normal || new THREE.Vector3(...seedFace.normal)).clone();
        const worldTriangle = hit.face ? [hit.face.a, hit.face.b, hit.face.c].map((index) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld)) : [];
        const normal = worldTriangle.length === 3
            ? worldTriangle[1].clone().sub(worldTriangle[0]).cross(worldTriangle[2].clone().sub(worldTriangle[0])).normalize()
            : localNormal.clone().transformDirection(mesh.matrixWorld);
        const samePlane = faces.every((face) => face.planar && domainsEqual(face.domain, seedFace.domain));
        const point = new THREE.Vector3(...selected.point).applyMatrix4(mesh.matrixWorld);
        return {
            id: mesh.userData.entityId || entity?.id || '', key: `${mesh.userData.entityId}:face:${faces.map((face) => face.id).sort().join(',')}`,
            normal: normal.toArray(), localNormal: localNormal.toArray(), point: point.toArray(), type: 'face', planar: samePlane,
            vertices, indices, faceIds: faces.map((face) => face.id), revision: topology.revision,
        };
    }

    createVertexAnchor(hit: THREE.Intersection & { vertexId?: string }): GeometryAnchor | null {
        const mesh = hit.object as THREE.Mesh;
        const topology = this.topology(mesh);
        const vertex = topology.vertices.find((item) => item.id === hit.vertexId);
        if (!vertex) return null;
        const faceIds = new Set(topology.triangles.filter((triangle) => triangle.vertexIds.includes(vertex.id)).map((triangle) => topology.triangleFaceIds[triangle.id]));
        const normals = [...faceIds].map((id) => topology.faces.find((face) => face.id === id)?.normal).filter(Boolean) as Vec3[];
        if (normals.length < 3) return null;
        mesh.updateWorldMatrix(true, false);
        const point = new THREE.Vector3(...vertex.point).applyMatrix4(mesh.matrixWorld);
        const localNormal = normals.reduce((sum, normal) => sum.add(new THREE.Vector3(...normal)), new THREE.Vector3()).normalize();
        return {
            id: mesh.userData.entityId || '', key: `${mesh.userData.entityId}:vertex:${vertex.id}`,
            normal: localNormal.clone().transformDirection(mesh.matrixWorld).toArray(), localNormal: localNormal.toArray(),
            point: point.toArray(), type: 'vertex', planar: false, vertices: [point.toArray()], indices: [0],
            vertexId: vertex.id, localVertex: { point: [...vertex.point], normals }, revision: topology.revision,
            finalTopology: !!mesh.userData.edgeTreated,
        };
    }

    createEdgeAnchor(hit: THREE.Intersection, includeTangent = false): GeometryAnchor {
        const line = hit.object as THREE.LineSegments;
        const segmentIndex = Math.floor((hit.index || 0) / 2);
        let owner: THREE.Object3D | null = line;
        while (owner && !owner.userData.entityId) owner = owner.parent;
        const mesh = owner as THREE.Mesh;
        const topology = this.topology(mesh);
        const edgeId = line.userData.segmentEdgeIds?.[segmentIndex] || line.userData.logicalEdgeId;
        const seed = topology.logicalEdges.find((edge) => edge.id === edgeId) || topology.logicalEdges[0];
        const edges = expandTangentEdges(topology, [seed]);
        const selectedEdges = includeTangent ? edges : [seed];
        line.updateWorldMatrix(true, false);
        const vertices = selectedEdges.flatMap((edge) => edge.points)
            .map((point) => new THREE.Vector3(...point).applyMatrix4(line.matrixWorld).toArray() as Vec3);
        const point = hit.point?.clone() || new THREE.Vector3(...vertices[Math.floor(vertices.length / 2)] || [0, 0, 0]);
        const localNormal = seed.faceIds.length === 2 ? seed.faceIds.reduce((sum, id) => {
            const face = topology.faces.find((item) => item.id === id);
            return face ? sum.add(new THREE.Vector3(...face.normal)) : sum;
        }, new THREE.Vector3()).normalize() : new THREE.Vector3(0, 1, 0);
        const normal = localNormal.clone().transformDirection(mesh.matrixWorld);
        const localEdge = seed.points.length >= 2 ? {
            a: [...seed.points[0]] as Vec3,
            b: [...seed.points[seed.points.length - 1]] as Vec3,
            normals: seed.faceIds.map((id) => topology.faces.find((face) => face.id === id)?.normal).filter(Boolean) as Vec3[],
        } : undefined;
        return {
            id: mesh.userData.entityId || '', key: `${mesh.userData.entityId}:edge:${selectedEdges.map((edge) => edge.id).sort().join(',')}`,
            normal: normal.toArray(), localNormal: localNormal.toArray(), point: point.toArray(), type: 'edge', planar: false,
            vertices, indices: vertices.map((_, index) => index), edgeIds: selectedEdges.map((edge) => edge.id), localEdge, revision: topology.revision,
            finalTopology: !!mesh.userData.edgeTreated,
        };
    }
}
