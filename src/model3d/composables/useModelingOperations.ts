import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import * as THREE from 'three';
import { useMessage } from 'naive-ui';
import type { EditPhase, Viewport, ViewTool } from '../engine/Viewport';
import { entityProfileClosed } from '../engine/profiles';
import { buildEntityMesh } from '../engine/geometry';
import { uid } from '../utils/id';
import { cloneEntity, uniqueEntityName } from '../utils/entity';
import {
    cloneDocument, createEntity,
    type BooleanOperation, type ModelDocument, type ModelEntity, type OperationState,
    type PrimaryPanel, type SelectionKind, type Vec3,
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
        parameterCardOpen, lastFace, viewport, message, pushHistory, popHistory, inputLength, setTool, startSketch,
    } = options;
    const operation = ref<OperationState | null>(null);
    const historyEditId = ref<string | null>(null);
    let directBase: ModelEntity | null = null;
    let directHistoryPushed = false;
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
            operation: type, operands: [target.id, tool.id], edge: null,
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
        const profiles = existingBody ? [primary] : [primary, ...selectedEntities.value.filter((item) => item.kind === 'sketch' && item.id !== profileId && entityProfileClosed(item))];
        const before = cloneDocument(document.value);
        pushHistory();
        const bodies: ModelEntity[] = [];
        profiles.forEach((profile, index) => {
            let body = index === 0 ? existingBody : undefined;
            if (!body) {
                body = createEntity('extrude', uid());
                body.name = uniqueEntityName(document.value, 'extrude');
                body.parentId = profile.parentId;
                body.profileId = profile.id;
                body.points = profile.points!.map((point) => [...point]);
                body.profileType = profile.profileType;
                body.planeId = profile.planeId;
                body.depth = 10;
                body.sideMode = 'one';
                body.direction = 1;
                body.position = [0, 0, 0];
                body.sectorAngle = profile.sectorAngle;
                document.value.entities.push(body);
            }
            profile.visible = true;
            body.visible = true;
            bodies.push(body);
        });
        const body = bodies[0];
        let targetId: string | null = null;
        let result: 'new' | BooleanOperation = 'new';
        if (!existingBody) {
            const bounds = new THREE.Box3().setFromObject(buildEntityMesh(body, document.value));
            const target = document.value.entities.find((item) => item.visible && !bodies.some((entry) => entry.id === item.id) && item.kind !== 'sketch' && (() => {
                try { return bounds.intersectsBox(new THREE.Box3().setFromObject(buildEntityMesh(item, document.value))); } catch { return false; }
            })());
            if (target) { targetId = target.id; result = body.direction === -1 ? 'subtract' : 'union'; }
        }
        operation.value = { type: 'extrude', profileId, bodyId: body.id, profileIds: profiles.map((item) => item.id), bodyIds: bodies.map((item) => item.id), before, result, targetId, existing: !!existingBody };
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
            updateExtrude('depth', Math.max(0.1, Math.round(delta * 100) / 100));
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
            let selectedId = current.bodyId;
            if (current.result !== 'new') {
                if (!current.targetId) return message.warning('请选择自动布尔的目标 Body');
                const target = document.value.entities.find((item) => item.id === current.targetId);
                if (!target || !body) return;
                const result: ModelEntity = {
                    id: uid(), parentId: body.parentId, name: `拉伸${current.result === 'union' ? '并集' : current.result === 'subtract' ? '差集' : '交集'} ${document.value.entities.length + 1}`,
                    kind: 'boolean', color: body.color, visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
                    operation: current.result, operands: [target.id, body.id], edge: null,
                };
                target.visible = false;
                body.visible = false;
                document.value.entities.push(result);
                selectedId = result.id;
            }
            selectedIds.value = [selectedId];
        } else {
            const target = document.value.entities.find((item) => item.id === current.targetId);
            const tool = document.value.entities.find((item) => item.id === current.toolId);
            if (target) target.visible = current.keepTarget;
            if (tool) tool.visible = current.keepTool;
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
        if (id.endsWith(':edge')) {
            const entity = document.value.entities.find((item) => item.id === id.slice(0, -5));
            if (!entity?.edge) return;
            selectedIds.value = [entity.id];
            selectionKind.value = 'edge';
            historyEditId.value = entity.id;
            activePanel.value = null;
            parameterCardOpen.value = true;
            setTool(entity.edge.type);
            return;
        }
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
            operation.value = { type: 'boolean', resultId: entity.id, targetId: entity.operands[0], toolId: entity.operands[1], before,
                keepTarget: !!document.value.entities.find((item) => item.id === entity.operands![0])?.visible,
                keepTool: !!document.value.entities.find((item) => item.id === entity.operands![1])?.visible, existing: true };
            historyEditId.value = entity.id;
            selectedIds.value = [...entity.operands];
            viewport()?.setBooleanRoles({ target: entity.operands[0], tool: entity.operands[1] });
        }
    }

    function edgeLimitFor(item: ModelEntity) {
        if (item.kind === 'box') return Math.min(item.width!, item.height!, item.depth!) * 0.48;
        if (item.kind === 'cylinder') return Math.min(item.radius!, item.height! / 2) * 0.48;
        if (item.kind === 'extrude') return item.depth! * 0.24;
        return 0;
    }
    function clearEdge() {
        if (!selected.value) return;
        pushHistory();
        selected.value.edge = null;
    }
    function updateFaceOffsetInput(value: number | null) {
        const item = selected.value;
        if (!item || value === null || !lastFace.value) return;
        pushHistory();
        if (value <= 0) item.faceOffset = null;
        else {
            const rotation = new THREE.Euler(...item.rotation.map(THREE.MathUtils.degToRad) as Vec3);
            const normal = new THREE.Vector3(...lastFace.value.normal).applyQuaternion(new THREE.Quaternion().setFromEuler(rotation).invert()).normalize().toArray() as Vec3;
            item.faceOffset = { normal, distance: Math.max(faceOffsetMinimum(item, normal), value) };
        }
    }
    function faceOffsetMinimum(item: ModelEntity, normal: Vec3) {
        if (item.kind === 'box') {
            const axis = Math.abs(normal[0]) > 0.5 ? 0 : Math.abs(normal[1]) > 0.5 ? 1 : 2;
            return -[item.width!, item.height!, item.depth!][axis] + 0.1;
        }
        if (item.kind === 'cylinder') return -item.height! + 0.1;
        if (item.kind === 'extrude') return -item.depth! + 0.1;
        if (item.kind === 'boolean') {
            const geometry = buildEntityMesh(item, document.value).geometry;
            geometry.computeBoundingBox();
            const axis = Math.abs(normal[0]) > 0.5 ? 0 : Math.abs(normal[1]) > 0.5 ? 1 : 2;
            return -geometry.boundingBox!.getSize(new THREE.Vector3()).getComponent(axis) + 0.1;
        }
        return 0;
    }

    function onDirectEdit(id: string, normal: Vec3, delta: number, phase: EditPhase) {
        if (activeTool.value === 'extrude') {
            if (phase === 'start') directBase = extrudeBody.value ? cloneEntity(extrudeBody.value) : null;
            else if (phase === 'move' && directBase && operation.value?.type === 'extrude') operation.value.bodyIds.forEach((id) => {
                const body = document.value.entities.find((item) => item.id === id);
                if (body) body.depth = Math.round(Math.max(0.1, (directBase!.depth || 10) + delta) * 10000) / 10000;
            });
            else directBase = null;
            return;
        }
        const item = document.value.entities.find((entity) => entity.id === id);
        if (!item) return;
        const edgeTool = activeTool.value === 'fillet' || activeTool.value === 'chamfer';
        if (phase ==='start') {
            if (edgeTool && !['box', 'cylinder', 'extrude'].includes(item.kind)) return message.warning('该实体暂不支持边处理');
            if (!edgeTool && !['box', 'cylinder', 'extrude', 'boolean'].includes(item.kind)) return message.warning('该面暂不支持向外拉伸');
            if (!edgeTool && item.kind === 'cylinder' && Math.abs(normal[1]) < 0.5) return message.warning('圆柱侧面暂不支持向外拉伸');
            if (!edgeTool && item.kind === 'extrude') {
                const plane = document.value.planes.find((entry) => entry.id === item.planeId);
                if (plane && Math.abs(new THREE.Vector3(...normal).dot(new THREE.Vector3(...plane.normal))) < 0.9) return message.warning('请选择拉伸体的顶面或底面');
            }
            directBase = cloneEntity(item);
            directHistoryPushed = false;
            return;
        }
        if (phase === 'end') {
            directBase = null;
            return;
        }
        if (!directBase) return;
        if (!directHistoryPushed) {
            pushHistory();
            if (edgeTool) item.edge = { type: activeTool.value as 'fillet' | 'chamfer', size: item.edge?.size || 3, segments: item.edge?.segments || 6 };
            directHistoryPushed = true;
        }
        if (edgeTool) {
            const size = Math.round(THREE.MathUtils.clamp((directBase.edge?.size || 3) + delta, 0.1, edgeLimitFor(directBase)) * 10000) / 10000;
            item.edge = { ...directBase.edge!, size };
            return;
        }
        const next = (directBase.faceOffset?.distance || 0) + delta;
        item.faceOffset = { normal: [...normal], distance: Math.round(Math.max(faceOffsetMinimum(directBase, normal), next) * 100) / 100 };
    }


    return {
        operation, historyEditId, canBoolean, extrudeBody, booleanDraft, operationTargets,
        createPrimitive, applyBoolean, startExtrude, updateExtrude, updateExtrudeLength, onExtrudeGesture,
        updateExtrudeResult, swapBooleanRoles, doneOperation, cancelOperation, editHistory,
        edgeLimitFor, clearEdge, updateFaceOffsetInput, faceOffsetMinimum, onDirectEdit,
    };
}
