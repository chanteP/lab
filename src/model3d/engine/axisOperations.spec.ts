import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { computed, ref } from 'vue';
import { initializeManifold } from './modeling/ManifoldKernel';
import { useAxisOperations } from '../composables/useAxisOperations';
import { createDocument, createEntity, type ModelEntity, type SelectionKind, type Vec3 } from '../types';
import type { ViewTool } from './Viewport';
import { validateSolidGeometry } from './modeling/GeometryValidator';
import { buildEntityMesh } from './geometry';

before(async () => { await initializeManifold(); });

function fixture(kind: 'body' | 'sketch') {
    const document = ref(createDocument());
    document.value.planes.push({ id: 'plane', name: 'XY', kind: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], visible: true });
    const owner = kind === 'body'
        ? Object.assign(createEntity('box', 'body'), { width: 2, height: 2, depth: 2, position: [1, 0, 0] as Vec3 })
        : Object.assign(createEntity('sketch', 'profile'), { planeId: 'plane', profileType: 'rectangle' as const, points: [[1, 1], [2, 1], [2, 2], [1, 2]], open: false });
    document.value.entities.push(owner);
    const selectedIds = ref([owner.id]), selectionKind = ref<SelectionKind>(kind === 'body' ? 'body' : 'sketch'), activeTool = ref<ViewTool>('select');
    const selectedEntities = computed(() => [owner]);
    let previews: any = null, history = 0;
    const viewport = { setTool: (tool: ViewTool) => { activeTool.value = tool; }, setShellPreview: (value: any) => { previews = value; } };
    const operations = useAxisOperations({
        document, selectedIds, selectedEntities, selectionKind, activeTool, viewport: () => viewport as any,
        message: { error: (error: unknown) => { throw error; } } as any, pushHistory: () => { history++; },
    });
    return { document, owner, operations, previews: () => previews, history: () => history };
}

test('rotate axis applies angle and offset only on commit', () => {
    const { owner, operations, previews, history } = fixture('body');
    assert.equal(operations.canRotate.value, true);
    operations.start('rotate');
    operations.update({ axis: 'y', angle: 90, offset: 2 });
    assert.deepEqual(owner.position, [1, 0, 0]);
    assert.equal(previews()?.length, 1);
    assert(operations.commit());
    assert.equal(history(), 1);
    assert(Math.abs(owner.position[0]) < 1e-7 && Math.abs(owner.position[1] - 2) < 1e-7 && Math.abs(owner.position[2] + 1) < 1e-7);
    assert.equal(previews(), null);
});

test('revolve preview commits a new solid and hides the source profile', () => {
    const { document, owner, operations, history } = fixture('sketch');
    assert.equal(operations.canRevolve.value, true);
    operations.start('revolve');
    operations.update({ axis: 'x', angle: 90 });
    assert(operations.commit());
    assert.equal(history(), 1);
    const body = document.value.entities.find((item) => item.kind === 'extrude')!;
    const mesh = buildEntityMesh(body, document.value);
    assert(Math.abs(validateSolidGeometry(mesh.geometry).volume - Math.PI * 3 / 4) < 0.03);
    mesh.geometry.dispose();
    assert.equal(owner.visible, false);
    assert.equal(document.value.entities[document.value.entities.length - 1].id, body.id);
});
