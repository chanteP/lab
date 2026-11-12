import * as THREE from 'three';
import type { Ref } from 'vue';
import { buildEntityMesh } from '../engine/geometry';
import { buildMeshTopology } from '../engine/topology/MeshTopology';
import { entityProfileClosed } from '../engine/profiles';
import type { GeometryAnchor } from '../engine/viewport/GeometrySelector';
import type { Viewport } from '../engine/Viewport';
import type { BooleanOperation, ModelDocument, ModelEntity, PrimitiveKind, ProjectRecord, SelectionKind, SketchElementRef, SketchPlane, Vec3 } from '../types';
import { createEntity } from '../types';
import { uniqueEntityName, uniqueSketchName } from '../utils/entity';
import { uid } from '../utils/id';
import type { SketchConstraintType } from '../engine/sketchConstraints';

export interface Model3dAgentBridge {
    document: Ref<ModelDocument>;
    project: Ref<ProjectRecord>;
    projects: Ref<ProjectRecord[]>;
    selectedIds: Ref<string[]>;
    selectionKind: Ref<SelectionKind>;
    selectedFacePlanar: Ref<boolean>;
    selectedEdges: Ref<SketchElementRef[]>;
    selectedShapes: Ref<string[]>;
    activePlaneId: Ref<string | null>;
    viewport: () => Viewport | undefined;
    newProject: (name: string) => Promise<void>;
    openProject: (id: string) => Promise<void>;
    duplicateProject: () => Promise<void>;
    removeProject: () => Promise<void>;
    flushSave: () => Promise<void>;
    pushHistory: () => void;
    deleteEntities: (ids: string[]) => void;
    startExtrude: (profileId: string) => void;
    updateExtrude: (key: 'depth' | 'direction' | 'sideMode' | 'draftAngle', value: unknown) => void;
    doneOperation: () => void;
    applyBoolean: (type: BooleanOperation) => void;
    startShell: () => void;
    updateShell: (thickness: number) => void;
    commitShell: () => boolean;
    finishShell: () => void;
    updateFaceOffset: (distance: number) => void;
    startAxis: () => void;
    updateAxis: (value: { axis?: 'x' | 'y' | 'z'; angle?: number; offset?: number; local?: boolean }) => void;
    commitAxis: () => boolean;
    finishAxis: () => void;
    applyConstraint: (type: SketchConstraintType) => void;
    undo: () => void;
    redo: () => void;
}

type ToolResult = { content: { type: string; text: string }[]; structuredContent?: unknown; isError?: boolean };
type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown>; execute: (bridge: Model3dAgentBridge, args: Record<string, any>) => Promise<unknown> | unknown };
const result = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
const projectSummary = (project: ProjectRecord) => ({ id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt });
const entitySummary = (entity: ModelEntity) => ({ id: entity.id, kind: entity.kind, name: entity.name, parentId: entity.parentId, planeId: entity.planeId, visible: entity.visible, position: entity.position, rotation: entity.rotation, scale: entity.scale });
const state = (bridge: Model3dAgentBridge) => ({ project: projectSummary(bridge.project.value), selectedIds: [...bridge.selectedIds.value], selectionKind: bridge.selectionKind.value, entityCount: bridge.document.value.entities.length, planeCount: bridge.document.value.planes.length });

function entity(bridge: Model3dAgentBridge, id: string) {
    const found = bridge.document.value.entities.find((item) => item.id === id);
    if (!found) throw new Error(`找不到实体 ${id}`);
    return found;
}
function selectBodies(bridge: Model3dAgentBridge, ids: string[]) {
    if (!ids.length) throw new Error('至少需要一个实体 id');
    ids.forEach((id) => entity(bridge, id));
    bridge.selectedIds.value = [...ids];
    bridge.selectionKind.value = ids.length === 1 ? 'body' : 'mixed';
    bridge.selectedFacePlanar.value = false;
    bridge.viewport()?.clearGeometrySelection();
}
function faceAnchor(bridge: Model3dAgentBridge, entityId: string, faceId: string): GeometryAnchor {
    const owner = entity(bridge, entityId);
    const mesh = buildEntityMesh(owner, bridge.document.value);
    try {
        mesh.updateWorldMatrix(true, false);
        const topology = buildMeshTopology(mesh.geometry, owner.id, owner, bridge.document.value);
        const face = topology.faces.find((item) => item.id === faceId);
        if (!face) throw new Error(`实体 ${entityId} 不存在面 ${faceId}`);
        const vertices: Vec3[] = [], indices: number[] = [];
        face.triangleIds.forEach((id) => topology.triangles[id].renderVertices.forEach((index) => {
            vertices.push(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld).toArray());
            indices.push(indices.length);
        }));
        return {
            id: entityId, key: `${entityId}:face:${face.id}`, type: 'face', planar: face.planar,
            normal: new THREE.Vector3(...face.normal).transformDirection(mesh.matrixWorld).toArray(), localNormal: [...face.normal],
            point: new THREE.Vector3(...face.point).applyMatrix4(mesh.matrixWorld).toArray(), vertices, indices,
            faceIds: [face.id], revision: topology.revision,
        };
    } finally {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
    }
}
function selectFaces(bridge: Model3dAgentBridge, refs: { entityId: string; faceId: string }[]) {
    if (!refs.length) throw new Error('至少需要一个开口面');
    const anchors = refs.map((ref) => faceAnchor(bridge, ref.entityId, ref.faceId));
    if (anchors.some((anchor) => !anchor.planar)) throw new Error('当前仅支持平面抽壳');
    bridge.selectedIds.value = [...new Set(refs.map((ref) => ref.entityId))];
    bridge.selectionKind.value = 'face';
    bridge.selectedFacePlanar.value = true;
    bridge.viewport()?.setGeometryAnchors(anchors);
}
function inspectEntity(bridge: Model3dAgentBridge, id: string) {
    const owner = entity(bridge, id);
    const mesh = buildEntityMesh(owner, bridge.document.value);
    try {
        const topology = buildMeshTopology(mesh.geometry, owner.id, owner, bridge.document.value);
        return {
            ...entitySummary(owner),
            faces: topology.faces.map((face) => ({ id: face.id, normal: face.normal, point: face.point, planar: face.planar, adjacentFaceIds: face.adjacentFaceIds })),
            edges: topology.logicalEdges.map((edge) => ({ id: edge.id, faceIds: edge.faceIds, kind: edge.kind })),
        };
    } finally {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
    }
}
function updateEntity(bridge: Model3dAgentBridge, id: string, changes: Record<string, unknown>) {
    const owner = entity(bridge, id);
    const allowed = ['name', 'color', 'visible', 'width', 'height', 'depth', 'radius', 'tubeRadius', 'position', 'rotation', 'scale', 'sideMode', 'direction', 'draftAngle'];
    const geometryKeys = ['width', 'height', 'depth', 'radius', 'tubeRadius', 'sideMode', 'direction', 'draftAngle'];
    bridge.pushHistory?.();
    allowed.forEach((key) => { if (key in changes) (owner as any)[key] = changes[key]; });
    if (geometryKeys.some((key) => key in changes)) {
        delete owner.meshGeometry; delete owner.axisBox; delete owner.compositeGeometry; delete owner.edgeTreatments; delete owner.vertexTreatments;
    }
    return entitySummary(owner);
}
function planeFromInput(input: Record<string, any> | undefined): SketchPlane {
    const kind = input?.kind || 'XZ';
    if (!['XZ', 'XY', 'YZ'].includes(kind)) throw new Error('plane.kind 仅支持 XZ/XY/YZ');
    return {
        id: uid(), name: input?.name || `${kind} 平面`, kind,
        origin: input?.origin || [0, 0, 0],
        normal: input?.normal || (kind === 'YZ' ? [1, 0, 0] : kind === 'XZ' ? [0, 1, 0] : [0, 0, 1]),
        u: input?.u || (kind === 'YZ' ? [0, 1, 0] : [1, 0, 0]),
        v: input?.v || (kind === 'XZ' ? [0, 0, -1] : kind === 'YZ' ? [0, 0, 1] : [0, 1, 0]),
        visible: true,
    };
}
function createSketch(bridge: Model3dAgentBridge, args: Record<string, any>) {
    const profile = args.profile || {};
    const type = profile.type || 'polygon';
    if (!Array.isArray(profile.points) || profile.points.length < 2) throw new Error('profile.points 至少需要两个平面坐标点');
    const plane = args.planeId ? bridge.document.value.planes.find((item) => item.id === args.planeId) : planeFromInput(args.plane);
    if (!plane) throw new Error(`找不到草图平面 ${args.planeId}`);
    bridge.pushHistory?.();
    if (!args.planeId) bridge.document.value.planes.push(plane);
    const sketch = createEntity('sketch', uid());
    sketch.name = args.name || uniqueSketchName(bridge.document.value, type);
    sketch.planeId = plane.id;
    sketch.profileType = type;
    sketch.points = profile.points.map((point: number[]) => [...point]);
    sketch.sides = profile.sides;
    sketch.open = profile.open ?? ['line', 'arc'].includes(type);
    sketch.sectorAngle = profile.sectorAngle;
    sketch.profileStartAngle = profile.profileStartAngle;
    sketch.curves = profile.curves || {};
    sketch.analyticCurves = profile.analyticCurves || {};
    bridge.document.value.entities.push(sketch);
    bridge.activePlaneId.value = plane.id;
    bridge.selectedIds.value = [sketch.id];
    bridge.selectionKind.value = 'sketch';
    return entitySummary(sketch);
}
const tools: ToolDefinition[] = [
    {
        name: 'model3d_project', description: '项目处理：list/get/create/open/duplicate/rename/delete/save。项目保存在当前浏览器 IndexedDB。',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'get', 'create', 'open', 'duplicate', 'rename', 'delete', 'save'] }, id: { type: 'string' }, name: { type: 'string' } }, required: ['action'] },
        execute: async (bridge, args) => {
            if (args.id && args.action !== 'list' && args.action !== 'create' && args.id !== bridge.project.value.id) await bridge.openProject(args.id);
            if (args.action === 'list') return { projects: bridge.projects.value.map(projectSummary), activeId: bridge.project.value.id };
            if (args.action === 'get') return { ...state(bridge), document: bridge.document.value };
            if (args.action === 'create') await bridge.newProject(args.name || '未命名项目');
            else if (args.action === 'open') { if (bridge.project.value.id !== args.id) throw new Error('open 需要有效项目 id'); }
            else if (args.action === 'duplicate') await bridge.duplicateProject();
            else if (args.action === 'rename') { if (!args.name?.trim()) throw new Error('rename 需要 name'); bridge.project.value.name = args.name.trim(); }
            else if (args.action === 'delete') await bridge.removeProject();
            else if (args.action === 'save') await bridge.flushSave();
            else if (args.action !== 'create') throw new Error(`未知项目操作 ${args.action}`);
            return state(bridge);
        },
    },
    {
        name: 'model3d_entity', description: '实体查询与编辑：list/inspect/select/update/delete。inspect 返回后续工具所需的 faceId 和相邻面关系。',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'inspect', 'select', 'update', 'delete'] }, id: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, changes: { type: 'object' } }, required: ['action'] },
        execute: (bridge, args) => {
            if (args.action === 'list') return { entities: bridge.document.value.entities.map(entitySummary), planes: bridge.document.value.planes };
            if (args.action === 'inspect') return inspectEntity(bridge, args.id);
            const ids = args.ids || [args.id];
            selectBodies(bridge, ids);
            if (args.action === 'update') return updateEntity(bridge, args.id, args.changes || {});
            if (args.action === 'delete') bridge.deleteEntities(ids);
            return state(bridge);
        },
    },
    {
        name: 'model3d_sketch', description: '草图编辑：create/update/delete/constrain。默认 XZ 平面、Y-top（+Y 向上），u=+X、v=-Z；profile 使用平面局部坐标，支持 polygon/rectangle/circle/ellipse/regular/line/arc 及约束类型。',
        inputSchema: { type: 'object', properties: {
            action: { type: 'string', enum: ['create', 'update', 'delete', 'constrain'] }, id: { type: 'string' }, planeId: { type: 'string' }, plane: { type: 'object', description: '省略时创建 XZ 原点平面：Y-top（+Y 向上），u=+X、v=-Z。' }, name: { type: 'string' },
            profile: { type: 'object', description: '平面局部二维坐标；默认 XZ、Y-top，不使用世界三维坐标。' }, changes: { type: 'object' }, constraint: { type: 'string' }, edges: { type: 'array', items: { type: 'object' } }, shapeIds: { type: 'array', items: { type: 'string' } },
        }, required: ['action'] },
        execute: (bridge, args) => {
            if (args.action === 'create') return createSketch(bridge, args);
            if (args.action === 'update') {
                const sketch = entity(bridge, args.id);
                if (sketch.kind !== 'sketch') throw new Error('目标不是草图');
                const changes = args.changes || {};
                bridge.pushHistory?.();
                ['points', 'profileType', 'sides', 'open', 'sectorAngle', 'profileStartAngle', 'curves', 'analyticCurves', 'name'].forEach((key) => { if (key in changes) (sketch as any)[key] = changes[key]; });
                return entitySummary(sketch);
            }
            if (args.action === 'delete') { bridge.deleteEntities([args.id]); return state(bridge); }
            bridge.selectedEdges.value = args.edges || [];
            bridge.selectedShapes.value = args.shapeIds || [];
            bridge.applyConstraint(args.constraint);
            return state(bridge);
        },
    },
    {
        name: 'model3d_generate', description: '直接参数化建模：primitive 生成 box/cylinder/sphere/cone/torus；extrude 将已有草图拉伸为实体。',
        inputSchema: { type: 'object', properties: {
            action: { type: 'string', enum: ['primitive', 'extrude'] }, kind: { type: 'string', enum: ['box', 'cylinder', 'sphere', 'cone', 'torus'] }, profileId: { type: 'string' },
            width: { type: 'number' }, height: { type: 'number' }, depth: { type: 'number' }, radius: { type: 'number' }, tubeRadius: { type: 'number' },
            position: { type: 'array', items: { type: 'number' } }, rotation: { type: 'array', items: { type: 'number' } }, scale: { type: 'array', items: { type: 'number' } },
            sideMode: { type: 'string', enum: ['one', 'symmetric'] }, direction: { type: 'number', enum: [1, -1] }, draftAngle: { type: 'number' },
        }, required: ['action'] },
        execute: (bridge, args) => {
            if (args.action === 'primitive') {
                const body = createEntity(args.kind as PrimitiveKind, uid());
                body.name = uniqueEntityName(bridge.document.value, args.kind);
                bridge.pushHistory?.();
                ['width', 'height', 'depth', 'radius', 'tubeRadius', 'position', 'rotation', 'scale'].forEach((key) => { if (key in args) (body as any)[key] = args[key]; });
                bridge.document.value.entities.push(body);
                selectBodies(bridge, [body.id]);
                return entitySummary(body);
            }
            const profile = entity(bridge, args.profileId);
            if (profile.kind !== 'sketch' || !entityProfileClosed(profile)) throw new Error('extrude 需要封闭的草图 profileId');
            bridge.startExtrude(profile.id);
            ['depth', 'sideMode', 'direction', 'draftAngle'].forEach((key) => { if (key in args) bridge.updateExtrude(key as any, args[key]); });
            bridge.doneOperation();
            return state(bridge);
        },
    },
    {
        name: 'model3d_tool', description: '建模工具：shell、boolean、offsetFace、revolve（截面绕明确轴旋转扫掠，可选 Elevation）。所有距离使用项目长度单位。',
        inputSchema: { type: 'object', properties: {
            action: { type: 'string', enum: ['shell', 'boolean', 'offsetFace', 'revolve'] }, entityId: { type: 'string' }, faceId: { type: 'string' },
            faceIds: { type: 'array', items: { type: 'object', properties: { entityId: { type: 'string' }, faceId: { type: 'string' } }, required: ['entityId', 'faceId'] } },
            thickness: { type: 'number' }, distance: { type: 'number' }, axis: { type: 'string', enum: ['x', 'y', 'z'] }, angle: { type: 'number' }, offset: { type: 'number', description: 'Revolve Elevation，螺旋总升高。' }, profileId: { type: 'string' }, operation: { type: 'string', enum: ['union', 'subtract', 'intersect'] }, operandIds: { type: 'array', items: { type: 'string' } },
        }, required: ['action'] },
        execute: (bridge, args) => {
            if (args.action === 'revolve') {
                if (args.faceIds?.length) selectFaces(bridge, args.faceIds);
                else {
                    const profile = entity(bridge, args.profileId);
                    if (profile.kind !== 'sketch' || !entityProfileClosed(profile)) throw new Error('revolve 需要封闭草图 profileId 或平面 faceIds');
                    bridge.selectedIds.value = [profile.id];
                    bridge.selectionKind.value = 'sketch';
                }
                try {
                    bridge.startAxis();
                    bridge.updateAxis({ axis: args.axis, angle: args.angle, offset: args.offset, local: true });
                    if (!bridge.commitAxis()) throw new Error('轴向操作提交失败');
                    bridge.finishAxis();
                } catch (error) { bridge.finishAxis(); throw error; }
                return state(bridge);
            }
            if (args.action === 'shell') {
                if (args.faceIds?.length) selectFaces(bridge, args.faceIds);
                else selectBodies(bridge, [args.entityId]);
                try {
                    bridge.startShell();
                    if (args.thickness !== undefined) bridge.updateShell(args.thickness);
                    if (!bridge.commitShell()) throw new Error('抽壳提交失败');
                    bridge.finishShell();
                } catch (error) { bridge.finishShell(); throw error; }
                return state(bridge);
            }
            if (args.action === 'boolean') {
                selectBodies(bridge, args.operandIds || []);
                bridge.applyBoolean(args.operation);
                bridge.doneOperation();
                return state(bridge);
            }
            selectFaces(bridge, [{ entityId: args.entityId, faceId: args.faceId }]);
            if (!Number.isFinite(args.distance)) throw new Error('offsetFace 需要有限 distance');
            bridge.updateFaceOffset(args.distance);
            return state(bridge);
        },
    },
    {
        name: 'model3d_history', description: '撤销或重做当前项目最近一次建模操作。action 为 undo/redo。',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['undo', 'redo'] } }, required: ['action'] },
        execute: (bridge, args) => { if (args.action === 'undo') bridge.undo(); else bridge.redo(); return state(bridge); },
    },
];

export function listModel3dTools() { return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })); }

export async function callModel3dTool(bridge: Model3dAgentBridge, name: string, args: Record<string, any> = {}): Promise<ToolResult> {
    const tool = tools.find((item) => item.name === name);
    if (!tool) return { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true };
    try {
        const data = await tool.execute(bridge, args);
        if (!['list', 'get', 'inspect'].includes(args.action)) await bridge.flushSave();
        return result(data);
    } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }; }
}

export function initModel3dWebMCP(bridge: Model3dAgentBridge) {
    const api = { listTools: listModel3dTools, callTool: (name: string, args: Record<string, any> = {}) => callModel3dTool(bridge, name, args) };
    (window as unknown as { model3dMCP: typeof api }).model3dMCP = api;
    const context = (navigator as unknown as { modelContext?: any }).modelContext;
    let mode = 'local';
    try {
        if (context?.registerTool) {
            for (const tool of tools) context.registerTool({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, execute: (args: Record<string, any>) => callModel3dTool(bridge, tool.name, args) });
            mode = 'webmcp';
        } else if (context?.provideContext) {
            context.provideContext({ tools: tools.map((tool) => ({ ...tool, execute: (args: Record<string, any>) => callModel3dTool(bridge, tool.name, args) })) });
            mode = 'webmcp';
        }
    } catch (error) { console.warn('WebMCP registration failed; local model3d agent API remains available.', error); }
    window.dispatchEvent(new CustomEvent('model3d-mcp-ready', { detail: { tools: listModel3dTools(), mode } }));
    return { available: mode === 'webmcp', mode, count: tools.length };
}
