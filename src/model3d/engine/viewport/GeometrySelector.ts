import * as THREE from 'three';
import { buildMeshTopology } from '../topology/MeshTopology';
import { domainsEqual } from '../topology/SurfaceDomains';
import { expandTangentEdges, expandTangentFaces } from '../topology/TopologySelection';
import type { BodyTopology, LogicalFace } from '../topology/types';
import { createDocument, createEntity, type ModelEntity, type Point2, type Vec3 } from '../../types';

export type GeometryAnchor = {
    id: string;
    key: string;
    normal: Vec3;
    localNormal: Vec3;
    point: Vec3;
    type: 'face' | 'edge';
    planar: boolean;
    vertices: Vec3[];
    indices: number[];
    profilePoints?: Point2[];
    faceIds?: string[];
    edgeIds?: string[];
    edgeTreatmentId?: string;
    localEdge?: { a: Vec3; b: Vec3; normals: Vec3[] };
    revision?: number;
};
export type Surface = { id: string; vertices: Vec3[]; indices: number[]; point: Vec3; planar: boolean; normal: Vec3; triangles: number[]; face: LogicalFace };

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
        const face = topology.faces.find((item) => item.id === faceId) || topology.faces[0];
        return this.surface(mesh, face);
    }

    createFaceAnchor(hit: THREE.Intersection, entity?: ModelEntity, includeTangent = false): GeometryAnchor {
        const mesh = hit.object as THREE.Mesh;
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
        const point = new THREE.Vector3(...vertices[Math.floor(vertices.length / 2)] || [0, 0, 0]);
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
        };
    }
}
