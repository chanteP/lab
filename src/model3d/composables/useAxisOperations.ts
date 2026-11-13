import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue';
import * as THREE from 'three';
import type { useMessage } from 'naive-ui';
import { evaluateRevolve, type LocalRevolveAxis, type RevolveAxis } from '../engine/modeling/Revolve';
import { entityProfileClosed } from '../engine/profiles';
import type { Viewport, ViewTool } from '../engine/Viewport';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
import { createEntity, type ModelDocument, type ModelEntity, type SelectionKind, type SketchPlane, type Vec3 } from '../types';
import { uid } from '../utils/id';
import { recoverSelectionTool } from '../utils/viewTool';

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

interface RevolveInput {
    profile: ModelEntity;
    document: ModelDocument;
    plane: SketchPlane;
    transform: THREE.Matrix4;
    world: boolean;
    keepSource: boolean;
    ownerId: string;
    parentId: string | null;
    selectionKind: SelectionKind;
}

/** Shapr3D-style profile -> axis -> angle revolve transaction. */
export function useAxisOperations(options: AxisOperationsOptions) {
    const { document, selectedIds, selectedEntities, selectionKind, activeTool, viewport, message, pushHistory } = options;
    const recover = () => {
        finish();
        recoverSelectionTool(activeTool, viewport);
    };
    const session = shallowRef<RevolveInput | null>(null);
    const axis = shallowRef<RevolveAxis | null>(null);
    const localAxis = shallowRef<LocalRevolveAxis | null>(null);
    const gridAxis = ref<'x' | 'y' | 'z' | null>(null);
    const angle = ref(360);
    const offset = ref(0);
    const active = computed(() => !!session.value);
    const axisLabel = computed(() => axis.value?.label || '点击草图直线或实体线性边');
    const profileName = computed(() => session.value?.profile.name || '');

    const canRevolve = computed(() => {
        if (selectedEntities.value.length !== 1 || selectedEntities.value[0].kind === 'image') return false;
        if (selectedEntities.value[0].kind === 'sketch') return entityProfileClosed(selectedEntities.value[0]);
        const anchor = viewport()?.getGeometryAnchor();
        return selectionKind.value === 'face' && anchor?.type === 'face' && anchor.planar;
    });

    function faceProfile(anchor: GeometryAnchor): { profile: ModelEntity; plane: SketchPlane } {
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
        const first = unique[loops[0][0]];
        let minU = first.dot(u), minV = first.dot(v);
        loops[0].forEach((index) => {
            minU = Math.min(minU, unique[index].dot(u));
            minV = Math.min(minV, unique[index].dot(v));
        });
        const origin = first.clone().addScaledVector(u, minU - first.dot(u)).addScaledVector(v, minV - first.dot(v));
        const plane: SketchPlane = { id: `revolve-face-${anchor.key}`, name: '车削面平面', kind: 'XY', origin: origin.toArray(), normal: normal.toArray(), u: u.toArray(), v: v.toArray(), visible: false };
        const profile = createEntity('sketch', 'revolve-face-profile');
        profile.name = selectedEntities.value[0].name;
        profile.planeId = plane.id;
        profile.profileType = 'polygon';
        profile.open = false;
        profile.points = loops[0].map((index) => {
            const delta = unique[index].clone().sub(origin);
            return [delta.dot(u), delta.dot(v)];
        });
        return { profile, plane };
    }

    function revolveInput(): RevolveInput {
        const owner = selectedEntities.value[0];
        const plane = owner.kind === 'sketch'
            ? document.value.planes.find((item) => item.id === owner.planeId)
            : null;
        if (owner.kind === 'sketch' && !plane) throw new Error('车削草图必须位于显式平面');
        const converted = owner.kind === 'sketch' ? null : faceProfile(viewport()?.getGeometryAnchor()!);
        const profile = owner.kind === 'sketch' ? owner : converted!.profile;
        const targetPlane = plane || converted!.plane;
        const transform = new THREE.Object3D();
        if (owner.kind === 'sketch') {
            transform.position.fromArray(owner.position);
            transform.rotation.set(...owner.rotation.map(THREE.MathUtils.degToRad) as Vec3);
            transform.scale.fromArray(owner.scale);
            transform.updateMatrixWorld(true);
        }
        return {
            profile,
            document: converted ? { ...document.value, planes: [...document.value.planes, targetPlane] } : document.value,
            plane: targetPlane,
            transform: transform.matrixWorld.clone(),
            world: !!converted,
            keepSource: !!converted,
            ownerId: owner.id,
            parentId: owner.parentId,
            selectionKind: selectionKind.value,
        };
    }

    function planeMatrix(input = session.value) {
        if (!input) return null;
        return new THREE.Matrix4().makeBasis(
            new THREE.Vector3(...input.plane.u), new THREE.Vector3(...input.plane.v), new THREE.Vector3(...input.plane.normal),
        ).setPosition(new THREE.Vector3(...input.plane.origin)).multiply(input.transform);
    }

    function toLocalAxis(candidate: RevolveAxis): LocalRevolveAxis | null {
        const matrix = planeMatrix();
        if (!matrix) return null;
        const point = new THREE.Vector3(...candidate.point);
        const direction = new THREE.Vector3(...candidate.direction).normalize();
        const normal = new THREE.Vector3(...session.value!.plane.normal).transformDirection(matrix);
        const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
        if (Math.abs(normal.dot(direction)) > 1e-5 || Math.abs(normal.dot(point.clone().sub(origin))) > 1e-4) return null;
        const inverse = matrix.clone().invert();
        const localPoint = point.applyMatrix4(inverse);
        const localDirection = direction.transformDirection(inverse);
        if (Math.hypot(localDirection.x, localDirection.y) < 1e-8) return null;
        return { origin: [localPoint.x, localPoint.y], direction: [localDirection.x, localDirection.y] };
    }

    const gridAxes = computed(() => {
        if (!session.value) return [];
        return (['x', 'y', 'z'] as const).filter((value) => {
            const direction: Vec3 = value === 'x' ? [1, 0, 0] : value === 'y' ? [0, 1, 0] : [0, 0, 1];
            return !!toLocalAxis({ point: [0, 0, 0], direction, label: `${value.toUpperCase()} 轴` });
        }).map((value) => ({ label: `${value.toUpperCase()} 轴`, value }));
    });

    function restoreProfileSelection() {
        if (!session.value) return;
        selectedIds.value = [session.value.ownerId];
        selectionKind.value = session.value.selectionKind;
        activeTool.value = 'revolve';
        viewport()?.setTool('revolve');
    }

    function preview() {
        if (!session.value || !localAxis.value) { viewport()?.setShellPreview(null); return; }
        try {
            const geometry = evaluateRevolve(session.value.profile, session.value.document, localAxis.value, angle.value, offset.value);
            viewport()?.setShellPreview([{
                entityId: session.value.ownerId, geometry,
                matrix: session.value.world ? new THREE.Matrix4() : undefined,
                keepSource: session.value.keepSource,
            }]);
        } catch (error) {
            viewport()?.setShellPreview(null);
            message.error(error instanceof Error ? error.message : String(error));
            recover();
        }
    }

    function setAxis(candidate: RevolveAxis) {
        const converted = toLocalAxis(candidate);
        if (!converted) { message.error('旋转轴必须与截面位于同一平面'); recover(); return false; }
        axis.value = candidate;
        localAxis.value = converted;
        preview();
        restoreProfileSelection();
        return true;
    }

    function pickAxis(candidate: RevolveAxis | null) {
        if (!session.value) return false;
        if (!candidate) { message.warning('请选择草图直线或实体线性边作为旋转轴'); recover(); }
        else {
            gridAxis.value = null;
            setAxis(candidate);
        }
        restoreProfileSelection();
        return true;
    }

    function start() {
        if (!canRevolve.value) return;
        finish();
        session.value = revolveInput();
        angle.value = 360;
        offset.value = 0;
        axis.value = null;
        localAxis.value = null;
        gridAxis.value = null;
        activeTool.value = 'revolve';
        viewport()?.setTool('revolve');
        viewport()?.setShellPreview(null);
    }

    function update(next: { axis?: 'x' | 'y' | 'z'; angle?: number; offset?: number; local?: boolean }) {
        if (next.axis) {
            const direction: Vec3 = next.axis === 'x' ? [1, 0, 0] : next.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
            let candidate: RevolveAxis = { point: [0, 0, 0], direction, label: `${next.axis.toUpperCase()} 轴` };
            if (next.local) {
                const matrix = planeMatrix()!;
                candidate = {
                    point: new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),
                    direction: new THREE.Vector3(...direction).transformDirection(matrix).toArray(),
                    label: `${next.axis.toUpperCase()} 轴`,
                };
            }
            if (setAxis(candidate)) gridAxis.value = next.axis;
        }
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
        if (!session.value) return false;
        if (!localAxis.value) { message.error('请先选择旋转轴'); recover(); return false; }
        try {
            const input = session.value;
            const geometry = evaluateRevolve(input.profile, input.document, localAxis.value, angle.value, offset.value);
            const body = createEntity('extrude', uid());
            body.name = `车削 ${document.value.entities.filter((item) => item.name.startsWith('车削 ')).length + 1}`;
            body.parentId = input.parentId;
            body.planeId = input.profile.planeId;
            body.position = input.world ? [0, 0, 0] : [...input.profile.position];
            body.rotation = input.world ? [0, 0, 0] : [...input.profile.rotation];
            body.scale = input.world ? [1, 1, 1] : [...input.profile.scale];
            bake(body, geometry);
            geometry.dispose();
            pushHistory();
            document.value.entities.push(body);
            if (!input.keepSource) input.profile.visible = false;
            selectedIds.value = [body.id];
            selectionKind.value = 'body';
            finish();
            return true;
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); recover(); return false; }
    }

    function finish() {
        session.value = null;
        axis.value = null;
        localAxis.value = null;
        gridAxis.value = null;
        viewport()?.setShellPreview(null);
    }

    return { active, axis, axisLabel, profileName, gridAxis, gridAxes, angle, offset, canRevolve, start, update, pickAxis, commit, finish };
}
