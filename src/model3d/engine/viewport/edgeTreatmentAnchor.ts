import * as THREE from 'three';
import type { ModelEntity } from '../../types';
import { resolveEdgeTreatment } from '../modeling/EdgeTreatments';
import type { GeometryAnchor } from './GeometrySelector';

/** Resolves legacy source anchors; generated surfaces retain their own face normal and feedback. */
export function resolveEdgeTreatmentAnchor(anchor: GeometryAnchor, entity: ModelEntity, object?: THREE.Object3D) {
    if (anchor.generatedTreatment) return;
    if (anchor.finalTopology) { anchor.edgeTreatmentId = undefined; return; }
    const treatment = resolveEdgeTreatment(entity, anchor);
    anchor.edgeTreatmentId = treatment?.id;
    if (!treatment) return;
    const localNormal = treatment.edge.normals.reduce((sum, normal) => sum.add(new THREE.Vector3(...normal)), new THREE.Vector3()).normalize();
    anchor.localNormal = localNormal.toArray();
    anchor.normal = object ? localNormal.clone().transformDirection(object.matrixWorld).toArray() : [...anchor.normal];
}
