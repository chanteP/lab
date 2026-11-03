import type { ModelDocument } from '../../types';
import { bakeEntityGeometry } from './BakedGeometry';

/** Keeps History metadata where possible without making committed geometry depend on deleted sources. */
export function detachFeatureReferences(document: ModelDocument, deletedIds: string[]) {
    const deleted = new Set(deletedIds);
    document.entities.forEach((entity) => {
        if (deleted.has(entity.id)) return;
        const profileDeleted = !!entity.profileId && deleted.has(entity.profileId);
        const operandDeleted = !!entity.operands?.some((id) => deleted.has(id));
        if (!profileDeleted && !operandDeleted) return;
        if (!entity.meshGeometry) bakeEntityGeometry(entity, document);
        if (profileDeleted) delete entity.profileId;
        if (operandDeleted) delete entity.operands;
    });
}
