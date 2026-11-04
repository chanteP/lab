import * as THREE from 'three';
import type { ModelEntity } from '../../types';
import { resolveEdgeTreatment } from '../modeling/EdgeTreatments';
import type { GeometryAnchor } from './GeometrySelector';

/** Restores the original 45-degree normal when a generated edge is picked again. */
export function resolveEdgeTreatmentAnchor(anchor: GeometryAnchor, entity: ModelEntity, object?: THREE.Object3D) {
    const treatment = resolveEdgeTreatment(entity, anchor);
    anchor.edgeTreatmentId = treatment?.id;
    if (!treatment) return;
    const localNormal = treatment.edge.normals.reduce((sum, normal) => sum.add(new THREE.Vector3(...normal)), new THREE.Vector3()).normalize();
    anchor.localNormal = localNormal.toArray();
    anchor.normal = object ? localNormal.clone().transformDirection(object.matrixWorld).toArray() : [...anchor.normal];
}
