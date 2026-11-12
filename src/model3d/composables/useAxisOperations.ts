import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue';
import * as THREE from 'three';
import type { useMessage } from 'naive-ui';
import { buildEntityMesh } from '../engine/geometry';
import { evaluateRevolve } from '../engine/modeling/Revolve';
import { entityProfileClosed } from '../engine/profiles';
import type { Viewport, ViewTool } from '../engine/Viewport';
import { createEntity, type ModelDocument, type ModelEntity, type SelectionKind, type SketchPlane, type Vec3 } from '../types';
import { uid } from '../utils/id';
import { cloneEntity } from '../utils/entity';

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
    const copy = ref(false);
    const active = computed(() => !!mode.value);
    const canRotate = computed(() => ['body', 'mixed', 'sketch'].includes(selectionKind.value || '') && selectedEntities.value.length > 0);
    const canRevolve = computed(() => {
        if (selectedEntities.value.length !== 1) return false;
        if (selectedEntities.value[0].kind === 'sketch') return entityProfileClosed(selectedEntities.value[0]);
        const anchor = viewport()?.getGeometryAnchor();
        return selectionKind.value === 'face' && anchor?.type === 'face' && anchor.planar;
    });

    function rotationMatrix(entity: ModelEntity) {
        const direction = new THREE.Vector3(axis.value === 'x' ? 1 : 0, axis.value === 'y' ? 1 : 0, axis.value === 'z' ? 1 : 0);
        const transform = new THREE.Matrix4().makeRotationAxis(direction, THREE.MathUtils.degToRad(angle.value));
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
            return { entityId: owner.id, geometry: mesh.geometry, matrix: rotationMatrix(owner), keepSource: copy.value };
        });
        viewport()?.setShellPreview(previews);
    }
    function faceProfile(): { profile: ModelEntity; plane: SketchPlane } {
        const anchor = viewport()?.getGeometryAnchor();
        if (!anchor) throw new Error('请先选择车削平面');
        const welded: number[] = [], unique: THREE.Vector3[] = [], keys = new Map<string, number>();
        anchor.vertices.forEach((point) => {
            const vector = new THREE.Vector3(...point), key = vector.toArray().map((value) => Math.round(value * 1e6)).join(',');
            if (!keys.has(key)) { keys.set(key, unique.length); unique.push(vector); }
            welded.push(keys.get(key)!);
        });
        const edges = new Map<string, { a: number; b: number; count: number }>();
        for (let index = 0; index < anchor.indices.length; index += 3) for (let corner = 0; corner < 3; corner++) {
            const a = welded[anchor.indices[index + corner]], b = welded[anchor.indices[index + (corner + 1) % 3]];
            const key = [a, b].sort((x, y) => x - y).join(':');
            const edge = edges.get(key);
            if (edge) edge.count++;
            else edges.set(key, { a, b, count: 1 });
        }
        const adjacency = new Map<number, number[]>();
        edges.forEach((edge) => {
            if (edge.count !== 1) return;
            adjacency.set(edge.a, [...adjacency.get(edge.a) || [], edge.b]);
            adjacency.set(edge.b, [...adjacency.get(edge.b) || [], edge.a]);
        });
        const visited = new Set<string>();
        const loops: number[][] = [];
        adjacency.forEach((_, start) => {
            if (visited.has(`${start}:${adjacency.get(start)![0]}`)) return;
            const loop: number[] = [];
            let previous = -1, current = start;
            do {
                const next = adjacency.get(current)?.find((candidate) => candidate !== previous && !visited.has(`${current}:${candidate}`));
                if (next === undefined) break;
                visited.add(`${current}:${next}`); visited.add(`${next}:${current}`);
                loop.push(current); previous = current; current = next;
            } while (current !== start);
            if (current === start && loop.length >= 3) loops.push(loop);
        });
        if (loops.length !== 1) throw new Error('车削面必须是单一边界的平面');
        const normal = new THREE.Vector3(...anchor.normal).normalize();
        const u = new THREE.Vector3(1, 0, 0);
        if (Math.abs(u.dot(normal)) > 0.9) u.set(0, 1, 0);
        u.addScaledVector(normal, -u.dot(normal)).normalize();
        const v = normal.clone().cross(u).normalize();
        const origin = new THREE.Vector3(...anchor.point);
        const plane: SketchPlane = { id: `revolve-face-${anchor.key}`, name: '车削面平面', kind: 'XY', origin: origin.toArray(), normal: normal.toArray(), u: u.toArray(), v: v.toArray(), visible: false };
        const profile = createEntity('sketch', 'revolve-face-profile');
        profile.planeId = plane.id;
        profile.profileType = 'polygon';
        profile.open = false;
        profile.points = loops[0].map((index) => {
            const delta = unique[index].clone().sub(origin);
            return [delta.dot(u), delta.dot(v)];
        });
        return { profile, plane };
    }
    function revolveInput() {
        if (selectedEntities.value[0]?.kind === 'sketch') return { profile: selectedEntities.value[0], document: document.value, world: false, keepSource: false };
        const { profile, plane } = faceProfile();
        return { profile, document: { ...document.value, planes: [...document.value.planes, plane] }, world: true, keepSource: true };
    }

    function showRevolve() {
        const source = selectedEntities.value[0];
        if (!source) return;
        const input = revolveInput();
        const geometry = evaluateRevolve(input.profile, input.document, axis.value === 'x' ? 'x' : 'y', angle.value, offset.value);
        viewport()?.setShellPreview([{ entityId: source.id, geometry, matrix: input.world ? new THREE.Matrix4() : undefined, keepSource: input.keepSource }]);
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
        copy.value = false;
        if (next === 'revolve' && axis.value === 'z') axis.value = 'y';
        activeTool.value = next;
        viewport()?.setTool(next);
        preview();
    }
    function update(next: { axis?: 'x' | 'y' | 'z'; angle?: number; offset?: number; copy?: boolean }) {
        if (next.axis) axis.value = next.axis;
        if (next.angle !== undefined && Number.isFinite(next.angle)) angle.value = next.angle;
        if (next.offset !== undefined && Number.isFinite(next.offset)) offset.value = next.offset;
        if (next.copy !== undefined) copy.value = next.copy;
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
                const rotatedIds: string[] = [];
                selectedEntities.value.forEach((source) => {
                    const owner = copy.value ? cloneEntity(source) : source;
                    if (copy.value) owner.id = uid();
                    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
                    rotationMatrix(source).decompose(position, quaternion, scale);
                    owner.position = position.toArray();
                    owner.rotation = new THREE.Euler().setFromQuaternion(quaternion).toArray().map(THREE.MathUtils.radToDeg) as Vec3;
                    owner.scale = scale.toArray();
                    if (copy.value) { document.value.entities.push(owner); rotatedIds.push(owner.id); }
                });
                if (copy.value) {
                    selectedIds.value = rotatedIds;
                    selectionKind.value = selectedEntities.value.every((item) => item.kind === 'sketch') ? 'sketch' : rotatedIds.length === 1 ? 'body' : 'mixed';
                }
            } else {
                const profile = selectedEntities.value[0];
                const input = revolveInput();
                const geometry = evaluateRevolve(input.profile, input.document, axis.value === 'x' ? 'x' : 'y', angle.value, offset.value);
                const body = createEntity('extrude', uid());
                body.name = `车削 ${document.value.entities.filter((item) => item.name.startsWith('车削 ')).length + 1}`;
                body.parentId = profile.parentId;
                body.planeId = profile.planeId;
                body.position = input.world ? [0, 0, 0] : [...profile.position];
                body.rotation = input.world ? [0, 0, 0] : [...profile.rotation];
                body.scale = input.world ? [1, 1, 1] : [...profile.scale];
                bake(body, geometry);
                geometry.dispose();
                pushHistory();
                document.value.entities.push(body);
                finish();
                if (!input.keepSource) profile.visible = false;
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
    return { mode, axis, angle, offset, copy, active, canRotate, canRevolve, start, update, commit, finish };
}
