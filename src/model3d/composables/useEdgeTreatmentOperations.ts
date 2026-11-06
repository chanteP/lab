import type { Ref } from 'vue';
import { useMessage } from 'naive-ui';
import * as THREE from 'three';
import type { EditPhase, ViewTool, Viewport } from '../engine/Viewport';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
import { buildEntityMesh } from '../engine/geometry';
import { resolveEdgeTreatment, treatmentFromAnchor } from '../engine/modeling/EdgeTreatments';
import { resolveVertexTreatment, vertexTreatmentFromAnchor } from '../engine/modeling/VertexTreatments';
import { cloneEntity } from '../utils/entity';
import { uid } from '../utils/id';
import type { EdgeTreatment, ModelDocument, ModelEntity, Vec3, VertexTreatment } from '../types';

interface EdgeTreatmentOptions {
    document: Ref<ModelDocument>;
    activeTool: Ref<ViewTool>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    popHistory: () => void;
    setTool: (tool: ViewTool) => void;
}

type Treatment = EdgeTreatment | VertexTreatment;
type Transaction = {
    kind: 'edge' | 'vertex';
    entityId: string;
    baseEntity: ModelEntity;
    treatment: Treatment;
    baseValue: number;
    limit: number;
    chamferLimit: number;
    historyPushed: boolean;
};

const signedValue = (treatment: Treatment) => treatment.type === 'fillet' ? treatment.size : -treatment.size;

/** Signed edge/vertex treatment gestures: inward is fillet (+), outward is chamfer (-). */
export function useEdgeTreatmentOperations(options: EdgeTreatmentOptions) {
    const { document, viewport, message, pushHistory, popHistory } = options;
    let transaction: Transaction | null = null;

    function straightAnchor(anchor: GeometryAnchor) {
        if (!anchor.localEdge || anchor.localEdge.normals.length < 2 || anchor.vertices.length < 2) return false;
        const a = new THREE.Vector3(...anchor.vertices[0]), b = new THREE.Vector3(...anchor.vertices[anchor.vertices.length - 1]);
        const direction = b.clone().sub(a).normalize();
        return anchor.vertices.every((point) => {
            const delta = new THREE.Vector3(...point).sub(a);
            return delta.clone().addScaledVector(direction, -delta.dot(direction)).length() < 0.01;
        });
    }

    function begin(id: string, anchor?: GeometryAnchor) {
        const item = document.value.entities.find((entity) => entity.id === id);
        const kind = anchor?.type === 'vertex' ? 'vertex' : anchor?.type === 'edge' ? 'edge' : null;
        if (!item || !anchor || !kind) return message.warning('请先选择实体边或角点');
        if (kind === 'edge' && !anchor.generatedTreatment && !straightAnchor(anchor)) return message.warning('当前仅支持直线边圆角和倒角');
        if (kind === 'vertex' && (anchor.localVertex?.normals.length || 0) < 3) return message.warning('该角点缺少至少三个相邻面');
        const existing = anchor.generatedTreatment || !anchor.finalTopology
            ? kind === 'edge' ? resolveEdgeTreatment(item, anchor) : resolveVertexTreatment(item, anchor)
            : null;
        const treatment = existing || (kind === 'edge' ? treatmentFromAnchor(anchor, 'fillet', uid()) : vertexTreatmentFromAnchor(anchor, uid()));
        if (!treatment) return message.warning('无法识别相邻面');
        const mesh = buildEntityMesh(item, document.value);
        mesh.geometry.computeBoundingBox();
        const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
        const limit = Math.max(0.1, Math.min(size.x, size.y, size.z) / 2);
        const chamferLimit = kind === 'edge' ? Math.max(0.1, Math.min(size.x, size.y, size.z)) : limit;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
        if (kind === 'edge') anchor.edgeTreatmentId = treatment.id;
        else anchor.vertexTreatmentId = treatment.id;
        transaction = {
            kind, entityId: id, baseEntity: cloneEntity(item), treatment: JSON.parse(JSON.stringify(treatment)),
            baseValue: existing ? signedValue(existing) : 0, limit, chamferLimit, historyPushed: false,
        };
    }

    function move(delta: number) {
        if (!transaction) return;
        const item = document.value.entities.find((entity) => entity.id === transaction!.entityId);
        if (!item) return;
        if (!transaction.historyPushed) {
            pushHistory();
            transaction.historyPushed = true;
        }
        const value = Math.round(THREE.MathUtils.clamp(transaction.baseValue - delta, -transaction.chamferLimit, transaction.limit) * 10000) / 10000;
        const next = { ...JSON.parse(JSON.stringify(transaction.treatment)), type: value < 0 ? 'chamfer' : 'fillet', size: Math.abs(value) } as Treatment;
        if (transaction.kind === 'edge') {
            const treatments = (transaction.baseEntity.edgeTreatments || []).map((item) => JSON.parse(JSON.stringify(item))) as EdgeTreatment[];
            const index = treatments.findIndex((item) => item.id === next.id);
            if (index >= 0) treatments[index] = next as EdgeTreatment;
            else treatments.push(next as EdgeTreatment);
            item.edgeTreatments = treatments;
        } else {
            const treatments = (transaction.baseEntity.vertexTreatments || []).map((item) => JSON.parse(JSON.stringify(item))) as VertexTreatment[];
            const index = treatments.findIndex((item) => item.id === next.id);
            if (index >= 0) treatments[index] = next as VertexTreatment;
            else treatments.push(next as VertexTreatment);
            item.vertexTreatments = treatments;
        }
    }

    function onEdgeTreatmentEdit(id: string, _normal: Vec3, delta: number, phase: EditPhase, anchor?: GeometryAnchor) {
        if (phase === 'start') return begin(id, anchor);
        if (!transaction || transaction.entityId !== id) return;
        if (phase === 'move') return move(delta);
        if (phase === 'cancel') {
            const item = document.value.entities.find((entity) => entity.id === id);
            if (item) {
                item.edgeTreatments = transaction.baseEntity.edgeTreatments;
                item.vertexTreatments = transaction.baseEntity.vertexTreatments;
            }
            if (transaction.historyPushed) popHistory();
            transaction = null;
            return;
        }
        transaction = null;
    }

    function getSelectedEdgeTreatment(): Treatment | null {
        const anchor = viewport()?.getGeometryAnchor();
        const item = document.value.entities.find((entity) => entity.id === anchor?.id);
        if (!item || !anchor) return null;
        if (anchor.finalTopology && !anchor.generatedTreatment) return null;
        if (anchor.type === 'edge') return resolveEdgeTreatment(item, anchor);
        if (anchor.type === 'vertex') return resolveVertexTreatment(item, anchor);
        return null;
    }

    function resetEdgeTreatment() {
        const treatment = getSelectedEdgeTreatment();
        if (!treatment || treatment.size <= 0) return false;
        transaction = null;
        pushHistory();
        treatment.size = 0;
        return true;
    }

    function updateEdgeTreatmentDistance(value: number | null) {
        const anchor = viewport()?.getGeometryAnchor();
        if (value === null || !anchor || !['edge', 'vertex'].includes(anchor.type)) return message.warning('请先选择实体边或角点');
        onEdgeTreatmentEdit(anchor.id, anchor.localNormal, 0, 'start', anchor);
        if (!transaction) return;
        onEdgeTreatmentEdit(anchor.id, anchor.localNormal, transaction.baseValue - value, 'move');
        onEdgeTreatmentEdit(anchor.id, anchor.localNormal, 0, 'end');
    }

    return {
        onEdgeTreatmentEdit,
        updateEdgeTreatmentDistance,
        getSelectedEdgeTreatment,
        resetEdgeTreatment,
        finishEdgeTreatment: () => { transaction = null; },
        cancelEdgeTreatment: () => {
            if (transaction) onEdgeTreatmentEdit(transaction.entityId, [0, 1, 0], 0, 'cancel');
        },
    };
}
