import type { Ref } from 'vue';
import { useMessage } from 'naive-ui';
import * as THREE from 'three';
import type { EditPhase, ViewTool, Viewport } from '../engine/Viewport';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
import { buildEntityMesh } from '../engine/geometry';
import { resolveEdgeTreatment, treatmentFromAnchor } from '../engine/modeling/EdgeTreatments';
import { cloneEntity } from '../utils/entity';
import { uid } from '../utils/id';
import type { EdgeTreatment, ModelDocument, ModelEntity, Vec3 } from '../types';

interface EdgeTreatmentOptions {
    document: Ref<ModelDocument>;
    activeTool: Ref<ViewTool>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    popHistory: () => void;
    setTool: (tool: ViewTool) => void;
}

type EdgeTransaction = {
    entityId: string;
    baseEntity: ModelEntity;
    treatment: EdgeTreatment;
    baseSize: number;
    limit: number;
    historyPushed: boolean;
};

/** Parametric convex-edge fillet/chamfer gestures; generated edges reuse the original transaction. */
export function useEdgeTreatmentOperations(options: EdgeTreatmentOptions) {
    const { document, activeTool, viewport, message, pushHistory, popHistory, setTool } = options;
    let transaction: EdgeTransaction | null = null;

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
        if (!item || !anchor || anchor.type !== 'edge') return message.warning('请先选择实体边');
        if (!straightAnchor(anchor)) return message.warning('当前仅支持直线边圆角和倒角');
        const existing = resolveEdgeTreatment(item, anchor);
        const treatment = existing || treatmentFromAnchor(anchor, activeTool.value === 'chamfer' ? 'chamfer' : 'fillet', uid());
        if (!treatment) return message.warning('无法识别该边的相邻面');
        const type = activeTool.value === 'fillet' || activeTool.value === 'chamfer' ? activeTool.value : existing?.type || 'fillet';
        if (activeTool.value !== type) setTool(type);
        const mesh = buildEntityMesh(item, document.value);
        mesh.geometry.computeBoundingBox();
        const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
        const limit = Math.max(0.1, Math.min(size.x, size.y, size.z) / 2);
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
        anchor.edgeTreatmentId = treatment.id;
        transaction = {
            entityId: id,
            baseEntity: cloneEntity(item),
            treatment: { ...treatment, type, edge: JSON.parse(JSON.stringify(treatment.edge)) },
            baseSize: existing?.size || 0,
            limit,
            historyPushed: false,
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
        // The arrow points out of the convex edge; dragging it inward (negative delta) increases the cut size.
        const size = Math.round(THREE.MathUtils.clamp(transaction.baseSize - delta, 0, transaction.limit) * 10000) / 10000;
        const treatments = (transaction.baseEntity.edgeTreatments || []).map((treatment) => ({ ...treatment, edge: JSON.parse(JSON.stringify(treatment.edge)) })) as EdgeTreatment[];
        const next = { ...transaction.treatment, size, edge: JSON.parse(JSON.stringify(transaction.treatment.edge)) } as EdgeTreatment;
        const index = treatments.findIndex((treatment) => treatment.id === next.id);
        if (index >= 0) treatments[index] = next;
        else treatments.push(next);
        item.edgeTreatments = treatments;
    }

    function onEdgeTreatmentEdit(id: string, _normal: Vec3, delta: number, phase: EditPhase, anchor?: GeometryAnchor) {
        if (phase === 'start') return begin(id, anchor);
        if (!transaction || transaction.entityId !== id) return;
        if (phase === 'move') return move(delta);
        if (phase === 'cancel') {
            const item = document.value.entities.find((entity) => entity.id === id);
            if (item) item.edgeTreatments = transaction.baseEntity.edgeTreatments;
            if (transaction.historyPushed) popHistory();
            transaction = null;
            return;
        }
        transaction = null;
    }

    function updateEdgeTreatmentDistance(value: number | null) {
        const anchor = viewport()?.getGeometryAnchor();
        if (value === null || !anchor || anchor.type !== 'edge') return message.warning('请先选择实体边');
        onEdgeTreatmentEdit(anchor.id, anchor.localNormal, 0, 'start', anchor);
        if (!transaction) return;
        // move() subtracts delta from the frozen size; use the difference to commit an absolute input value.
        onEdgeTreatmentEdit(anchor.id, anchor.localNormal, transaction.baseSize - value, 'move');
        onEdgeTreatmentEdit(anchor.id, anchor.localNormal, 0, 'end');
    }

    return {
        onEdgeTreatmentEdit,
        updateEdgeTreatmentDistance,
        finishEdgeTreatment: () => { transaction = null; },
        cancelEdgeTreatment: () => {
            if (transaction) onEdgeTreatmentEdit(transaction.entityId, [0, 1, 0], 0, 'cancel');
        },
    };
}
