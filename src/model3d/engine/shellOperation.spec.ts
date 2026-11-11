import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { ref } from 'vue';
import { initializeManifold } from './modeling/ManifoldKernel';
import { useShellOperations } from '../composables/useShellOperations';
import { createDocument, createEntity, type ModelDocument, type Vec3 } from '../types';
import type { GeometryAnchor } from './viewport/GeometrySelector';
import type { ViewTool } from './Viewport';

before(async () => { await initializeManifold(); });

function anchor(): GeometryAnchor {
    return {
        id: 'body', key: 'body:face:top', type: 'face', planar: true,
        normal: [0, 1, 0], localNormal: [0, 1, 0], point: [0, 5, 0],
        vertices: [[-5, 5, -5], [-5, 5, 5], [5, 5, 5], [-5, 5, -5], [5, 5, 5], [5, 5, -5]], indices: [0, 1, 2, 3, 4, 5],
    };
}

function fixture() {
    const document = ref<ModelDocument>(createDocument());
    const body = Object.assign(createEntity('box', 'body'), { width: 10, height: 10, depth: 10, position: [0, 0, 0] as Vec3 });
    document.value.entities.push(body);
    const selectedIds = ref(['body']);
    const activeTool = ref<ViewTool>('select');
    let previews: unknown[] | null = null;
    let history = 0;
    const viewport = {
        getGeometryAnchors: () => [anchor()],
        setShellPreview: (value: unknown[] | null) => { previews = value; },
        setTool: (tool: ViewTool) => { activeTool.value = tool; },
        clearGeometrySelection: () => undefined,
    };
    const operations = useShellOperations({
        document, selectedIds, activeTool, viewport: () => viewport as any, message: { warning: () => undefined, error: () => undefined } as any,
        pushHistory: () => { history++; }, popHistory: () => { history--; }, inputLength: (value) => value || 0, canSelect: () => true,
    });
    return { document, operations, history: () => history, previews: () => previews };
}

test('shell start and thickness edits preview without touching the document or history', () => {
    const { document, operations, history, previews } = fixture();
    const before = JSON.stringify(document.value);
    operations.start();
    assert.equal(JSON.stringify(document.value), before);
    assert.equal(history(), 0);
    assert.equal(previews()?.length, 1);
    operations.update(1);
    assert.equal(JSON.stringify(document.value), before);
    assert.equal(history(), 0);
    assert.equal(previews()?.length, 1);
    assert(operations.commit());
    assert.equal(history(), 1);
    assert.notEqual(JSON.stringify(document.value), before);
    assert(document.value.entities[0].meshGeometry);
    operations.finish();
    assert.equal(previews(), null);
});

test('cancelling a shell preview discards every uncommitted thickness', () => {
    const { document, operations, history, previews } = fixture();
    const before = JSON.stringify(document.value);
    operations.start();
    operations.update(0.5);
    operations.finish();
    assert.equal(JSON.stringify(document.value), before);
    assert.equal(history(), 0);
    assert.equal(previews(), null);
});
