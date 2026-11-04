import type { ModelDocument, ModelEntity } from '../../types';
import { buildEntityMesh } from '../geometry';
import { assertValidSolid } from './GeometryValidator';

/** Publishes a committed body independently of its feature operands. */
export function bakeEntityGeometry(entity: ModelEntity, document: ModelDocument) {
    // Baked geometry is the untreated base; parametric edge cuts are applied once on the next rebuild.
    const edgeTreatments = entity.edgeTreatments;
    delete entity.edgeTreatments;
    let mesh: ReturnType<typeof buildEntityMesh>;
    try { mesh = buildEntityMesh(entity, document); }
    finally { entity.edgeTreatments = edgeTreatments; }
    // The release result gets its own validation; the next gesture must not be responsible for repairing it.
    assertValidSolid(mesh.geometry);
    entity.meshGeometry = {
        positions: Array.from(mesh.geometry.attributes.position?.array || []),
        normals: Array.from(mesh.geometry.attributes.normal?.array || []),
        sourceFaceIDs: Array.from(mesh.geometry.userData.sourceFaceIDs || []),
        indices: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : Array.from({ length: mesh.geometry.attributes.position?.count || 0 }, (_, index) => index),
        mergeFromVert: Array.from(mesh.geometry.userData.mergeFromVert || []),
        mergeToVert: Array.from(mesh.geometry.userData.mergeToVert || []),
    };
    entity.compositeGeometry = true;
    if (entity.faceOffset?.faceIds?.length === 1) {
        entity.faceEdit = { faceId: entity.faceOffset.faceIds[0], normal: [...entity.faceOffset.normal], distance: entity.faceOffset.distance, revision: (entity.revision || 0) + 1 };
    }
    entity.faceOffset = null;
    delete entity.axisBox;
    entity.revision = (entity.revision || 0) + 1;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
}
