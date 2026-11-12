import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { computed, ref } from 'vue';
import { initializeManifold } from './modeling/ManifoldKernel';
import { useAxisOperations } from '../composables/useAxisOperations';
import { createDocument, createEntity, type ModelEntity, type SelectionKind, type Vec3 } from '../types';
import type { ViewTool } from './Viewport';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { buildEntityMesh } from './geometry';

before(async () => { await initializeManifold(); });

function fixture(kind: 'body' | 'sketch') {
    const document = ref(createDocument());
    document.value.planes.push({ id: 'plane', name: 'XY', kind: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], visible: true });
    const owner = kind === 'body'
        ? Object.assign(createEntity('box', 'body'), { width: 2, height: 2, depth: 2, position: [1, 0, 0] as Vec3 })
        : Object.assign(createEntity('sketch', 'profile'), { planeId: 'plane', profileType: 'rectangle' as const, points: [[1, 1], [2, 1], [2, 2], [1, 2]], open: false, position: [0, 0, 0] as Vec3 });
    document.value.entities.push(owner);
    const selectedIds = ref([owner.id]), selectionKind = ref<SelectionKind>(kind === 'body' ? 'body' : 'sketch'), activeTool = ref<ViewTool>('select');
    const selectedEntities = computed(() => [owner]);
    let previews: any = null, history = 0, geometryAnchor: GeometryAnchor | null = null;
    const viewport = { setTool: (tool: ViewTool) => { activeTool.value = tool; }, setShellPreview: (value: any) => { previews = value; }, getGeometryAnchor: () => geometryAnchor, setSelected: () => undefined };
    const operations = useAxisOperations({
        document, selectedIds, selectedEntities, selectionKind, activeTool, viewport: () => viewport as any,
        message: { error: (error: unknown) => { throw error; } } as any, pushHistory: () => { history++; },
    });
    return { document, owner, operations, selectionKind, previews: () => previews, history: () => history, setAnchor: (anchor: GeometryAnchor) => { geometryAnchor = anchor; } };
}

test('whole-body selection never guesses a profile or creates a revolve', () => {
    const { document, operations, previews } = fixture('body');
    assert.equal(operations.canRevolve.value, false);
    operations.start();
    assert.equal(operations.active.value, false);
    assert.equal(previews(), null);
    assert.equal(document.value.entities.length, 1);
});

test('revolve preview commits a new solid and hides the source profile', () => {
    const { document, owner, operations, selectionKind, previews, history } = fixture('sketch');
    selectionKind.value = 'face';
    assert.equal(operations.canRevolve.value, true, 'closed 3D sketches are selectable as face anchors');
    operations.start();
    assert.equal(previews(), null, 'no geometry is generated before an explicit axis');
    operations.update({ axis: 'x', angle: 90 });
    assert.equal(previews()?.length, 1);
    assert(operations.commit());
    assert.equal(history(), 1);
    const body = document.value.entities.find((item) => item.kind === 'extrude')!;
    const mesh = buildEntityMesh(body, document.value);
    assert(Math.abs(validateSolidGeometry(mesh.geometry).volume - Math.PI * 3 / 4) < 0.03);
    mesh.geometry.dispose();
    assert.equal(owner.visible, false);
    assert.equal(document.value.entities[document.value.entities.length - 1].id, body.id);
});

test('a planar body face revolves into a new body without replacing its source', () => {
    const { document, owner, operations, selectionKind, setAnchor } = fixture('body');
    selectionKind.value = 'face';
    setAnchor({
        id: owner.id, key: 'body:face:top', type: 'face', planar: true,
        normal: [0, 1, 0], localNormal: [0, 1, 0], point: [0, 1, -1],
        vertices: [[0, 1, -1], [0, 1, 1], [2, 1, 1], [0, 1, -1], [2, 1, 1], [2, 1, -1]], indices: [0, 1, 2, 3, 4, 5],
    });
    assert.equal(operations.canRevolve.value, true);
    operations.start();
    assert.equal(operations.pickAxis({ point: [0, 1, 1], direction: [1, 0, 0], label: '顶面边' }), true);
    operations.update({ angle: 90 });
    assert(operations.commit());
    assert.equal(owner.visible, true);
    assert(document.value.entities.some((item) => item.kind === 'extrude'));
});


test('a picked sketch line becomes the revolve axis without losing the profile', () => {
    const { document, operations, previews } = fixture('sketch');
    operations.start();
    assert.equal(operations.pickAxis({ point: [0, 1, 0], direction: [1, 0, 0], label: '草图直线' }), true);
    operations.update({ angle: 90 });
    assert.equal(operations.axisLabel.value, '草图直线');
    assert.equal(previews()?.length, 1);
    assert(operations.commit());
    const body = document.value.entities.find((item) => item.kind === 'extrude')!;
    const mesh = buildEntityMesh(body, document.value);
    assert(Math.abs(validateSolidGeometry(mesh.geometry).volume - Math.PI / 4) < 0.03);
    mesh.geometry.dispose();
});
