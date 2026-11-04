import * as THREE from 'three';
import type { EdgeTreatment, ModelEntity, Vec3 } from '../../types';
import type { GeometryAnchor } from '../viewport/GeometrySelector';
import { evaluateBoolean } from './ManifoldKernel';

function cutter(treatment: EdgeTreatment) {
    const a = new THREE.Vector3(...treatment.edge.a), b = new THREE.Vector3(...treatment.edge.b);
    const tangent = b.clone().sub(a);
    const length = tangent.length();
    if (length < 1e-7 || treatment.edge.normals.length < 2 || treatment.size <= 0) return null;
    tangent.normalize();
    let u = new THREE.Vector3(...treatment.edge.normals[0]).normalize();
    let v = new THREE.Vector3(...treatment.edge.normals[1]).normalize();
    if (Math.abs(u.dot(v)) > 0.999) return null;
    if (u.clone().cross(v).dot(tangent) < 0) [u, v] = [v, u];
    const w = u.clone().cross(v).normalize();
    const size = treatment.size;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-size, 0);
    if (treatment.type === 'fillet') shape.absarc(-size, -size, size, Math.PI / 2, 0, true);
    else shape.lineTo(0, -size);
    shape.closePath();
    const overlap = Math.max(0.01, size * 0.01);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: length + overlap * 2,
        steps: 1,
        bevelEnabled: false,
        curveSegments: treatment.type === 'fillet' ? 12 : 1,
    });
    const matrix = new THREE.Matrix4().makeBasis(u, v, w).setPosition(a.clone().addScaledVector(tangent, -overlap));
    geometry.applyMatrix4(matrix);
    geometry.computeVertexNormals();
    return geometry;
}

/** Convex edge treatments are evaluated from their original edge on every rebuild. */
export function applyEdgeTreatments(base: THREE.BufferGeometry, treatments: EdgeTreatment[] = []) {
    let result = base;
    treatments.filter((treatment) => treatment.size > 0).forEach((treatment) => {
        const tool = cutter(treatment);
        if (!tool) return;
        try {
            const next = evaluateBoolean(result, tool, 'subtract');
            if (result !== base) result.dispose();
            result = next;
        } finally {
            tool.dispose();
        }
    });
    return result;
}

function pointSegmentDistance(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
    const direction = b.clone().sub(a);
    const lengthSquared = direction.lengthSq();
    if (lengthSquared < 1e-12) return point.distanceTo(a);
    const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(direction) / lengthSquared, 0, 1);
    return point.distanceTo(a.clone().addScaledVector(direction, t));
}

/** Generated chamfer/fillet edges resolve back to their original edge for repeated gestures. */
export function resolveEdgeTreatment(entity: ModelEntity, anchor: GeometryAnchor) {
    if (anchor.edgeTreatmentId) {
        const exact = entity.edgeTreatments?.find((item) => item.id === anchor.edgeTreatmentId);
        if (exact) return exact;
    }
    const local = anchor.localEdge;
    if (!local) return null;
    const a = new THREE.Vector3(...local.a), b = new THREE.Vector3(...local.b);
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const tangent = b.clone().sub(a).normalize();
    let best: { treatment: EdgeTreatment; distance: number } | null = null;
    entity.edgeTreatments?.forEach((treatment) => {
        const ta = new THREE.Vector3(...treatment.edge.a), tb = new THREE.Vector3(...treatment.edge.b);
        const originalTangent = tb.clone().sub(ta).normalize();
        if (Math.abs(originalTangent.dot(tangent)) < 0.98) return;
        const distance = pointSegmentDistance(midpoint, ta, tb);
        // Original edges score zero; generated parallel edges remain within one radius of the source.
        if (distance > treatment.size * 1.25 + 0.05) return;
        if (!best || distance < best.distance) best = { treatment, distance };
    });
    return best?.treatment || null;
}

export function treatmentFromAnchor(anchor: GeometryAnchor, type: EdgeTreatment['type'], id: string): EdgeTreatment | null {
    if (!anchor.localEdge || anchor.localEdge.normals.length < 2) return null;
    return {
        id, type, size: 0,
        edge: {
            a: [...anchor.localEdge.a] as Vec3,
            b: [...anchor.localEdge.b] as Vec3,
            normals: anchor.localEdge.normals.slice(0, 2).map((normal) => [...normal] as Vec3),
        },
    };
}
