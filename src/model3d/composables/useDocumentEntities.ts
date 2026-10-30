import { computed, ref, type ComputedRef, type Ref } from 'vue';
import * as THREE from 'three';
import { useMessage } from 'naive-ui';
import type { OutlinerNode } from '../components/entity/EntityTree.vue';
import type { Viewport, ViewTool } from '../engine/Viewport';
import { constraintRules } from '../engine/sketchConstraints';
import { uid } from '../utils/id';
import { cloneEntity } from '../utils/entity';
import type {
    ModelDocument, ModelEntity, PrimaryPanel, SelectionKind, SketchPlane, Vec3,
} from '../types';

interface DocumentEntitiesOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    selected: ComputedRef<ModelEntity | null>;
    selectionKind: Ref<SelectionKind>;
    activeTool: Ref<ViewTool>;
    activePanel: Ref<PrimaryPanel | null>;
    activePlaneId: Ref<string | null>;
    activePlane: ComputedRef<SketchPlane | null>;
    lastFace: Ref<{ bodyId: string; normal: Vec3; point: Vec3 } | null>;
    sketchMode: Ref<boolean>;
    editingSketchId: Ref<string | null>;
    activeConstraintRule: Ref<{ entityId: string; index: number; ruleId: string } | null>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    inputLength: (value: number | null) => number | null;
    setTool: (tool: ViewTool) => void;
    selectSketchEntity: (id: string, additive?: boolean) => void;
    cancelSketch: () => void;
    clearSketchSelection: () => void;
    beginSketch: (planeId?: string) => void;
    refreshSketch: () => void;
}

/** Document entity mutations, planes, folders and outliner interactions. */
export function useDocumentEntities(options: DocumentEntitiesOptions) {
    const {
        document, selectedIds, selected, selectionKind, activeTool, activePanel, activePlaneId, activePlane,
        lastFace, sketchMode, editingSketchId, activeConstraintRule, viewport, message, pushHistory, inputLength,
        setTool, selectSketchEntity, cancelSketch, clearSketchSelection, beginSketch, refreshSketch,
    } = options;
    const contextMenu = ref<{ x: number; y: number; node: OutlinerNode } | null>(null);
    const showRename = ref(false);
    const renameValue = ref('');
    const renameTarget = ref<OutlinerNode | null>(null);

    const treeNodes = computed(() => {
        // Folders and entities share one parent graph, so either can contain nested nodes.
        const build = (parentId: string | null, trail: string[] = []): OutlinerNode[] => {
            const folders = document.value.folders.filter((item) => item.parentId === parentId).map((folder) => ({ folder, order: 0 }));
            const entities = document.value.entities.filter((item) => item.kind !== 'sketch' && item.parentId === parentId).map((entity) => ({ entity, order: 1 }));
            return [...folders, ...entities].flatMap((entry: any) => {
                const item = entry.folder || entry.entity;
                if (trail.includes(item.id)) return [];
                return [{
                    id: item.id, kind: entry.folder ? 'folder' : 'entity', name: item.name, visible: item.visible,
                    children: build(item.id, [...trail, item.id]),
                } as OutlinerNode];
            });
        };
        const planeNodes = document.value.planes.map((plane) => ({
            id: plane.id, kind: 'plane', name: plane.name, visible: plane.visible,
            children: sketchMode.value && plane.id === activePlaneId.value
                ? document.value.entities.filter((item) => item.kind === 'sketch' && item.planeId === plane.id).map((item) => ({ id: item.id, kind: 'entity', name: item.name, visible: item.visible, children: [] } as OutlinerNode))
                : [],
        } as OutlinerNode));
        return [...planeNodes, ...build(null)];
    });


    function selectEntity(id: string | null, additive = false) {
        if (id && sketchMode.value && document.value.entities.find((entity) => entity.id === id)?.kind === 'sketch') return selectSketchEntity(id, additive);
        if (!id) {
            if (!additive) selectedIds.value = [];
            if (!additive) selectionKind.value = null;
            return;
        }
        selectedIds.value = additive
            ? selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id]
            : [id];
    }

    function updateEntity(key: keyof ModelEntity, value: any) {
        if (!selected.value || value === null) return;
        pushHistory();
        (selected.value as any)[key] = value;
    }
    function updateLengthEntity(key: keyof ModelEntity, value: number | null) { updateEntity(key, inputLength(value)); }
    function updateEdgeSize(value: number | null) {
        if (!selected.value || !['fillet', 'chamfer'].includes(activeTool.value)) return;
        updateEntity('edge', { type: activeTool.value, size: inputLength(value) || 0, segments: selected.value.edge?.segments || 6 });
    }
    function updateVector(key: 'position' | 'rotation' | 'scale', index: number, value: number | null) {
        if (!selected.value || value === null) return;
        pushHistory();
        selected.value[key][index] = key === 'scale' ? Math.max(0.01, value) : key === 'position' ? inputLength(value)! : value;
    }
    function removeSelected() {
        if (selectedIds.value.length) deleteNodeIds(selectedIds.value);
    }
    function removeConstraintsForEdge(entityId: string, index: number) {
        if (activeConstraintRule.value?.entityId === entityId && activeConstraintRule.value.index === index) {
            activeConstraintRule.value = null;
            viewport()?.setActiveConstraintRule(null);
        }
        document.value.entities.forEach((entity) => {
            if (!entity.edgeConstraints) return;
            Object.entries(entity.edgeConstraints).forEach(([key, constraints]) => constraintRules(constraints).forEach((rule) => {
                if ((entity.id === entityId && Number(key) === index) || (rule.reference?.entityId === entityId && rule.reference.index === index)) delete entity.edgeConstraints![Number(key)];
            }));
        });
    }
    function removeConstraintsForEntity(entityId: string) {
        if (activeConstraintRule.value?.entityId === entityId) {
            activeConstraintRule.value = null;
            viewport()?.setActiveConstraintRule(null);
        }
        document.value.entities.forEach((entity) => {
            if (entity.id === entityId) {
                entity.edgeConstraints = {};
                entity.constraintEdges = [];
                delete entity.shapeConstraint;
            } else if (entity.edgeConstraints) {
                Object.entries(entity.edgeConstraints).forEach(([key, rules]) => {
                    if (!Array.isArray(rules) && rules.reference?.entityId === entityId) delete entity.edgeConstraints![Number(key)];
                });
            }
        });
    }
    function deleteNodeIds(ids: string[]) {
        const planeSketchIds = document.value.entities.filter((item) => item.kind === 'sketch' && item.planeId && ids.includes(item.planeId)).map((item) => item.id);
        const allIds = [...new Set([...ids, ...planeSketchIds])];
        const remainingSelectedIds = selectedIds.value.filter((id) => !allIds.includes(id));
        const removedEditedSketch = !!editingSketchId.value && allIds.includes(editingSketchId.value);
        const referenced = document.value.entities.find((item) => !allIds.includes(item.id) && ((item.kind === 'boolean' && item.operands?.some((id) => allIds.includes(id))) || (item.profileId && allIds.includes(item.profileId))));
        if (referenced) return message.warning(`请先删除依赖它的「${referenced.name}」`);
        allIds.forEach(removeConstraintsForEntity);
        pushHistory();
        if (sketchMode.value && activePlaneId.value && ids.includes(activePlaneId.value)) cancelSketch();
        allIds.forEach((id) => {
            const item = document.value.entities.find((entity) => entity.id === id);
            if (item?.kind === 'boolean') item.operands?.forEach((operandId) => {
                const operand = document.value.entities.find((entity) => entity.id === operandId);
                if (operand) operand.visible = true;
            });
            document.value.folders.filter((folder) => folder.parentId === id).forEach((folder) => folder.parentId = null);
            document.value.entities.filter((entity) => entity.parentId === id).forEach((entity) => entity.parentId = null);
        });
        document.value.entities = document.value.entities.filter((item) => !allIds.includes(item.id));
        document.value.folders = document.value.folders.filter((item) => !allIds.includes(item.id));
        document.value.planes = document.value.planes.filter((item) => !allIds.includes(item.id));
        if (activePlaneId.value && allIds.includes(activePlaneId.value)) {
            activePlaneId.value = document.value.planes[0]?.id || null;
            viewport()?.setActivePlane(activePlane.value);
        }
        if (removedEditedSketch) clearSketchSelection();
        selectedIds.value = remainingSelectedIds;
        selectionKind.value = remainingSelectedIds.length ? selectionKind.value : null;
    }
    function duplicateSelected() {
        const item = selected.value;
        if (!item || item.kind === 'boolean') return;
        pushHistory();
        const copy = cloneEntity(item);
        copy.id = uid();
        copy.name = `${item.name} 副本`;
        copy.position = [...copy.position];
        copy.position[0] += 10;
        copy.position[2] += 10;
        document.value.entities.push(copy);
        selectedIds.value = [copy.id];
    }

    function createFolder() {
        pushHistory();
        const folder = { id: uid(), name: `文件夹 ${document.value.folders.length + 1}`, parentId: null, visible: true };
        document.value.folders.push(folder);
        selectedIds.value = [folder.id];
    }
    function openNodeContext(node: OutlinerNode, event: MouseEvent) {
        if (!selectedIds.value.includes(node.id)) selectedIds.value = [node.id];
        contextMenu.value = { node, x: Math.min(event.clientX, window.innerWidth - 150), y: Math.min(event.clientY, window.innerHeight - 100) };
    }
    function requestRename(node: OutlinerNode) {
        renameTarget.value = node;
        renameValue.value = node.name;
        showRename.value = true;
        contextMenu.value = null;
    }
    function applyRename() {
        const target = renameTarget.value;
        const name = renameValue.value.trim();
        if (!target || !name) return;
        pushHistory();
        const collection = target.kind === 'folder' ? document.value.folders : document.value.entities;
        const item = collection.find((entry) => entry.id === target.id);
        if (item) item.name = name;
        showRename.value = false;
    }
    function deleteContextNodes() {
        const menu = contextMenu.value;
        if (!menu) return;
        const ids = selectedIds.value.includes(menu.node.id) ? [...selectedIds.value] : [menu.node.id];
        contextMenu.value = null;
        deleteNodeIds(ids);
    }
    function reparentNodes(ids: string[], targetId: string | null) {
        // A node may contain folders or entities, but dragging into its own descendant is rejected.
        const nodes = new Map<string, { parentId: string | null }>();
        document.value.folders.forEach((item) => nodes.set(item.id, item));
        document.value.entities.forEach((item) => nodes.set(item.id, item));
        let cursor = targetId;
        while (cursor) {
            if (ids.includes(cursor)) return message.warning('不能移动到节点自身或其子节点下');
            cursor = nodes.get(cursor)?.parentId || null;
        }
        const valid = ids.filter((id) => id !== targetId && nodes.has(id));
        if (!valid.length) return;
        pushHistory();
        valid.forEach((id) => nodes.get(id)!.parentId = targetId);
    }
    function createPlane(kind: SketchPlane['kind'] = 'XZ', referenceSelectedPlane = false) {
        const referencePlane = referenceSelectedPlane && selectionKind.value === 'plane' ? activePlane.value : null;
        const useFace = selectionKind.value === 'face' && !!selected.value && lastFace.value?.bodyId === selected.value.id;
        const normal = referencePlane ? new THREE.Vector3(...referencePlane.normal) : useFace ? new THREE.Vector3(...lastFace.value!.normal).normalize() : new THREE.Vector3(kind === 'YZ' ? 1 : 0, kind === 'XZ' ? 1 : 0, kind === 'XY' ? 1 : 0);
        const reference = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const u = referencePlane ? new THREE.Vector3(...referencePlane.u) : useFace ? reference.clone().cross(normal).normalize() : kind === 'YZ' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const v = referencePlane ? new THREE.Vector3(...referencePlane.v) : useFace ? normal.clone().cross(u).normalize() : kind === 'XZ' ? new THREE.Vector3(0, 0, -1) : kind === 'YZ' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const origin = referencePlane ? [...referencePlane.origin] as Vec3 : useFace ? lastFace.value!.point : [0, 0, 0] as Vec3;
        const plane: SketchPlane = {
            id: uid(), name: useFace ? `面平面 ${document.value.planes.length + 1}` : `${referencePlane?.kind || kind} 平面 ${document.value.planes.length + 1}`,
            kind: referencePlane?.kind || (useFace ? 'XY' : kind), origin, normal: normal.toArray(), u: u.toArray(), v: v.toArray(), visible: true,
        };
        pushHistory();
        document.value.planes.push(plane);
        activePlaneId.value = plane.id;
        selectedIds.value = [plane.id];
        selectionKind.value = 'plane';
        viewport()?.setActivePlane(plane);
        setTool('select');
        activePanel.value = null;
    }
    function constructPlane() { createPlane('XZ', true); }
    function createPlaneAndSketch(kind: SketchPlane['kind']) { createPlane(kind); beginSketch(activePlaneId.value!); }
    function selectPlane(id: string) {
        activePlaneId.value = id;
        selectedIds.value = [id];
        selectionKind.value = 'plane';
        activePanel.value = null;
        viewport()?.setActivePlane(activePlane.value);
        setTool('select');
    }
    function activateTreeNode(id: string) {
        if (document.value.planes.some((plane) => plane.id === id)) beginSketch(id);
    }
    function toggleNodeVisibility(id: string) {
        pushHistory();
        const setEntity = (entity: ModelEntity, visible: boolean) => entity.visible = visible;
        const folder = document.value.folders.find((item) => item.id === id);
        if (folder) {
            const visible = !folder.visible;
            const apply = (parentId: string, value: boolean) => {
                document.value.entities.filter((item) => item.parentId === parentId).forEach((item) => setEntity(item, value));
                document.value.folders.filter((item) => item.parentId === parentId).forEach((item) => { item.visible = value; apply(item.id, value); });
            };
            folder.visible = visible;
            apply(id, visible);
            return;
        }
        const plane = document.value.planes.find((item) => item.id === id);
        if (plane) {
            plane.visible = !plane.visible;
            if (!plane.visible && activePlaneId.value === plane.id && sketchMode.value) cancelSketch();
            return;
        }
        const entity = document.value.entities.find((item) => item.id === id);
        if (entity) entity.visible = !entity.visible;
    }
    function changeActivePlane(id: string) {
        activePlaneId.value = id;
        viewport()?.setActivePlane(activePlane.value);
        refreshSketch();
    }

    return {
        treeNodes, contextMenu, showRename, renameValue, renameTarget,
        selectEntity, updateEntity, updateLengthEntity, updateEdgeSize, updateVector,
        removeSelected, removeConstraintsForEdge, removeConstraintsForEntity, deleteNodeIds, duplicateSelected,
        createFolder, openNodeContext, requestRename, applyRename, deleteContextNodes, reparentNodes,
        createPlane, constructPlane, createPlaneAndSketch, selectPlane, activateTreeNode,
        toggleNodeVisibility, changeActivePlane,
    };
}
