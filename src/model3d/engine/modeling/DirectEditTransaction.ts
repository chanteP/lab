import type { Vec3 } from '../../types';
import { cloneEntity } from '../../utils/entity';
import { uid } from '../../utils/id';
import type { ModelEntity } from '../../types';
import type { GeometryAnchor } from '../viewport/GeometrySelector';

export interface DirectEditRequest {
    gestureId: string;
    baseRevision: number;
    sequence: number;
    distance: number;
}

/** Immutable S0 and gesture identity for synchronous previews now and worker evaluation later. */
export class DirectEditTransaction {
    readonly gestureId = uid();
    readonly baseRevision: number;
    readonly baseEntity: ModelEntity;
    readonly anchor: GeometryAnchor;
    readonly normal: Vec3;
    private sequence = 0;
    private active = true;

    constructor(entity: ModelEntity, anchor: GeometryAnchor, normal: Vec3) {
        this.baseRevision = entity.revision || 0;
        this.baseEntity = cloneEntity(entity);
        this.anchor = { ...anchor, vertices: anchor.vertices.map((point) => [...point]), indices: [...anchor.indices] };
        this.normal = [...normal];
    }

    request(distance: number, currentEntity: ModelEntity): DirectEditRequest {
        if (!this.active || (currentEntity.revision || 0) !== this.baseRevision || currentEntity.id !== this.baseEntity.id) throw new Error('模型已在拖拽期间发生变化');
        return { gestureId: this.gestureId, baseRevision: this.baseRevision, sequence: ++this.sequence, distance };
    }

    close() { this.active = false; }
}
