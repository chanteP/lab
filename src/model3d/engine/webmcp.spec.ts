import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { computed, ref } from 'vue';
import { initializeManifold } from './modeling/ManifoldKernel';
import { callModel3dTool, initModel3dWebMCP, listModel3dTools, type Model3dAgentBridge } from '../io/webmcp';
import { cloneDocument, createDocument, createEntity, type ModelEntity, type ProjectRecord, type SelectionKind, type Vec3 } from '../types';
import { useUndoHistory } from '../composables/useUndoHistory';
import { useModelingOperations } from '../composables/useModelingOperations';
import { useShellOperations } from '../composables/useShellOperations';
import { useAxisOperations } from '../composables/useAxisOperations';
import { buildEntityMesh } from './geometry';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import type { ViewTool } from './Viewport';

before(async () => { await initializeManifold(); });

function fixture() {
    const document = ref(createDocument());
    const project = ref<ProjectRecord>({ id: 'project', name: 'Agent', createdAt: 1, updatedAt: 1, document: createDocument() });
    const projects = ref([project.value]);
    const selectedIds = ref<string[]>([]), selectionKind = ref<SelectionKind>(null), selectedFacePlanar = ref(false);
    const selectedEdges = ref([]), selectedShapes = ref<string[]>([]), activePlaneId = ref<string | null>(null);
    const activeTool = ref<ViewTool>('select'), activePanel = ref(null), parameterCardOpen = ref(true), lastFace = ref(null);
    const selectedEntities = computed(() => selectedIds.value.map((id) => document.value.entities.find((item) => item.id === id)).filter(Boolean) as ModelEntity[]);
    const selected = computed(() => selectedEntities.value.length === 1 ? selectedEntities.value[0] : null);
    let anchors: GeometryAnchor[] = [];
    const viewport = {
        setTool: (tool: ViewTool) => { activeTool.value = tool; }, setView: () => undefined, fitSelection: () => undefined,
        setBooleanPreview: () => undefined, setShellPreview: () => undefined, clearGeometrySelection: () => { anchors = []; },
        getGeometryAnchor: () => anchors[anchors.length - 1] || null, getGeometryAnchors: () => anchors,
        setGeometryAnchors: (value: GeometryAnchor[]) => { anchors = [...value]; }, offsetGeometryAnchor: () => undefined,
    };
    const { pushHistory, popHistory, undo, redo } = useUndoHistory(document, selectedIds);
    const message = { warning: () => undefined, error: () => undefined, success: () => undefined } as any;
    const modeling = useModelingOperations({
        document, selectedIds, selectedEntities, selected, selectionKind, activeTool, activePanel, parameterCardOpen, lastFace,
        viewport: () => viewport as any, message, pushHistory, popHistory, inputLength: (value) => value, setTool: (tool) => { activeTool.value = tool; },
        profileFace: () => null, startSketch: () => undefined,
    });
    const shell = useShellOperations({
        document, selectedIds, activeTool, viewport: () => viewport as any, message, pushHistory, popHistory, inputLength: (value) => value || 0,
        canSelect: () => selectionKind.value === 'face', bodySelection: () => selectionKind.value === 'body' && selected.value || null,
    });
    const axis = useAxisOperations({ document, selectedIds, selectedEntities, selectionKind, activeTool, viewport: () => viewport as any, message, pushHistory });
    const bridge: Model3dAgentBridge = {
        document, project, projects, selectedIds, selectionKind, selectedFacePlanar, selectedEdges, selectedShapes, activePlaneId,
        viewport: () => viewport as any,
        newProject: async (name) => { project.value = { id: 'new-project', name, createdAt: 2, updatedAt: 2, document: createDocument() }; projects.value = [project.value]; document.value = createDocument(); selectedIds.value = []; },
        openProject: async (id) => { if (id !== project.value.id) throw new Error(`missing ${id}`); }, duplicateProject: async () => undefined, removeProject: async () => undefined,
        flushSave: async () => { project.value.document = cloneDocument(document.value); }, pushHistory,
        deleteEntities: (ids) => { pushHistory(); document.value.entities = document.value.entities.filter((item) => !ids.includes(item.id)); },
        startExtrude: modeling.startExtrude, updateExtrude: modeling.updateExtrude, doneOperation: modeling.doneOperation, applyBoolean: modeling.applyBoolean,
        startShell: shell.start, updateShell: shell.update, commitShell: shell.commit, finishShell: shell.finish,
        updateFaceOffset: modeling.updateFaceOffsetInput, applyConstraint: () => undefined,
        startAxis: axis.start, updateAxis: axis.update, commitAxis: axis.commit, finishAxis: axis.finish, undo, redo,
    };
    return { bridge, document };
}
const data = (response: any) => response.structuredContent;
function volume(entity: ModelEntity, document: any) {
    const mesh = buildEntityMesh(entity, document);
    const result = validateSolidGeometry(mesh.geometry);
    mesh.geometry.dispose();
    return result.volume;
}

test('agent API exposes project, entity, sketch, generation, tool and history domains', () => {
    assert.deepEqual(listModel3dTools().map((tool) => tool.name), ['model3d_project', 'model3d_entity', 'model3d_sketch', 'model3d_generate', 'model3d_tool', 'model3d_history']);
    assert.match(listModel3dTools().find((tool) => tool.name === 'model3d_sketch')!.description, /XZ.*Y-top/);
});

test('agent creates a project and a parametric primitive', async () => {
    const { bridge, document } = fixture();
    const created = await callModel3dTool(bridge, 'model3d_project', { action: 'create', name: 'Agent Project' });
    assert.equal(created.isError, undefined);
    assert.equal(data(created).project.name, 'Agent Project');
    const box = await callModel3dTool(bridge, 'model3d_generate', { action: 'primitive', kind: 'box', width: 20, height: 10, depth: 30, position: [0, 5, 0] });
    assert.equal(box.isError, undefined);
    assert.equal(document.value.entities[0].width, 20);
    assert(Math.abs(volume(document.value.entities[0], document.value) - 6000) < 1e-6);
});

test('agent creates a sketch and extrudes it into a solid', async () => {
    const { bridge, document } = fixture();
    const sketch = await callModel3dTool(bridge, 'model3d_sketch', { action: 'create', profile: { type: 'rectangle', points: [[0, 0], [20, 0], [20, 10], [0, 10]] } });
    assert.equal(sketch.isError, undefined);
    const profileId = data(sketch).id;
    const plane = document.value.planes[0];
    assert.equal(plane.kind, 'XZ');
    assert.deepEqual(plane.normal, [0, 1, 0]);
    assert.deepEqual(plane.u, [1, 0, 0]);
    assert.deepEqual(plane.v, [0, 0, -1]);
    const extruded = await callModel3dTool(bridge, 'model3d_generate', { action: 'extrude', profileId, depth: 5 });
    assert.equal(extruded.isError, undefined, extruded.content[0].text);
    const body = document.value.entities.find((item) => item.kind === 'extrude')!;
    assert(Math.abs(volume(body, document.value) - 1000) < 1e-6);
});

test('agent inspects face IDs and performs open and closed shell operations', async () => {
    const { bridge, document } = fixture();
    const created = await callModel3dTool(bridge, 'model3d_generate', { action: 'primitive', kind: 'box', width: 10, height: 10, depth: 10, position: [0, 0, 0] });
    const id = data(created).id;
    const inspected = await callModel3dTool(bridge, 'model3d_entity', { action: 'inspect', id });
    assert.equal(data(inspected).faces.length, 6);
    const top = data(inspected).faces.find((face: any) => face.normal[1] > 0.99);
    const opened = await callModel3dTool(bridge, 'model3d_tool', { action: 'shell', faceIds: [{ entityId: id, faceId: top.id }], thickness: 1 });
    assert.equal(opened.isError, undefined, opened.content[0].text);
    assert(Math.abs(volume(document.value.entities[0], document.value) - 424) < 1e-4);

    const second = await callModel3dTool(bridge, 'model3d_generate', { action: 'primitive', kind: 'box', width: 10, height: 10, depth: 10, position: [0, 0, 0] });
    const closed = await callModel3dTool(bridge, 'model3d_tool', { action: 'shell', entityId: data(second).id, thickness: 1 });
    assert.equal(closed.isError, undefined, closed.content[0].text);
    const body = document.value.entities.find((item) => item.id === data(second).id)!;
    assert(Math.abs(volume(body, document.value) - 488) < 1e-4);
});

test('agent offsetFace uses an inspected face and returns structured errors', async () => {
    const { bridge, document } = fixture();
    const created = await callModel3dTool(bridge, 'model3d_generate', { action: 'primitive', kind: 'box', width: 10, height: 10, depth: 10, position: [0, 0, 0] });
    const id = data(created).id;
    const inspected = await callModel3dTool(bridge, 'model3d_entity', { action: 'inspect', id });
    const top = data(inspected).faces.find((face: any) => face.normal[1] > 0.99);
    const moved = await callModel3dTool(bridge, 'model3d_tool', { action: 'offsetFace', entityId: id, faceId: top.id, distance: 2 });
    assert.equal(moved.isError, undefined, moved.content[0].text);
    assert(Math.abs(volume(document.value.entities[0], document.value) - 1200) < 1e-4);
    const missing = await callModel3dTool(bridge, 'model3d_entity', { action: 'inspect', id: 'missing' });
    assert.equal(missing.isError, true);
});

test('WebMCP and the local agent bridge register all tools', async () => {
    const { bridge } = fixture();
    const registered: string[] = [];
    const originalWindow = globalThis.window;
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const events: string[] = [];
    (globalThis as any).window = { dispatchEvent: (event: CustomEvent) => { events.push(event.type); return true; } };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { modelContext: { registerTool: (tool: any) => { registered.push(tool.name); return tool; } } } });
    try {
        const status = initModel3dWebMCP(bridge);
        assert.equal(status.mode, 'webmcp');
        assert.equal(status.count, 6);
        assert.deepEqual(registered, listModel3dTools().map((tool) => tool.name));
        assert.deepEqual((globalThis as any).window.model3dMCP.listTools(), listModel3dTools());
        assert.deepEqual(events, ['model3d-mcp-ready']);
    } finally {
        (globalThis as any).window = originalWindow;
        if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    }
});

test('agent revolves a closed sketch around a sketch-local axis', async () => {
    const { bridge, document } = fixture();
    const sketch = await callModel3dTool(bridge, 'model3d_sketch', { action: 'create', plane: { kind: 'XY' }, profile: { type: 'rectangle', points: [[1, 1], [2, 1], [2, 2], [1, 2]] } });
    const revolved = await callModel3dTool(bridge, 'model3d_tool', { action: 'revolve', profileId: data(sketch).id, axis: 'x', angle: 90 });
    assert.equal(revolved.isError, undefined, revolved.content[0].text);
    const body = document.value.entities.find((item) => item.kind === 'extrude')!;
    assert(Math.abs(volume(body, document.value) - Math.PI * 3 / 4) < 0.03);
});
