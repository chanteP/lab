import { computed, ref } from 'vue';
import type { Adjustments, ImageAsset } from './types';
import { cloneAdjustments } from './engine/adjustments';
import { ensureBitmap, isImageFile, readImageAsset } from './io/raw';

export const assets = ref<ImageAsset[]>([]);
export const selectedIds = ref<Set<string>>(new Set());
export const activeId = ref('');
export const busy = ref(false);
export const notice = ref('');
export const activeAsset = computed(() => assets.value.find((asset) => asset.id === activeId.value));

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
    const next = assets.value[0]; activeId.value = '';
    if (next) void selectAsset(next.id); else selectedIds.value = new Set();
}

export function syncToSelected() {
    const source = activeAsset.value; if (!source) return;
    for (const asset of assets.value) if (selectedIds.value.has(asset.id)) asset.adjustments = cloneAdjustments(source.adjustments);
    notice.value = `已同步到 ${selectedIds.value.size} 张图片`;
}

export function updateActive(patch: Partial<Adjustments>) {
    if (activeAsset.value) Object.assign(activeAsset.value.adjustments, patch);
}
