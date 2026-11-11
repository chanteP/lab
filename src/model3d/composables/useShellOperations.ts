import { computed, ref, type Ref } from 'vue';
import * as THREE from 'three';
import type { useMessage } from 'naive-ui';
import { buildEntityMesh } from '../engine/geometry';
import { evaluateShell, type ShellOpening } from '../engine/modeling/Shell';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
import type { Viewport, ViewTool } from '../engine/Viewport';
import type { ModelDocument, ModelEntity, Point2 } from '../types';
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
};

/** One undoable shell transaction; thickness edits always rebuild from the original bodies. */
export function useShellOperations(options: ShellOperationsOptions) {
    const { document, selectedIds, activeTool, viewport, message, pushHistory, popHistory, inputLength } = options;
    const thickness = ref(2);
    const inputPosition = ref<Point2>([0, 0]);
    let session: ShellSession | null = null;
    const active = computed(() => !!session);
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

    function apply(current: ShellSession, wallThickness: number) {
        const currentBodies = new Map<string, ModelEntity>();
        current.originals.forEach((_, id) => {
            const entity = document.value.entities.find((item) => item.id === id);
            if (entity) currentBodies.set(id, cloneEntity(entity));
        });
        try {
            current.originals.forEach((original, id) => {
                const index = document.value.entities.findIndex((item) => item.id === id);
                if (index < 0) throw new Error('抽壳实体已不存在');
                const entity = cloneEntity(original);
                document.value.entities[index] = entity;
                const anchors = current.anchors.filter((anchor) => anchor.id === id);
                const mesh = buildEntityMesh(entity, document.value);
                const geometry = evaluateShell(mesh.geometry, localOpenings(anchors, mesh), wallThickness);
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
                geometry.dispose();
                mesh.geometry.dispose();
                (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
            });
        } catch (error) {
            currentBodies.forEach((entity, id) => {
                const index = document.value.entities.findIndex((item) => item.id === id);
                if (index >= 0) document.value.entities[index] = entity;
            });
            throw error;
        }
    }

    function start(event: MouseEvent) {
        const anchors = viewport()?.getGeometryAnchors().filter((anchor) => anchor.type === 'face' && anchor.planar) || [];
        const entities = anchors.map((anchor) => document.value.entities.find((entity) => entity.id === anchor.id)).filter(Boolean) as ModelEntity[];
        if (!anchors.length || !entities.length || entities.some((entity) => ['sketch', 'image'].includes(entity.kind))) return message.warning('请先选择实体的平面');
        finish();
        const current: ShellSession = {
            originals: new Map(entities.map((entity) => [entity.id, cloneEntity(entity)])),
            anchors: anchors.map((anchor) => ({ ...anchor, vertices: anchor.vertices.map((point) => [...point]), indices: [...anchor.indices] })),
        };
        pushHistory();
        try {
            apply(current, inputLength(thickness.value));
            session = current;
            activeTool.value = 'shell';
            viewport()?.setTool('shell');
            inputPosition.value = [event.clientX + 18, event.clientY + 18];
            selectedIds.value = [...current.originals.keys()];
            viewport()?.clearGeometrySelection();
        } catch (error) {
            popHistory();
            message.error(`抽壳失败：${error instanceof Error ? error.message : error}`);
        }
    }

    function update(value: number) {
        if (!session || !(value > 0)) return;
        const previous = thickness.value;
        try {
            apply(session, inputLength(value));
            thickness.value = value;
            viewport()?.clearGeometrySelection();
        } catch (error) {
            thickness.value = previous;
            message.error(`抽壳失败：${error instanceof Error ? error.message : error}`);
        }
    }

    function finish() { session = null; }

    return { thickness, inputPosition, active, canShell, start, update, finish };
}
