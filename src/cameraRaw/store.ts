import { computed, ref, watch } from 'vue';
import type { Adjustments, ImageAsset } from './types';
import { cloneAdjustments } from './engine/adjustments';
import { ensureBitmap, isImageFile, readImageAsset } from './io/raw';

export const assets = ref<ImageAsset[]>([]);
export const selectedIds = ref<Set<string>>(new Set());
export const activeId = ref('');
export const busy = ref(false);
export const notice = ref('');
export const activeAsset = computed(() => assets.value.find((asset) => asset.id === activeId.value));

type HistoryEntry = { past: Adjustments[]; future: Adjustments[]; last: Adjustments; timer?: ReturnType<typeof setTimeout> };
const histories = new Map<string, HistoryEntry>();
const historyVersion = ref(0);
let applyingHistory = false;

function historyFor(id: string, current: Adjustments): HistoryEntry {
    let history = histories.get(id);
    if (!history) { history = { past: [], future: [], last: cloneAdjustments(current) }; histories.set(id, history); }
    return history;
}

function noteAdjustment(id: string, current: Adjustments) {
    if (applyingHistory) return;
    const history = historyFor(id, current);
    if (history.timer) clearTimeout(history.timer);
    history.timer = setTimeout(() => flushHistory(id), 280);
}

function flushHistory(id: string) {
    const asset = assets.value.find((item) => item.id === id), history = histories.get(id);
    if (!asset || !history) return;
    if (history.timer) { clearTimeout(history.timer); history.timer = undefined; }
    if (JSON.stringify(asset.adjustments) === JSON.stringify(history.last)) return;
    history.past.push(history.last); if (history.past.length > 60) history.past.shift();
    history.last = cloneAdjustments(asset.adjustments); history.future = []; historyVersion.value++;
}

export const canUndo = computed(() => {
    historyVersion.value;
    const h = histories.get(activeId.value), current = activeAsset.value?.adjustments;
    return Boolean(h && (h.past.length || (h.timer && current && JSON.stringify(current) !== JSON.stringify(h.last))));
});
export const canRedo = computed(() => { historyVersion.value; return Boolean(histories.get(activeId.value)?.future.length); });

export function undo() {
    const asset = activeAsset.value; if (!asset) return;
    flushHistory(asset.id);
    const history = histories.get(asset.id)!, previous = history.past.pop();
    if (!previous) { historyVersion.value++; return; }
    history.future.push(cloneAdjustments(asset.adjustments)); history.last = cloneAdjustments(previous);
    applyingHistory = true; asset.adjustments = cloneAdjustments(previous); applyingHistory = false; historyVersion.value++;
}

export function redo() {
    const asset = activeAsset.value, history = histories.get(asset?.id ?? ''); if (!asset || !history) return;
    flushHistory(asset.id);
    const next = history.future.pop(); if (!next) return;
    history.past.push(cloneAdjustments(asset.adjustments)); history.last = cloneAdjustments(next);
    applyingHistory = true; asset.adjustments = cloneAdjustments(next); applyingHistory = false; historyVersion.value++;
}

watch(() => activeAsset.value?.adjustments, (current) => { if (current && activeId.value) noteAdjustment(activeId.value, current); }, { deep: true, flush: 'sync' });
watch(activeId, (id, previous) => { if (previous) flushHistory(previous); if (id && activeAsset.value) historyFor(id, activeAsset.value.adjustments); historyVersion.value++; });

export async function selectAsset(id: string, additive = false) {
    if (!additive) selectedIds.value = new Set([id]);
    activeId.value = id;
    const asset = assets.value.find((item) => item.id === id);
    if (!asset || asset.bitmap) return;
    asset.loading = true; asset.error = undefined;
    try { await ensureBitmap(asset); }
    catch (error) { asset.error = error instanceof Error ? error.message : String(error); notice.value = asset.error; }
    finally { asset.loading = false; }
}

export async function importFiles(files: File[]) {
    const supported = files.filter(isImageFile);
    if (!supported.length) { notice.value = '请选择 RAW、JPEG 或 PNG 图片'; return; }
    busy.value = true;
    for (const file of supported) {
        try {
            const asset = await readImageAsset(file); assets.value.push(asset);
            if (!activeId.value) await selectAsset(asset.id);
        } catch (error) { notice.value = `${file.name}: ${error instanceof Error ? error.message : String(error)}`; }
    }
    busy.value = false;
}

export function toggleSelected(id: string) {
    const next = new Set(selectedIds.value); next.has(id) ? next.delete(id) : next.add(id);
    if (!next.size) next.add(id);
    selectedIds.value = next;
    // Keep the current image as the synchronization source while Cmd/Ctrl-selecting others.
    if (!next.has(activeId.value)) void selectAsset(id, true);
}

export function navigate(direction: number) {
    const index = assets.value.findIndex((asset) => asset.id === activeId.value);
    if (index < 0) return;
    const next = (index + direction + assets.value.length) % assets.value.length;
    void selectAsset(assets.value[next].id);
}

export function removeSelected() {
    const removed = selectedIds.value;
    for (const asset of assets.value) if (removed.has(asset.id)) { asset.bitmap?.close(); if (asset.thumbnail) URL.revokeObjectURL(asset.thumbnail); }
    assets.value = assets.value.filter((asset) => !removed.has(asset.id));
    for (const id of removed) { const history = histories.get(id); if (history?.timer) clearTimeout(history.timer); histories.delete(id); }
    const next = assets.value[0]; activeId.value = '';
    if (next) void selectAsset(next.id); else selectedIds.value = new Set();
}

export function syncToSelected() {
    const source = activeAsset.value; if (!source) return;
    for (const asset of assets.value) if (selectedIds.value.has(asset.id)) {
        historyFor(asset.id, asset.adjustments); asset.adjustments = cloneAdjustments(source.adjustments); noteAdjustment(asset.id, asset.adjustments);
    }
    notice.value = `已同步到 ${selectedIds.value.size} 张图片`;
}

export function updateActive(patch: Partial<Adjustments>) {
    if (activeAsset.value) Object.assign(activeAsset.value.adjustments, patch);
}
