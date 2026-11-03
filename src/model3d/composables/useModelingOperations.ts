import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import * as THREE from 'three';
import { useMessage } from 'naive-ui';
import type { EditPhase, Viewport, ViewTool } from '../engine/Viewport';
import { entityProfileClosed } from '../engine/profiles';
import { applyEntityTransform, buildEntityMesh } from '../engine/geometry';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
import { DirectEditTransaction } from '../engine/modeling/DirectEditTransaction';
import { bakeEntityGeometry } from '../engine/modeling/BakedGeometry';
import { uid } from '../utils/id';
import { cloneEntity, uniqueEntityName } from '../utils/entity';
import {
    cloneDocument, createEntity,
    type BooleanOperation, type ModelDocument, type ModelEntity, type OperationState,
    type Point2, type PrimaryPanel, type SelectionKind, type Vec3,
} from '../types';

interface ModelingOperationsOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    selectedEntities: ComputedRef<ModelEntity[]>;
    selected: ComputedRef<ModelEntity | null>;
    selectionKind: Ref<SelectionKind>;
    activeTool: Ref<ViewTool>;
    activePanel: Ref<PrimaryPanel | null>;
    parameterCardOpen: Ref<boolean>;
    lastFace: Ref<{ bodyId: string; normal: Vec3; point: Vec3 } | null>;
    profileFace: () => Point2[] | null;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    popHistory: () => void;
    inputLength: (value: number | null) => number | null;
    setTool: (tool: ViewTool) => void;
    startSketch: (editProfile?: boolean) => void;
}

/** Extrude/boolean drafts, direct geometry editing and feature-history editing. */
export function useModelingOperations(options: ModelingOperationsOptions) {
    const {
        document, selectedIds, selectedEntities, selected, selectionKind, activeTool, activePanel,
        parameterCardOpen, lastFace, profileFace, viewport, message, pushHistory, popHistory, inputLength, setTool, startSketch,
    } = options;
    const operation = ref<OperationState | null>(null);
    const historyEditId = ref<string | null>(null);
    let extrudeBase: ModelEntity | null = null;
    let directTransaction: DirectEditTransaction | null = null;
    let directHistoryPushed = false;
    let directRequestedDistance: number | null = null;
    let directErrorShown = false;
    const directDisplayDistance = ref<number | null>(null);
    let extrudeGestureMoved = false;

    const canBoolean = computed(() => selectedEntities.value.length === 2);
    const extrudeBody = computed(() => {
        const current = operation.value;
        return current?.type === 'extrude' ? document.value.entities.find((item) => item.id === current.bodyId) : null;
    });
    const booleanDraft = computed(() => operation.value?.type === 'boolean' ? operation.value : null);
    const operationTargets = computed(() => document.value.entities.filter((item) => !['sketch', 'folder'].includes(item.kind) && item.id !== extrudeBody.value?.id).map((item) => ({ label: item.name, value: item.id })));

    function createPrimitive(kind: 'box' | 'cylinder' | 'sphere') {
        pushHistory();
        const entity = createEntity(kind, uid());
        entity.name = uniqueEntityName(document.value, kind);
        document.value.entities.push(entity);
        selectedIds.value = [entity.id];
        selectionKind.value = 'body';
        activePanel.value = null;
        parameterCardOpen.value = true;
        setTool('translate');
        nextTick(() => viewport()?.fitSelection());
    }

    function applyBoolean(type: BooleanOperation) {
        if (!canBoolean.value) return;
        const bodies = selectedEntities.value.filter((item) => item.kind !== 'sketch');
        if (bodies.length !== 2) return message.warning('请选择两个实体 Body');
        const [first, second] = bodies;
        const target = type === 'union' ? second : first;
        const tool = type === 'union' ? first : second;
        const before = cloneDocument(document.value);
        pushHistory();
        const names = { union: '并集', subtract: '差集', intersect: '交集' };
        const entity: ModelEntity = {
            id: uid(), parentId: null, name: `${names[type]} ${document.value.entities.filter((item) => item.kind === 'boolean').length + 1}`,
            kind: 'boolean', color: target.color, visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
            operation: type, operands: [target.id, tool.id],
        };
        document.value.entities.push(entity);
        operation.value = { type: 'boolean', resultId: entity.id, targetId: target.id, toolId: tool.id, before, keepTarget: false, keepTool: false, existing: false };
        activePanel.value = null;
        selectedIds.value = [target.id, tool.id];
        viewport()?.setBooleanRoles({ target: target.id, tool: tool.id });
    }
    function startExtrude(profileId: string, existingBody?: ModelEntity, keepView = false) {
        if (operation.value) return;
        const primary = document.value.entities.find((item) => item.id === profileId && item.kind === 'sketch');
        if (!primary || !entityProfileClosed(primary)) return;
        const activeIntersection = existingBody ? null : profileFace();
        const profiles = activeIntersection ? [primary] : existingBody ? [primary] : [primary, ...selectedEntities.value.filter((item) => item.kind === 'sketch' && item.id !== profileId && entityProfileClosed(item))];
        const before = cloneDocument(document.value);
        pushHistory();
        const bodies: ModelEntity[] = [];
        profiles.forEach((profile, index) => {
            let body = index === 0 ? existingBody : undefined;
            if (!body) {
                body = createEntity('extrude', uid());
                body.name = uniqueEntityName(document.value, 'extrude');
                body.parentId = profile.parentId;
                body.depth = 10;
                body.sideMode = 'one';
                body.direction = 1;
                body.position = [0, 0, 0];
                document.value.entities.push(body);
            }
            body.profileId = activeIntersection ? undefined : profile.id;
            body.points = (activeIntersection || profile.points!).map((point) => [...point]);
            body.parts = profile.parts?.map((part) => ({ ...part, points: part.points.map((point) => [...point]) }));
            body.profileType = activeIntersection ? 'polygon' : profile.profileType;
            body.planeId = profile.planeId;
            body.curves = cloneEntity(profile).curves;
            body.analyticCurves = cloneEntity(profile).analyticCurves;
            body.sides = profile.sides;
            body.sectorAngle = profile.sectorAngle;
            body.open = profile.open;
            body.profileStartAngle = profile.profileStartAngle;
            delete body.meshGeometry;
            delete body.axisBox;
            delete body.compositeGeometry;
            profile.visible = true;
            body.visible = true;
            bodies.push(body);
        });
        const body = bodies[0];
        let combinedResultId: string | undefined;
        if (!existingBody && !activeIntersection && bodies.length > 1) {
            let target = bodies[0];
            bodies.slice(1).forEach((tool) => {
                const result: ModelEntity = {
                    id: uid(), parentId: target.parentId, name: '组合拉伸', kind: 'boolean', color: target.color, visible: true,
                    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], operation: 'union', operands: [target.id, tool.id],
                };
                target.visible = false;
                tool.visible = false;
                document.value.entities.push(result);
                target = result;
                combinedResultId = result.id;
            });
        }
        const targetId: string | null = null;
        const result: 'new' | BooleanOperation = 'new';
        operation.value = { type: 'extrude', profileId, bodyId: body.id, profileIds: profiles.map((item) => item.id), bodyIds: bodies.map((item) => item.id), before, result, targetId, existing: !!existingBody, combinedResultId };
        activePanel.value = null;
        historyEditId.value = existingBody?.id || null;
        selectedIds.value = profiles.map((item) => item.id);
        activeTool.value = 'extrude';
        viewport()?.setTool('extrude');
        if (!keepView) viewport()?.setView('perspective');
    }
    function updateExtrude(key: 'depth' | 'direction' | 'sideMode' | 'draftAngle', value: any) {
        if (operation.value?.type !== 'extrude' || value === null) return;
        operation.value.bodyIds.forEach((id) => {
            const body = document.value.entities.find((item) => item.id === id);
            if (body) (body as any)[key] = value;
        });
    }
    function updateExtrudeLength(value: number | null) { updateExtrude('depth', inputLength(value)); }
    function onExtrudeGesture(profileId: string, direction: 1 | -1, delta: number, phase: EditPhase) {
        if (phase === 'start') {
            extrudeGestureMoved = false;
            if (!operation.value) startExtrude(profileId, undefined, true);
            if (operation.value?.type !== 'extrude') return;
            updateExtrude('direction', direction);
            updateExtrude('depth', 0.1);
            return;
        }
        if (phase === 'move' && operation.value?.type === 'extrude') {
            extrudeGestureMoved = true;
            updateExtrude('direction', delta < 0 ? -direction : direction);
            updateExtrude('depth', Math.max(0.1, Math.round(Math.abs(delta) * 100) / 100));
        } else if (phase === 'end' && !extrudeGestureMoved && operation.value?.type === 'extrude') cancelOperation();
    }
    function updateExtrudeResult(result: 'new' | BooleanOperation) {
        if (operation.value?.type === 'extrude') operation.value.result = result;
    }
    function swapBooleanRoles() {
        const draft = booleanDraft.value;
        if (!draft) return;
        [draft.targetId, draft.toolId] = [draft.toolId, draft.targetId];
        const entity = document.value.entities.find((item) => item.id === draft.resultId);
        if (entity) entity.operands = [draft.targetId, draft.toolId];
        selectedIds.value = [draft.targetId, draft.toolId];
        viewport()?.setBooleanRoles({ target: draft.targetId, tool: draft.toolId });
    }
    function doneOperation() {
        const current = operation.value;
        if (!current) return;
        if (current.type === 'extrude') {
            const body = document.value.entities.find((item) => item.id === current.bodyId);
            current.profileIds.forEach((profileId) => {
                const profile = document.value.entities.find((item) => item.id === profileId);
                const plane = document.value.planes.find((item) => item.id === profile?.planeId);
                if (plane) plane.visible = false;
            });
            let selectedId = current.combinedResultId || current.bodyId;
            if (current.result !== 'new') {
                if (!current.targetId) return message.warning('请选择自动布尔的目标 Body');
                const target = document.value.entities.find((item) => item.id === current.targetId);
                if (!target || !body) return;
                const result: ModelEntity = {
                    id: uid(), parentId: body.parentId, name: `拉伸${current.result === 'union' ? '并集' : current.result === 'subtract' ? '差集' : '交集'} ${document.value.entities.length + 1}`,
                    kind: 'boolean', color: body.color, visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
                    operation: current.result, operands: [target.id, body.id],
                };
                target.visible = false;
                body.visible = false;
                document.value.entities.push(result);
                selectedId = result.id;
            }
            [...current.bodyIds, current.combinedResultId].forEach((id) => {
                const entity = document.value.entities.find((item) => item.id === id);
                if (entity) bakeEntityGeometry(entity, document.value);
            });
            selectedIds.value = [selectedId];
        } else {
            const target = document.value.entities.find((item) => item.id === current.targetId);
            const tool = document.value.entities.find((item) => item.id === current.toolId);
            if (target) target.visible = current.keepTarget;
            if (tool) tool.visible = current.keepTool;
            const result = document.value.entities.find((item) => item.id === current.resultId);
            if (result) bakeEntityGeometry(result, document.value);
            selectedIds.value = [current.resultId];
            viewport()?.setBooleanRoles(null);
        }
        operation.value = null;
        historyEditId.value = null;
        setTool('select');
    }
    function cancelOperation() {
        const current = operation.value;
        if (!current) return;
        const selectedId = current.type === 'extrude' ? current.profileId : current.resultId;
        document.value = current.before;
        popHistory();
        operation.value = null;
        historyEditId.value = null;
        viewport()?.setBooleanRoles(null);
        selectedIds.value = document.value.entities.some((item) => item.id === selectedId) ? [selectedId] : [];
        setTool('select');
    }
    function editHistory(id: string) {
        const entity = document.value.entities.find((item) => item.id === id);
        if (!entity) return;
        if (entity.kind === 'sketch') {
            if (entityProfileClosed(entity)) return startExtrude(id);
            selectedIds.value = [id];
            return startSketch(true);
        }
        if (entity.kind === 'extrude' && entity.profileId) return startExtrude(entity.profileId, entity);
        if (entity.kind === 'boolean' && entity.operands) {
            const before = cloneDocument(document.value);
            pushHistory();
            delete entity.meshGeometry;
            delete entity.compositeGeometry;
            operation.value = { type: 'boolean', resultId: entity.id, targetId: entity.operands[0], toolId: entity.operands[1], before,
                keepTarget: !!document.value.entities.find((item) => item.id === entity.operands![0])?.visible,
                keepTool: !!document.value.entities.find((item) => item.id === entity.operands![1])?.visible, existing: true };
            historyEditId.value = entity.id;
            selectedIds.value = [...entity.operands];
            viewport()?.setBooleanRoles({ target: entity.operands[0], tool: entity.operands[1] });
        }
    }

    function directFaceInLocal(item: ModelEntity, transaction: DirectEditTransaction) {
        const transform = new THREE.Object3D();
        applyEntityTransform(transform, item);
        const inverse = transform.matrixWorld.clone().invert();
        return {
            vertices: transaction.anchor.vertices.map((point) => new THREE.Vector3(...point).applyMatrix4(inverse).toArray() as Vec3),
            indices: [...transaction.anchor.indices],
        };
    }

    function applyDirectDistance(item: ModelEntity, distance: number) {
        const transaction = directTransaction!;
        const request = transaction.request(distance, item);
        const face = directFaceInLocal(item, transaction);
        const localNormal = new THREE.Vector3(...transaction.normal).normalize();
        const worldPerLocal = localNormal.clone().multiply(new THREE.Vector3(...item.scale)).length();
        if (worldPerLocal < 1e-9) throw new Error('实体缩放导致拉伸方向退化');
        distance /= worldPerLocal;
        item.faceOffset = { normal: [...transaction.normal], distance: request.distance, ...face };
        const preview = buildEntityMesh(item, document.value);
        preview.geometry.dispose();
        (Array.isArray(preview.material) ? preview.material : [preview.material]).forEach((material) => material.dispose());
    }

    function updateFaceOffsetInput(value: number | null) {
        const item = selected.value;
        const anchor = viewport()?.getGeometryAnchor();
        if (!item || value === null || !anchor || anchor.type !== 'face') return message.warning('请先选择一个实体平面');
        onDirectEdit(item.id, anchor.localNormal, 0, 'start', anchor);
        onDirectEdit(item.id, anchor.localNormal, value, 'move');
        onDirectEdit(item.id, anchor.localNormal, value, 'end');
    }

    function onDirectEdit(id: string, normal: Vec3, delta: number, phase: EditPhase, anchor?: GeometryAnchor) {
        if (activeTool.value === 'extrude') {
            if (phase === 'start') extrudeBase = extrudeBody.value ? cloneEntity(extrudeBody.value) : null;
            else if (phase === 'move' && extrudeBase && operation.value?.type === 'extrude') operation.value.bodyIds.forEach((id) => {
                const body = document.value.entities.find((item) => item.id === id);
                if (body) body.depth = Math.round(Math.max(0.1, (extrudeBase!.depth || 10) + delta) * 10000) / 10000;
            });
            else extrudeBase = null;
            return;
        }
        const item = document.value.entities.find((entity) => entity.id === id);
        if (!item) return;
        if (phase === 'start') {
            if (!anchor || anchor.type !== 'face' || !anchor.planar || !anchor.vertices.length) return message.warning('只有完整平面区域支持推拉');
            if (activeTool.value === 'select') setTool('offsetFace');
            directTransaction = new DirectEditTransaction(item, anchor, normal);
            directRequestedDistance = null;
            directHistoryPushed = false;
            directErrorShown = false;
            return;
        }
        if (!directTransaction || directTransaction.baseEntity.id !== id) return;
        if (phase === 'cancel') {
            item.faceOffset = directTransaction.baseEntity.faceOffset || null;
            if (directHistoryPushed) popHistory();
            directTransaction.close();
            directTransaction = null;
            directRequestedDistance = null;
            directDisplayDistance.value = null;
            viewport()?.clearGeometrySelection();
            return;
        }
        if (phase === 'end') {
            finishDirectEdit();
            return;
        }
        const distance = (directTransaction.baseEntity.faceOffset?.distance || 0) + delta;
        directRequestedDistance = distance;
        directDisplayDistance.value = distance;
        const previousOffset = item.faceOffset;
        if (!directHistoryPushed) {
            pushHistory();
            directHistoryPushed = true;
        }
        try {
            applyDirectDistance(item, distance);
            directErrorShown = false;
        } catch (error) {
            item.faceOffset = previousOffset;
            if (!directErrorShown) message.error(error instanceof Error ? error.message : '无法计算当前面拉伸');
            directErrorShown = true;
        }
    }

    function bakeDirectEntity(item: ModelEntity) {
        bakeEntityGeometry(item, document.value);
    }

    function cancelDirectEdit() {
        const transaction = directTransaction;
        if (!transaction) return;
        onDirectEdit(transaction.baseEntity.id, transaction.normal, 0, 'cancel');
    }

    function finishDirectEdit() {
        const transaction = directTransaction;
        if (!transaction) return;
        const item = document.value.entities.find((entity) => entity.id === transaction.baseEntity.id);
        if (item && directRequestedDistance !== null) {
            try {
                // Commit is a fresh evaluation of S0 at the final requested value, never a baked preview.
                item.faceOffset = transaction.baseEntity.faceOffset || null;
                if (Math.abs(directRequestedDistance) > 1e-7) {
                    applyDirectDistance(item, directRequestedDistance);
                    bakeDirectEntity(item);
                } else if (directHistoryPushed) {
                    popHistory();
                }
            } catch (error) {
                item.faceOffset = transaction.baseEntity.faceOffset || null;
                if (directHistoryPushed) popHistory();
                message.error(error instanceof Error ? `提交失败：${error.message}` : '提交失败，已保留原实体');
            }
        }
        transaction.close();
        directTransaction = null;
        directRequestedDistance = null;
        directDisplayDistance.value = null;
        directHistoryPushed = false;
        viewport()?.clearGeometrySelection();
    }



    return {
        operation, historyEditId, directDisplayDistance, canBoolean, extrudeBody, booleanDraft, operationTargets,
        createPrimitive, applyBoolean, startExtrude, updateExtrude, updateExtrudeLength, onExtrudeGesture,
        updateExtrudeResult, swapBooleanRoles, doneOperation, cancelOperation, editHistory,
        updateFaceOffsetInput, onDirectEdit, finishDirectEdit, cancelDirectEdit,
    };
}
