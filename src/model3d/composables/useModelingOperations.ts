import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import * as THREE from 'three';
import { useMessage } from 'naive-ui';
import type { EditPhase, Viewport, ViewTool } from '../engine/Viewport';
import { entityProfileClosed } from '../engine/profiles';
import { applyEntityTransform, buildEntityMesh } from '../engine/geometry';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
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
    const directBooleanMode = ref<'union' | 'subtract'>('subtract');
    const directBooleanAvailable = ref(false);
    let directBase: ModelEntity | null = null;
    let directHistoryPushed = false;
    let directFace: { vertices: Vec3[]; indices: number[] } | null = null;
    let directCrossDistance = Infinity;
    let directResultId: string | null = null;
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
        const targetId: string | null = null;
        const result: 'new' | BooleanOperation = 'new';
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
            let selectedId = current.bodyId;
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

    function updateFaceOffsetInput(value: number | null) {
        const item = selected.value;
        if (!item || value === null || !lastFace.value) return;
        pushHistory();
        if (value === 0) item.faceOffset = null;
        else {
            const rotation = new THREE.Euler(...item.rotation.map(THREE.MathUtils.degToRad) as Vec3);
            const normal = new THREE.Vector3(...lastFace.value.normal).applyQuaternion(new THREE.Quaternion().setFromEuler(rotation).invert()).normalize().toArray() as Vec3;
            item.faceOffset = { normal, distance: value, vertices: item.faceOffset?.vertices, indices: item.faceOffset?.indices };
        }
    }

    function onDirectEdit(id: string, normal: Vec3, delta: number, phase: EditPhase, anchor?: GeometryAnchor) {
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
        if (phase ==='start') {
            if (activeTool.value === 'select') setTool('offsetFace');
            if (!['box', 'cylinder', 'extrude', 'boolean'].includes(item.kind)) return message.warning('该面暂不支持向外拉伸');
            if (anchor && !anchor.planar) return;
            directBase = cloneEntity(item);
            directBooleanAvailable.value = false;
            const existingResult = document.value.entities.find((entity) => entity.directSourceId === item.id);
            directResultId = existingResult?.id || null;
            directBooleanMode.value = existingResult?.operation === 'union' ? 'union' : 'subtract';
            const transform = new THREE.Object3D();
            applyEntityTransform(transform, item);
            const inverse = transform.matrixWorld.clone().invert();
            const sameFace = item.faceOffset?.vertices && new THREE.Vector3(...item.faceOffset.normal).dot(new THREE.Vector3(...normal)) > 0.99;
            directFace = sameFace ? { vertices: item.faceOffset!.vertices!, indices: item.faceOffset!.indices || [] } : anchor ? {
                vertices: anchor.vertices.map((point) => new THREE.Vector3(...point).applyMatrix4(inverse).toArray() as Vec3),
                indices: [...anchor.indices],
            } : null;
            directCrossDistance = directFace ? (() => {
                const base = cloneEntity(item);
                base.faceOffset = null;
                const geometry = buildEntityMesh(base, document.value).geometry;
                const positions = geometry.attributes.position;
                const direction = new THREE.Vector3(...normal).normalize();
                let min = Infinity;
                for (let index = 0; index < positions.count; index++) min = Math.min(min, new THREE.Vector3().fromBufferAttribute(positions, index).dot(direction));
                const selected = directFace!.vertices.reduce((sum, point) => sum + new THREE.Vector3(...point).dot(direction), 0) / directFace!.vertices.length;
                return selected - min;
            })() : Infinity;
            directHistoryPushed = false;
            return;
        }
        if (phase === 'end') {
            if (directResultId && directBooleanMode.value === 'union') {
                selectedIds.value = [directResultId];
                selectionKind.value = 'body';
            }
            directBase = null;
            directFace = null;
            return;
        }
        if (!directBase) return;
        if (!directHistoryPushed) {
            pushHistory();
            directHistoryPushed = true;
        }
        const next = (directBase.faceOffset?.distance || 0) + delta;
        item.faceOffset = { normal: [...normal], distance: Math.round(next * 100) / 100, vertices: directFace?.vertices, indices: directFace?.indices };
        syncDirectBoolean(item);
    }

    function clearDirectBoolean() {
        const result = directResultId ? document.value.entities.find((item) => item.id === directResultId) : null;
        if (result) {
            const target = document.value.entities.find((item) => item.id === result.directTargetId);
            if (target) target.visible = result.directTargetVisible ?? true;
            const source = document.value.entities.find((item) => item.id === result.directSourceId);
            if (source) source.visible = true;
            document.value.entities = document.value.entities.filter((item) => item.id !== result.id);
        }
        directResultId = null;
        directBooleanAvailable.value = false;
    }

    function syncDirectBoolean(item: ModelEntity) {
        const crossed = !!item.faceOffset && item.faceOffset.distance < -directCrossDistance - 0.001;
        if (!crossed) { clearDirectBoolean(); return; }

        const sourceMesh = buildEntityMesh(item, document.value);
        const sourceBounds = new THREE.Box3().setFromObject(sourceMesh);
        const previousTargetId = directResultId ? document.value.entities.find((entity) => entity.id === directResultId)?.directTargetId : null;
        const target = document.value.entities.find((candidate) => (candidate.visible || candidate.id === previousTargetId) && candidate.id !== item.id && candidate.kind !== 'sketch' && !candidate.directSourceId && (() => {
            try { return sourceBounds.intersectsBox(new THREE.Box3().setFromObject(buildEntityMesh(candidate, document.value))); } catch { return false; }
        })());
        if (!target) { clearDirectBoolean(); return; }

        directBooleanAvailable.value = true;
        let result = directResultId ? document.value.entities.find((entity) => entity.id === directResultId) : null;
        if (result && result.directTargetId !== target.id) {
            clearDirectBoolean();
            result = null;
        }
        if (!result) {
            result = {
                id: uid(), parentId: item.parentId, name: `推拉差集 ${document.value.entities.length + 1}`, kind: 'boolean',
                color: target.color, visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
                operation: directBooleanMode.value, operands: [target.id, item.id], directSourceId: item.id,
                directTargetId: target.id, directTargetVisible: target.visible,
            };
            document.value.entities.push(result);
            directResultId = result.id;
        }
        result.operation = directBooleanMode.value;
        result.name = `推拉${directBooleanMode.value === 'union' ? '并集' : '差集'} ${result.id.slice(0, 4)}`;
        target.visible = false;
        item.visible = directBooleanMode.value === 'subtract';
    }

    function updateDirectBooleanMode(mode: 'union' | 'subtract') {
        directBooleanMode.value = mode;
        let source = directBase ? document.value.entities.find((entity) => entity.id === directBase!.id) : null;
        if (!source && directResultId) {
            const sourceId = document.value.entities.find((entity) => entity.id === directResultId)?.directSourceId;
            source = document.value.entities.find((entity) => entity.id === sourceId) || null;
        }
        if (source) syncDirectBoolean(source);
        else if (directResultId) {
            const result = document.value.entities.find((entity) => entity.id === directResultId);
            if (result) result.operation = mode;
        }
        if (directResultId) {
            const result = document.value.entities.find((entity) => entity.id === directResultId);
            selectedIds.value = [mode === 'union' ? directResultId : result?.directSourceId || directResultId];
            selectionKind.value = mode === 'union' ? 'body' : 'face';
        }
    }


    return {
        operation, historyEditId, canBoolean, extrudeBody, booleanDraft, operationTargets, directBooleanMode, directBooleanAvailable,
        createPrimitive, applyBoolean, startExtrude, updateExtrude, updateExtrudeLength, onExtrudeGesture,
        updateExtrudeResult, swapBooleanRoles, doneOperation, cancelOperation, editHistory,
        updateFaceOffsetInput, onDirectEdit, updateDirectBooleanMode,
    };
}
