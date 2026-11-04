import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { ModelDocument, ModelEntity, Vec3, VertexTreatment } from '../../types';
import type { GeometryAnchor } from '../viewport/GeometrySelector';
import { buildMeshTopology } from '../topology/MeshTopology';
import { evaluateBoolean } from './ManifoldKernel';

function cornerCutter(treatment: VertexTreatment) {
    if (treatment.size <= 0 || treatment.vertex.normals.length < 3) return null;
    const corner = new THREE.Vector3(...treatment.vertex.point);
    const normals = treatment.vertex.normals.slice(0, 3).map((normal) => new THREE.Vector3(...normal).normalize());
    const points = [corner, ...normals.map((_, index) => treatment.type === 'chamfer'
        ? corner.clone().addScaledVector(normals[index], -treatment.size)
        : normals.reduce((point, normal, other) => other === index ? point : point.addScaledVector(normal, -treatment.size), corner.clone()))];
    const tetrahedron = new ConvexGeometry(points);
    if (treatment.type === 'chamfer') return tetrahedron;
    const center = normals.reduce((sum, normal) => sum.addScaledVector(normal, -treatment.size), corner.clone());
    const sphere = new THREE.SphereGeometry(treatment.size, 32, 20);
    sphere.translate(...center.toArray());
    const result = evaluateBoolean(tetrahedron, sphere, 'subtract');
    tetrahedron.dispose(); sphere.dispose();
    return result;
}

/** Vertex treatments are replayed after all base face and edge edits. */
export function applyVertexTreatments(base: THREE.BufferGeometry, treatments: VertexTreatment[] = []) {
    let result = base;
    treatments.filter((treatment) => treatment.size > 0).forEach((treatment) => {
        const tool = cornerCutter(treatment);
        if (!tool) return;
        try {
            const next = evaluateBoolean(result, tool, 'subtract');
            if (result !== base) result.dispose();
            result = next;
        } finally { tool.dispose(); }
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
    return { id, type: 'fillet', size: 0, vertex: { point: [...anchor.localVertex.point], normals: anchor.localVertex.normals.slice(0, 3).map((normal) => [...normal] as Vec3[]) } };
}
