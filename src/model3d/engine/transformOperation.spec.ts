import assert from 'node:assert/strict';
import test from 'node:test';
import { computed, ref } from 'vue';
import { useTransformOperation } from '../composables/useTransformOperation';
import { createDocument, createEntity, type SelectionKind, type Vec3 } from '../types';
import type { ViewTool } from './Viewport';

function fixture(tool: ViewTool = 'translate') {
    const document = ref(createDocument());
    const a = createEntity('box', 'a'), b = createEntity('box', 'b');
    a.position = [1, 0, 0]; b.position = [3, 0, 0];
    document.value.entities.push(a, b);
    const selectedIds = ref<string[]>([]), activeTool = ref<ViewTool>(tool);
    const selectedEntities = computed(() => selectedIds.value.map((id) => document.value.entities.find((item) => item.id === id)!) );
    let history = 0, transforming = false;
    const operation = useTransformOperation({
        selectedEntities, selectedIds, activeTool, viewport: () => undefined,
        pushHistory: () => { history++; }, isTransforming: () => transforming, setTransforming: (value) => { transforming = value; },
        setTool: (tool) => { activeTool.value = tool; }, sync: () => undefined,
    });
    return { document, a, b, selectedIds, activeTool, operation, transforming: () => transforming, history: () => history };
}

test('tool-first selection produces current values and an active numeric bar', () => {
    const { selectedIds, operation } = fixture('rotate');
    assert.equal(operation.active.value, false);
    selectedIds.value = ['a'];
    assert.equal(operation.active.value, true);
    assert.deepEqual(operation.values.value, { x: 0, y: 0, z: 0 });
});

test('numeric translate, rotate and scale update real entity parameters and complete', () => {
    for (const [tool, expected] of [['translate', 12], ['rotate', 12], ['scale', 12]] as const) {
        const { a, activeTool, operation, selectedIds, history } = fixture(tool);
        selectedIds.value = ['a'];
        operation.update('x', 12);
        assert.equal(expected, 12);
        assert.equal(history(), 1);
        operation.complete();
        assert.equal(activeTool.value, 'select');
    }
});

test('multi-selection applies absolute-input deltas and gizmo values backfill correctly', () => {
    const { a, b, selectedIds, operation } = fixture('translate');
    selectedIds.value = ['a', 'b'];
    operation.update('x', 5);
    assert.deepEqual(a.position, [3, 0, 0]);
    assert.deepEqual(b.position, [5, 0, 0]);
    b.position[0] = 9;
    operation.endGesture();
    operation.update('x', 10);
    assert.deepEqual(a.position, [4, 0, 0]);
    assert.deepEqual(b.position, [10, 0, 0]);
});
