import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTick, ref } from 'vue';
import { createDocument, createEntity } from '../types';
import { useSketchState } from '../composables/sketch/useSketchState';

const listeners = new Map<string, () => void>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: {
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
}, configurable: true });

test('constraint edge and shape ownership survives handle selection and clears only on deletion or blur', async () => {
    const document = ref(createDocument());
    const shape = createEntity('sketch', 'shape');
    shape.points = [[0, 0], [10, 0], [10, 10], [0, 10]];
    document.value.entities.push(shape);
    const state = useSketchState(document);

    state.rememberConstraintShapes([shape.id]);
    state.selectedShapes.value = [];
    assert.deepEqual(state.constraintAnchorSelection.shapeIds, [shape.id]);

    state.rememberConstraintEdges([{ entityId: shape.id, index: 0 }]);
    state.selectedEdges.value = [];
    assert.deepEqual(state.constraintAnchorSelection.edges, [{ entityId: shape.id, index: 0 }]);
    assert.deepEqual(state.constraintAnchorSelection.shapeIds, []);

    document.value.entities = [];
    await nextTick();
    assert.deepEqual(state.constraintAnchorSelection.edges, []);

    state.rememberConstraintShapes([shape.id]);
    listeners.get('blur')?.();
    assert.deepEqual(state.constraintAnchorSelection.shapeIds, []);
});
