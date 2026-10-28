import { computed, ref, type Ref } from 'vue';
import { cloneDocument, type ModelDocument } from '../types';

/** Document-scoped undo/redo stacks; selection is pruned after each restore. */
export function useUndoHistory(document: Ref<ModelDocument>, selectedIds: Ref<string[]>) {
    const undoStack: ModelDocument[] = [];
    const redoStack: ModelDocument[] = [];
    const historyVersion = ref(0);
    const canUndo = computed(() => (historyVersion.value, undoStack.length > 0));
    const canRedo = computed(() => (historyVersion.value, redoStack.length > 0));

    function pushHistory() {
        historyVersion.value++;
        undoStack.push(cloneDocument(document.value));
        if (undoStack.length > 60) undoStack.shift();
        redoStack.length = 0;
    }
    function undo() {
        historyVersion.value++;
        const previous = undoStack.pop();
        if (!previous) return;
        redoStack.push(cloneDocument(document.value));
        document.value = previous;
        selectedIds.value = selectedIds.value.filter((id) => previous.entities.some((item) => item.id === id));
    }
    function redo() {
        historyVersion.value++;
        const next = redoStack.pop();
        if (!next) return;
        undoStack.push(cloneDocument(document.value));
        document.value = next;
        selectedIds.value = selectedIds.value.filter((id) => next.entities.some((item) => item.id === id));
    }
    function clearHistory() {
        undoStack.length = 0;
        redoStack.length = 0;
        historyVersion.value++;
    }
    function popHistory() {
        undoStack.pop();
        historyVersion.value++;
    }
    return { canUndo, canRedo, pushHistory, popHistory, undo, redo, clearHistory };
}
