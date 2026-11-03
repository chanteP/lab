import type { ModelDocument, ModelEntity } from '../../types';
import { buildEntityMesh } from '../geometry';

/** Publishes a committed body independently of its feature operands. */
export function bakeEntityGeometry(entity: ModelEntity, document: ModelDocument) {
    const mesh = buildEntityMesh(entity, document);
    entity.meshGeometry = {
        positions: Array.from(mesh.geometry.attributes.position?.array || []),
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
