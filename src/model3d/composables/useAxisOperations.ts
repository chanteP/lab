import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue';
import * as THREE from 'three';
import type { useMessage } from 'naive-ui';
import { buildEntityMesh } from '../engine/geometry';
import { evaluateRevolve } from '../engine/modeling/Revolve';
import { entityProfileClosed } from '../engine/profiles';
import type { Viewport, ViewTool } from '../engine/Viewport';
import { createEntity, type ModelDocument, type ModelEntity, type SelectionKind, type Vec3 } from '../types';
import { uid } from '../utils/id';

interface AxisOperationsOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    selectedEntities: ComputedRef<ModelEntity[]>;
    selectionKind: Ref<SelectionKind>;
    activeTool: Ref<ViewTool>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
}

/** Previewed global-axis transforms and sketch-local revolve generation. */
export function useAxisOperations(options: AxisOperationsOptions) {
    const { document, selectedIds, selectedEntities, selectionKind, activeTool, viewport, message, pushHistory } = options;
    const mode = shallowRef<'rotate' | 'revolve' | null>(null);
    const axis = ref<'x' | 'y' | 'z'>('y');
    const angle = ref(90);
    const offset = ref(0);
    const active = computed(() => !!mode.value);
    const canRotate = computed(() => ['body', 'mixed', 'sketch'].includes(selectionKind.value || '') && selectedEntities.value.length > 0);
    const canRevolve = computed(() => selectionKind.value === 'sketch' && selectedEntities.value.length === 1 && selectedEntities.value[0].kind === 'sketch' && entityProfileClosed(selectedEntities.value[0]));

    function rotationMatrix(entity: ModelEntity) {
        const direction = new THREE.Vector3(axis.value === 'x' ? 1 : 0, axis.value === 'y' ? 1 : 0, axis.value === 'z' ? 1 : 0);
        const transform = new THREE.Matrix4().makeRotationAxis(direction, THREE.MathUtils.degToRad(angle.value));
        transform.premultiply(new THREE.Matrix4().makeTranslation(direction.multiplyScalar(offset.value)));
        const object = new THREE.Object3D();
        object.position.fromArray(entity.position);
        object.rotation.fromArray(entity.rotation);
        object.scale.fromArray(entity.scale);
        object.updateMatrixWorld(true);
        return transform.multiply(object.matrixWorld);
    }
    function showRotate() {
        const previews = selectedEntities.value.map((owner) => {
            const mesh = buildEntityMesh(owner, document.value);
            (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
            return { entityId: owner.id, geometry: mesh.geometry, matrix: rotationMatrix(owner) };
        });
        viewport()?.setShellPreview(previews);
    }
    function showRevolve() {
        const profile = selectedEntities.value[0];
        if (!profile) return;
        const geometry = evaluateRevolve(profile, document.value, axis.value === 'x' ? 'x' : 'y', angle.value);
        viewport()?.setShellPreview([{ entityId: profile.id, geometry }]);
    }
    function preview() {
        try { if (mode.value === 'rotate') showRotate(); else if (mode.value === 'revolve') showRevolve(); }
        catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    }
    function start(next: 'rotate' | 'revolve') {
        if (next === 'rotate' ? !canRotate.value : !canRevolve.value) return;
        finish();
        mode.value = next;
        angle.value = next === 'rotate' ? 90 : 360;
        offset.value = 0;
        if (next === 'revolve' && axis.value === 'z') axis.value = 'y';
        activeTool.value = next;
        viewport()?.setTool(next);
        preview();
    }
    function update(next: { axis?: 'x' | 'y' | 'z'; angle?: number; offset?: number }) {
        if (next.axis) axis.value = next.axis;
        if (next.angle !== undefined && Number.isFinite(next.angle)) angle.value = next.angle;
        if (next.offset !== undefined && Number.isFinite(next.offset)) offset.value = next.offset;
        preview();
    }
    function bake(body: ModelEntity, geometry: THREE.BufferGeometry) {
        body.meshGeometry = {
            positions: Array.from(geometry.attributes.position.array), normals: Array.from(geometry.attributes.normal?.array || []),
            indices: geometry.index ? Array.from(geometry.index.array) : [], sourceFaceIDs: Array.from(geometry.userData.sourceFaceIDs || []),
            mergeFromVert: Array.from(geometry.userData.mergeFromVert || []), mergeToVert: Array.from(geometry.userData.mergeToVert || []),
        };
        body.compositeGeometry = true;
    }
    function commit() {
        if (!mode.value) return false;
        try {
            if (mode.value === 'rotate') {
                pushHistory();
                selectedEntities.value.forEach((owner) => {
                    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
                    rotationMatrix(owner).decompose(position, quaternion, scale);
                    owner.position = position.toArray();
                    owner.rotation = new THREE.Euler().setFromQuaternion(quaternion).toArray() as Vec3;
                    owner.scale = scale.toArray();
                });
            } else {
                const profile = selectedEntities.value[0];
                const geometry = evaluateRevolve(profile, document.value, axis.value === 'x' ? 'x' : 'y', angle.value);
                const body = createEntity('extrude', uid());
                body.name = `车削 ${document.value.entities.filter((item) => item.name.startsWith('车削 ')).length + 1}`;
                body.parentId = profile.parentId;
                body.planeId = profile.planeId;
                body.position = [...profile.position]; body.rotation = [...profile.rotation]; body.scale = [...profile.scale];
                bake(body, geometry);
                geometry.dispose();
                pushHistory();
                document.value.entities.push(body);
                finish();
                profile.visible = false;
                selectedIds.value = [body.id];
                selectionKind.value = 'body';
                return true;
            }
            finish();
            return true;
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); return false; }
    }
    function finish() {
        if (!mode.value) return;
        mode.value = null;
        viewport()?.setShellPreview(null);
    }
    return { mode, axis, angle, offset, active, canRotate, canRevolve, start, update, commit, finish };
}
