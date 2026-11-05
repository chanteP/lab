import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { createDocument, createEntity, type EdgeTreatment, type ModelDocument, type ModelEntity, type Vec3, type VertexTreatment } from '../../types';
import type { GeometryAnchor } from '../viewport/GeometrySelector';
import { buildMeshTopology } from '../topology/MeshTopology';
import { evaluateBoolean, evaluatePlaneChamfer, evaluateSphereUnion } from './ManifoldKernel';
import { applyEdgeTreatments } from './EdgeTreatments';

function cornerTools(treatment: VertexTreatment) {
    if (treatment.size <= 0 || treatment.vertex.normals.length < 3) return null;
    const corner = new THREE.Vector3(...treatment.vertex.point);
    const normals = treatment.vertex.normals.slice(0, 3).map((normal) => new THREE.Vector3(...normal).normalize());
    // Coplanar cutters can be classified as internal cavities, leaving the original outer faces in front of the result.
    // Extend only the outer tip to create a reliable intersection without changing the stored modeling coordinates.
    const outer = corner.clone();
    normals.forEach((normal) => outer.addScaledVector(normal, Math.min(0.1, treatment.size * 0.05)));
    const points = [outer, ...normals.map((_, index) => treatment.type === 'chamfer'
        ? corner.clone().addScaledVector(normals[index], -treatment.size)
        : normals.reduce((point, normal, other) => other === index ? point : point.addScaledVector(normal, -treatment.size), corner.clone()))];
    const tetrahedron = new ConvexGeometry(points);
    if (treatment.type === 'chamfer') return { tetrahedron, center: null };
    const center = normals.reduce((sum, normal) => sum.addScaledVector(normal, -treatment.size), corner.clone());
    return { tetrahedron, center };
}

function incidentFilletEdges(base: THREE.BufferGeometry, treatment: VertexTreatment, sourceEntity?: ModelEntity, sourceDocument?: ModelDocument): EdgeTreatment[] | null {
    const entity = sourceEntity || createEntity('box', 'corner');
    const document = sourceDocument || createDocument();
    const topology = buildMeshTopology(base, entity.id, entity, document);
    const corner = new THREE.Vector3(...treatment.vertex.point);
    const edges = topology.logicalEdges.filter((edge) => edge.faceIds.length === 2 && edge.points.length >= 2 && edge.points.some((point) => new THREE.Vector3(...point).distanceTo(corner) < 1e-4));
    if (edges.length !== 3) return null;
    const result = edges.map((edge, index) => {
        const cornerPoint = edge.points.find((point) => new THREE.Vector3(...point).distanceTo(corner) < 1e-4)!;
        const otherPoint = edge.points.find((point) => point !== cornerPoint)!;
        const normals = edge.faceIds.map((id) => topology.faces.find((face) => face.id === id)?.normal).filter(Boolean) as Vec3[];
        if (normals.length !== 2) return null;
        return {
            id: `${treatment.id}:edge:${index}`, type: 'fillet' as const, size: treatment.size,
            edge: { a: [...otherPoint] as Vec3, b: [...cornerPoint] as Vec3, normals },
        };
    });
    let typed = result.every(Boolean) ? result as EdgeTreatment[] : null;
    if (!typed) return null;
    return typed.sort((a, b) => [...a.edge.a, ...a.edge.b].join(',').localeCompare([...b.edge.a, ...b.edge.b].join(',')));
}


/** Vertex treatments are replayed after all base face and edge edits. */
export function applyVertexTreatments(base: THREE.BufferGeometry, treatments: VertexTreatment[] = [], sourceEntity?: ModelEntity, sourceDocument?: ModelDocument) {
    let result = base;
    treatments.filter((treatment) => treatment.size > 0).forEach((treatment) => {
        const tools = cornerTools(treatment);
        if (!tools) return;
        const { tetrahedron, center } = tools;
        try {
            const corner = new THREE.Vector3(...treatment.vertex.point);
            const normals = treatment.vertex.normals.slice(0, 3).map((normal) => new THREE.Vector3(...normal).normalize());
            const tangentPoints = treatment.vertex.normals.slice(0, 3).map((_, index) => treatment.type === 'chamfer'
                ? corner.clone().addScaledVector(normals[index], -treatment.size)
                : normals.reduce((point, normal, other) => other === index ? point : point.addScaledVector(normal, -treatment.size), corner.clone()));
            const planeNormal = tangentPoints[1].clone().sub(tangentPoints[0]).cross(tangentPoints[2].clone().sub(tangentPoints[0])).normalize();
            if (planeNormal.dot(corner.clone().sub(tangentPoints[0])) < 0) planeNormal.negate();
            const planeOffset = planeNormal.dot(tangentPoints[0]);
            const chamfered = evaluatePlaneChamfer(result, corner.toArray(), treatment.size, planeNormal.toArray(), planeOffset);
            let next: THREE.BufferGeometry;
            if (center) {
                const incident = incidentFilletEdges(result, treatment, sourceEntity, sourceDocument);
                if (incident) {
                    // Rolling-ball fillet: cylindrical blends on all incident edges plus the spherical corner patch.
                    const roundedEdges = applyEdgeTreatments(result, incident);
                    next = evaluateSphereUnion(roundedEdges, treatment.size, center.toArray());
                    roundedEdges.dispose();
                } else {
                    const chamfered = evaluatePlaneChamfer(result, corner.toArray(), treatment.size, planeNormal.toArray(), planeOffset);
                    if (chamfered) {
                        next = evaluateSphereUnion(chamfered, treatment.size, center.toArray());
                        chamfered.dispose();
                    } else {
                        const fallback = evaluateBoolean(result, tetrahedron, 'subtract');
                        next = evaluateSphereUnion(fallback, treatment.size, center.toArray());
                        fallback.dispose();
                    }
                }
            } else if (chamfered) {
                next = chamfered;
            } else {
                next = evaluateBoolean(result, tetrahedron, 'subtract');
            }
            if (result !== base) result.dispose();
            result = next;
        } finally {
            tetrahedron.dispose();
        }
    });
    return result;
}


export function rebindVertexTreatments(base: THREE.BufferGeometry, treatments: VertexTreatment[], entity: ModelEntity, document: ModelDocument) {
    if (!treatments.length) return treatments;
    const topology = buildMeshTopology(base, entity.id, entity, document);
    return treatments.map((treatment) => {
        const candidates = topology.vertices.flatMap((vertex) => {
            const faceIds = new Set(topology.triangles.filter((triangle) => triangle.vertexIds.includes(vertex.id)).map((triangle) => topology.triangleFaceIds[triangle.id]));
            const normals = [...faceIds].map((id) => topology.faces.find((face) => face.id === id)?.normal).filter(Boolean) as Vec3[];
            const adjacent = treatment.vertex.normals.every((wanted) => normals.some((normal) => new THREE.Vector3(...normal).dot(new THREE.Vector3(...wanted)) > 0.999));
            if (!adjacent) return [];
            return [{ vertex, normals, distance: new THREE.Vector3(...vertex.point).distanceTo(new THREE.Vector3(...treatment.vertex.point)) }];
        }).sort((a, b) => a.distance - b.distance);
        const match = candidates[0];
        return match ? { ...treatment, vertex: { point: [...match.vertex.point] as Vec3, normals: match.normals } } : treatment;
    });
}

export function resolveVertexTreatment(entity: ModelEntity, anchor: GeometryAnchor) {
    if (!anchor.localVertex) return null;
    if (anchor.vertexTreatmentId) {
        const exact = entity.vertexTreatments?.find((item) => item.id === anchor.vertexTreatmentId);
        if (exact) return exact;
    }
    const point = new THREE.Vector3(...anchor.localVertex.point);
    return entity.vertexTreatments?.find((treatment) => point.distanceTo(new THREE.Vector3(...treatment.vertex.point)) < 0.05)
        || entity.vertexTreatments?.find((treatment) => treatment.vertex.normals.every((wanted) => anchor.localVertex!.normals.some((normal) => new THREE.Vector3(...normal).dot(new THREE.Vector3(...wanted)) > 0.999))) || null;
}

export function vertexTreatmentFromAnchor(anchor: GeometryAnchor, id: string): VertexTreatment | null {
    if (!anchor.localVertex || anchor.localVertex.normals.length < 3) return null;
    return { id, type: 'fillet', size: 0, vertex: { point: [...anchor.localVertex.point], normals: anchor.localVertex.normals.slice(0, 3).map((normal) => [...normal] as Vec3) } };
}
