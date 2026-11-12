import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { Viewport, ViewTool } from '../engine/Viewport';
import type { ModelEntity, Vec3 } from '../types';

type Values = Record<'x' | 'y' | 'z', number>;

/** Numeric counterpart of TransformControls; absolute inputs become deltas for every selected entity. */
export function useTransformOperation(options: {
    selectedEntities: ComputedRef<ModelEntity[]>;
    selectedIds: Ref<string[]>;
    activeTool: Ref<ViewTool>;
    viewport: () => Viewport | undefined;
    pushHistory: () => void;
    isTransforming: () => boolean;
    setTransforming: (value: boolean) => void;
    setTool: (tool: ViewTool) => void;
    sync: () => void;
}) {
    const { selectedEntities, selectedIds, activeTool, pushHistory, isTransforming, setTransforming, setTool, sync } = options;
    const active = computed(() => ['translate', 'rotate', 'scale'].includes(activeTool.value) && selectedEntities.value.length > 0);
    const values = computed<Values>(() => read());
    let previous: Values = { x: 0, y: 0, z: 0 };
    let originals = new Map<string, { position: Vec3; rotation: Vec3; scale: Vec3 }>();
    let historyStarted = false;

    function read(): Values {
        const item = selectedEntities.value[selectedEntities.value.length - 1];
        if (!item) return { x: 0, y: 0, z: 0 };
        const tuple = activeTool.value === 'translate' ? item.position : activeTool.value === 'rotate' ? item.rotation : item.scale;
        return { x: tuple[0], y: tuple[1], z: tuple[2] };
    }
    function reset() {
        originals = new Map(selectedEntities.value.map((item) => [item.id, { position: [...item.position], rotation: [...item.rotation], scale: [...item.scale] }]));
        previous = read();
        historyStarted = false;
    }
    function begin() {
        if (!originals.size) reset();
        if (!historyStarted) {
            pushHistory();
            historyStarted = true;
        }
        setTransforming(true);
    }
    function update(axis: 'x' | 'y' | 'z', value: number) {
        if (!Number.isFinite(value) || !active.value) return;
        begin();
        const delta = value - previous[axis];
        selectedEntities.value.forEach((item) => {
            const tuple = activeTool.value === 'translate' ? item.position : activeTool.value === 'rotate' ? item.rotation : item.scale;
            const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
            tuple[index] = activeTool.value === 'scale' ? Math.max(0.01, tuple[index] + delta) : tuple[index] + delta;
        });
        previous[axis] = value;
    }
    function endGesture() {
        if (!isTransforming()) return;
        setTransforming(false);
        previous = read();
        sync();
    }
    function complete() {
        if (isTransforming()) setTransforming(false);
        historyStarted = false;
        originals.clear();
        sync();
        setTool('select');
    }
    watch([activeTool, selectedIds], () => {
        if (isTransforming()) setTransforming(false);
        if (['translate', 'rotate', 'scale'].includes(activeTool.value)) reset();
    }, { deep: true, flush: 'sync' });

    return { active, values, begin, update, endGesture, complete, reset };
}
