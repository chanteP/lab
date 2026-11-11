import { computed, ref, shallowRef, type Ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import * as THREE from 'three';
import type { useMessage } from 'naive-ui';
import { buildEntityMesh } from '../engine/geometry';
import { evaluateShell, type ShellOpening } from '../engine/modeling/Shell';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
import type { Viewport, ViewTool } from '../engine/Viewport';
import type { ModelDocument, ModelEntity } from '../types';
import { cloneEntity } from '../utils/entity';

interface ShellOperationsOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    activeTool: Ref<ViewTool>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    popHistory: () => void;
    inputLength: (value: number | null) => number;
    canSelect: () => boolean;
}

type ShellSession = {
    originals: Map<string, ModelEntity>;
    anchors: GeometryAnchor[];
    previews: Map<string, THREE.BufferGeometry>;
};

/** Two-step shell transaction: viewport-only previews, then one document/history commit. */
export function useShellOperations(options: ShellOperationsOptions) {
    const { document, selectedIds, activeTool, viewport, message, pushHistory, popHistory, inputLength } = options;
    const thickness = ref(2);
    const session = shallowRef<ShellSession | null>(null);
    let previewGeneration = 0;
    const active = computed(() => !!session.value);
    const canShell = computed(() => options.canSelect() && !!viewport()?.getGeometryAnchors().length);

    function localOpenings(anchors: GeometryAnchor[], mesh: THREE.Mesh): ShellOpening[] {
        mesh.updateWorldMatrix(true, false);
        const inverse = mesh.matrixWorld.clone().invert();
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(inverse);
        return anchors.map((anchor) => ({
            vertices: anchor.vertices.map((point) => new THREE.Vector3(...point).applyMatrix4(inverse).toArray()),
            indices: [...anchor.indices],
            normal: new THREE.Vector3(...anchor.normal).applyMatrix3(normalMatrix).normalize().toArray(),
        }));
    }

    function buildPreviews(current: ShellSession, wallThickness: number) {
        const previews = new Map<string, THREE.BufferGeometry>();
        try {
            current.originals.forEach((original, id) => {
                const mesh = buildEntityMesh(original, document.value);
                try {
                    const anchors = current.anchors.filter((anchor) => anchor.id === id);
                    previews.set(id, evaluateShell(mesh.geometry, localOpenings(anchors, mesh), wallThickness));
                } finally {
                    mesh.geometry.dispose();
                    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
                }
            });
            return previews;
        } catch (error) {
            previews.forEach((geometry) => geometry.dispose());
            throw error;
        }
    }

    function showPreview(current: ShellSession, value: number) {
        const previews = buildPreviews(current, inputLength(value));
        viewport()?.setShellPreview([...previews].map(([entityId, geometry]) => ({ entityId, geometry })));
        current.previews = previews;
    }

    const schedulePreview = useDebounceFn((request: { value: number; generation: number }) => {
        if (!session.value || request.generation !== previewGeneration) return;
        try { showPreview(session.value, request.value); }
        catch (error) { message.error(`抽壳预览失败：${error instanceof Error ? error.message : error}`); }
    }, 120);

    function start() {
        const anchors = viewport()?.getGeometryAnchors().filter((anchor) => anchor.type === 'face' && anchor.planar) || [];
        const entities = anchors.map((anchor) => document.value.entities.find((entity) => entity.id === anchor.id)).filter(Boolean) as ModelEntity[];
        if (!anchors.length || !entities.length || entities.some((entity) => ['sketch', 'image'].includes(entity.kind))) return message.warning('请先选择实体的平面');
        finish();
        const current: ShellSession = {
            originals: new Map(entities.map((entity) => [entity.id, cloneEntity(entity)])),
            anchors: anchors.map((anchor) => ({ ...anchor, vertices: anchor.vertices.map((point) => [...point]), indices: [...anchor.indices] })),
            previews: new Map(),
        };
        session.value = current;
        try {
            showPreview(current, thickness.value);
            activeTool.value = 'shell';
            viewport()?.setTool('shell');
            selectedIds.value = [...current.originals.keys()];
            viewport()?.clearGeometrySelection();
        } catch (error) {
            finish();
            activeTool.value = 'select';
            viewport()?.setTool('select');
            message.error(`抽壳失败：${error instanceof Error ? error.message : error}`);
        }
    }

    function update(value: number) {
        if (!session.value || !(value > 0)) return;
        thickness.value = value;
        schedulePreview({ value, generation: ++previewGeneration });
    }

    function bake(entity: ModelEntity, geometry: THREE.BufferGeometry) {
        entity.meshGeometry = {
            positions: Array.from(geometry.attributes.position.array),
            normals: Array.from(geometry.attributes.normal?.array || []),
            sourceFaceIDs: Array.from(geometry.userData.sourceFaceIDs || []),
            indices: geometry.index ? Array.from(geometry.index.array) : [],
            mergeFromVert: Array.from(geometry.userData.mergeFromVert || []),
            mergeToVert: Array.from(geometry.userData.mergeToVert || []),
        };
        entity.compositeGeometry = true;
        entity.faceOffset = null;
        entity.revision = (entity.revision || 0) + 1;
        delete entity.axisBox;
        delete entity.edgeTreatments;
        delete entity.vertexTreatments;
    }

    function commit() {
        const current = session.value;
        if (!current) return false;
        const currentBodies = new Map<string, ModelEntity>();
        current.originals.forEach((_, id) => {
            const entity = document.value.entities.find((item) => item.id === id);
            if (entity) currentBodies.set(id, cloneEntity(entity));
        });
        if (currentBodies.size !== current.originals.size) return message.error('抽壳实体已不存在'), false;
        previewGeneration++;
        let finalPreviews: Map<string, THREE.BufferGeometry>;
        try { finalPreviews = buildPreviews(current, inputLength(thickness.value)); }
        catch (error) { message.error(`抽壳失败：${error instanceof Error ? error.message : error}`); return false; }
        pushHistory();
        try {
            current.originals.forEach((original, id) => {
                const geometry = finalPreviews.get(id);
                const index = document.value.entities.findIndex((item) => item.id === id);
                if (!geometry || index < 0) throw new Error('抽壳预览已失效');
                const entity = cloneEntity(original);
                bake(entity, geometry);
                document.value.entities[index] = entity;
            });
            finalPreviews.forEach((geometry) => geometry.dispose());
            return true;
        } catch (error) {
            currentBodies.forEach((entity, id) => {
                const index = document.value.entities.findIndex((item) => item.id === id);
                if (index >= 0) document.value.entities[index] = entity;
            });
            popHistory();
            finalPreviews.forEach((geometry) => geometry.dispose());
            message.error(`抽壳失败：${error instanceof Error ? error.message : error}`);
            return false;
        }
    }

    function finish() {
        previewGeneration++;
        if (!session.value) return;
        session.value = null;
        viewport()?.setShellPreview(null);
    }

    return { thickness, active, canShell, start, update, commit, finish };
}
