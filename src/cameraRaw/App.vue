<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NIcon, useMessage } from 'naive-ui';
import { Add, AnalyticsOutline, ApertureOutline, ArrowRedo, ArrowUndoOutline, BookmarksOutline, CameraOutline, CloudDownloadOutline, ColorPaletteOutline, ContrastOutline, DownloadOutline, EyeOutline, FolderOpenOutline, GitCompareOutline, HardwareChipOutline, ImagesOutline, InformationCircleOutline, OptionsOutline, PulseOutline, RefreshOutline, Remove, SparklesOutline, SyncOutline, TrashOutline } from '@vicons/ionicons5';
import { activeAsset, assets, busy, canRedo, canUndo, importFiles, navigate, notice, redo, removeSelected, selectedIds, syncToSelected, undo } from './store';
import { createDefaultAdjustments } from './engine/adjustments';
import { parsePreset, serializePreset } from './io/preset';
import { saveAsset } from './io/export';
import { downloadBlob } from './io/export';
import { disposeRaw } from './io/raw';
import { initWebMCP } from './io/webmcp';
import { putPreset } from './io/presetStore';
import { disposeLoading, registerLoading, withLoading } from './io/loading';
import ImageViewer from './components/ImageViewer.vue';
import AdjustmentPanel from './components/AdjustmentPanel.vue';
import FilmStrip from './components/FilmStrip.vue';
import Histogram from './components/Histogram.vue';
import MetadataDialog from './components/MetadataDialog.vue';

const panels = [
    { id: 'basic', label: '基本', icon: OptionsOutline }, { id: 'curve', label: '曲线', icon: PulseOutline },
    { id: 'effects', label: '效果', icon: SparklesOutline }, { id: 'grading', label: '分级', icon: ContrastOutline }, { id: 'mixer', label: '混色', icon: ColorPaletteOutline },
    { id: 'calibration', label: '校准', icon: ApertureOutline }, { id: 'optics', label: '光学', icon: CameraOutline },
    { id: 'presets', label: '预设', icon: BookmarksOutline },
];
const panel = ref('basic'), compare = ref(0), split = ref(.5), zoom = ref(1), histogramMode = ref<'rgb' | 'luminance'>('rgb');
const mobilePanelOpen = ref(false);
const histogram = ref<Uint8ClampedArray>(), metadataOpen = ref(false), exporting = ref(false), toast = ref('');
const agentStatus = ref({ available: false, mode: 'local', count: 0 });
const adjustmentVersion = ref(0);
const message = useMessage();
registerLoading((text) => message.loading(text, { duration: 0, closable: false }));
const fileInput = ref<HTMLInputElement>(), folderInput = ref<HTMLInputElement>(), presetInput = ref<HTMLInputElement>();
const camera = computed(() => String(activeAsset.value?.metadata.Make || activeAsset.value?.metadata.make || ''));
const cameraModel = computed(() => String(activeAsset.value?.metadata.Model || activeAsset.value?.metadata.model || ''));
const lens = computed(() => String(activeAsset.value?.metadata.LensModel || activeAsset.value?.metadata.lens || ''));
const dimensions = computed(() => activeAsset.value ? `${activeAsset.value.width} × ${activeAsset.value.height}` : '');
const modifiedPanels = computed(() => {
    adjustmentVersion.value;
    const a = activeAsset.value?.adjustments, modified = new Set<string>(); if (!a) return modified;
    const d = createDefaultAdjustments();
    const basicKeys = ['temperature', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'saturation'] as const;
    if (basicKeys.some((key) => a[key] !== d[key])) modified.add('basic');
    if (JSON.stringify(a.curves) !== JSON.stringify(d.curves)) modified.add('curve');
    for (const key of ['effects', 'grading', 'mixer', 'calibration', 'optics'] as const) if (JSON.stringify(a[key]) !== JSON.stringify(d[key])) modified.add(key);
    return modified;
});
let toastTimer: ReturnType<typeof setTimeout>;

watch(() => activeAsset.value?.adjustments, () => adjustmentVersion.value++, { deep: true, flush: 'sync' });
watch(notice, (message) => { if (!message) return; toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = ''; notice.value = ''; }, 3200); });
function chooseFiles(event: Event) { const input = event.target as HTMLInputElement; void importFiles(Array.from(input.files ?? [])); input.value = ''; }
async function choosePreset(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file || !activeAsset.value) return;
    try {
        await withLoading('正在导入预设…', async () => {
            const parsed = parsePreset(await file.text()), name = file.name.replace(/\.(xmp|json)$/i, '');
            activeAsset.value!.adjustments = parsed;
            await putPreset({ name, xmp: serializePreset(parsed, name), source: 'import' });
            notice.value = `已应用并保存预设 ${file.name}`;
        });
    }
    catch (error) { notice.value = `预设导入失败：${error instanceof Error ? error.message : String(error)}`; }
    input.value = '';
}
function exportPreset() {
    if (!activeAsset.value) return;
    downloadBlob(new Blob([serializePreset(activeAsset.value.adjustments)], { type: 'application/rdf+xml' }), `${activeAsset.value.name.replace(/\.[^.]+$/, '')}.xmp`);
}
async function save(format: 'jpeg' | 'dng') {
    if (!activeAsset.value || exporting.value) return;
    exporting.value = true;
    try {
        await withLoading(format === 'dng' ? '正在生成 DNG…' : '正在导出 JPEG…', () => saveAsset(activeAsset.value!, format));
        notice.value = format === 'dng' ? '已生成调整后的 DNG' : '已导出全尺寸 JPEG';
    }
    catch (error) { notice.value = `导出失败：${error instanceof Error ? error.message : String(error)}`; }
    finally { exporting.value = false; }
}
function reset() { if (activeAsset.value) activeAsset.value.adjustments = createDefaultAdjustments(); }
function keyboard(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '_', '0'].includes(event.key)) { event.preventDefault(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if ((event.target as Element).matches('input, select, textarea') || metadataOpen.value) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); navigate(1); }
    if (event.key === '\\') { event.preventDefault(); compare.value = compare.value === 1 ? 0 : 1; }
    if (event.key.toLowerCase() === 'f') zoom.value = 1;
}
async function entriesFromDrop(data: DataTransfer): Promise<File[]> {
    const files: File[] = [], entries = Array.from(data.items).map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    async function visit(entry: FileSystemEntry): Promise<void> {
        if (entry.isFile) files.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
        else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            while (true) { const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject)); if (!batch.length) break; for (const child of batch) await visit(child); }
        }
    }
    if (entries.length) { for (const entry of entries) await visit(entry!); return files; }
    return Array.from(data.files);
}
async function drop(event: DragEvent) { if (event.dataTransfer) void importFiles(await entriesFromDrop(event.dataTransfer)); }
function preventGesture(event: Event) { event.preventDefault(); }
onMounted(() => { window.addEventListener('keydown', keyboard); document.addEventListener('gesturestart', preventGesture, { passive: false }); agentStatus.value = initWebMCP(); });
onBeforeUnmount(() => { window.removeEventListener('keydown', keyboard); document.removeEventListener('gesturestart', preventGesture); clearTimeout(toastTimer); disposeLoading(); disposeRaw(); });
</script>

<template>
    <main class="camera-raw" :class="{ 'mobile-panel-open': mobilePanelOpen }" @dragover.prevent @drop.prevent="drop" @contextmenu.prevent @wheel.ctrl.prevent>
        <header class="topbar">
            <div class="brand"><CameraOutline class="brand-icon" /><strong>Camera Raw</strong><span>LAB</span></div>
            <div class="document-title"><strong>{{ activeAsset?.name || '未打开图像' }}</strong><span>{{ cameraModel }} {{ dimensions }}</span></div>
            <div class="top-actions">
                <button type="button" title="导入图片" @click="fileInput?.click()"><NIcon><FolderOpenOutline /></NIcon><span>打开</span></button>
                <button type="button" title="导入文件夹" aria-label="导入文件夹" @click="folderInput?.click()"><NIcon><ImagesOutline /></NIcon></button>
                <button type="button" title="查看元数据" aria-label="查看元数据" :disabled="!activeAsset" @click="metadataOpen = true"><NIcon><InformationCircleOutline /></NIcon></button>
                <button class="mobile-edit" type="button" title="打开调整面板" aria-label="打开或关闭调整面板" @click="mobilePanelOpen = !mobilePanelOpen"><NIcon><OptionsOutline /></NIcon><span>调整</span></button>
                <span class="agent-status" :class="{ online: agentStatus.available }" :title="agentStatus.available ? `WebMCP 已注册 ${agentStatus.count} 个工具` : `本地 Agent API 已就绪，${agentStatus.count} 个工具`"><NIcon><HardwareChipOutline /></NIcon>MCP</span>
                <button class="save-button" type="button" :disabled="!activeAsset?.bitmap || exporting" @click="save('dng')"><NIcon><CloudDownloadOutline /></NIcon><span>保存 DNG</span></button>
                <button class="export-button" type="button" :disabled="!activeAsset?.bitmap || exporting" @click="save('jpeg')"><NIcon><DownloadOutline /></NIcon><span>{{ exporting ? '处理中' : '导出 JPG' }}</span></button>
            </div>
        </header>

        <section class="workspace">
            <nav class="left-tools" aria-label="视图工具">
                <button type="button" title="放大" aria-label="放大" :disabled="!activeAsset" @click="zoom = Math.min(4, zoom * 1.25)"><NIcon><Add /></NIcon></button>
                <button type="button" title="缩小" aria-label="缩小" :disabled="!activeAsset" @click="zoom = Math.max(.25, zoom / 1.25)"><NIcon><Remove /></NIcon></button>
                <button type="button" title="适合视图 (F)" @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
            </nav>

            <ImageViewer :asset="activeAsset" :compare="compare" v-model:split="split" v-model:zoom="zoom" @histogram="histogram = $event">
                <div class="empty-workspace">
                    <CameraOutline class="empty-icon" /><h1>在浏览器中冲洗照片</h1><p>将 RAW、JPEG、PNG 图片或整个文件夹拖到这里</p>
                    <div><button type="button" @click="fileInput?.click()">选择图片</button><button type="button" class="secondary" @click="folderInput?.click()">选择文件夹</button></div>
                    <small>支持 ARW · DNG · CR2 / CR3 · NEF · RAF 等格式<br />所有处理均在本机完成</small>
                </div>
            </ImageViewer>

            <aside class="right-panel">
                <div class="histogram-head"><div class="histogram-tools"><span>直方图</span><button type="button" :title="histogramMode === 'rgb' ? '切换为明度直方图' : '切换为 RGB 直方图'" @click="histogramMode = histogramMode === 'rgb' ? 'luminance' : 'rgb'"><NIcon><AnalyticsOutline /></NIcon>{{ histogramMode === 'rgb' ? 'RGB' : '明度' }}</button></div><Histogram :pixels="histogram" :mode="histogramMode" /></div>
                <nav class="panel-tabs" aria-label="调整面板"><button v-for="item in panels" :key="item.id" type="button" :class="{ active: panel === item.id }" :aria-label="item.label" :title="item.label" @click="panel = item.id; mobilePanelOpen = true"><NIcon><component :is="item.icon" /></NIcon><span>{{ item.label }}</span><sup v-if="modifiedPanels.has(item.id)" aria-label="已调整">*</sup></button></nav>
                <div class="panel-scroll"><AdjustmentPanel v-if="activeAsset" v-model="activeAsset.adjustments" :panel="panel" :camera="`${camera} ${cameraModel}`" :lens="lens" @reset="reset" /><div v-else class="no-image">打开图片后开始调整</div></div>
                <div class="preset-actions"><button type="button" :disabled="!activeAsset" @click="presetInput?.click()">导入预设</button><button type="button" :disabled="!activeAsset" @click="exportPreset">导出预设</button></div>
            </aside>
        </section>

        <footer class="bottom-bar">
            <div class="film-toolbar"><span>{{ assets.length ? `${selectedIds.size} / ${assets.length} 张已选` : '胶片栏' }}</span><button type="button" title="撤销 (Cmd/Ctrl+Z)" aria-label="撤销" :disabled="!canUndo" @click="undo"><NIcon><ArrowUndoOutline /></NIcon></button><button type="button" title="恢复 (Cmd/Ctrl+Shift+Z)" aria-label="恢复" :disabled="!canRedo" @click="redo"><NIcon><ArrowRedo /></NIcon></button><button type="button" title="将当前调整同步到所选图片" :disabled="selectedIds.size < 2" @click="syncToSelected"><NIcon><SyncOutline /></NIcon>同步</button><button type="button" title="复位当前图片" aria-label="复位当前图片" :disabled="!activeAsset" @click="reset"><NIcon><RefreshOutline /></NIcon></button><button type="button" title="移除所选图片" aria-label="移除所选图片" :disabled="!assets.length" @click="removeSelected"><NIcon><TrashOutline /></NIcon></button><i /><button type="button" :class="{ active: compare === 1 }" title="查看原图 (\)" aria-label="查看原图" :disabled="!activeAsset" @click="compare = compare === 1 ? 0 : 1"><NIcon><EyeOutline /></NIcon></button><button type="button" :class="{ active: compare === 2 }" title="分屏对比" aria-label="分屏对比" :disabled="!activeAsset" @click="compare = compare === 2 ? 0 : 2"><NIcon><GitCompareOutline /></NIcon></button></div>
            <FilmStrip @add="fileInput?.click()" @files="importFiles" />
        </footer>

        <input ref="fileInput" type="file" hidden multiple accept=".arw,.dng,.cr2,.cr3,.nef,.raf,.orf,.rw2,.jpg,.jpeg,.png,image/jpeg,image/png" @change="chooseFiles" />
        <input ref="folderInput" type="file" hidden multiple webkitdirectory @change="chooseFiles" />
        <input ref="presetInput" type="file" hidden accept=".xmp,.json,application/json" @change="choosePreset" />
        <MetadataDialog :open="metadataOpen" :asset="activeAsset" @close="metadataOpen = false" />
        <div v-if="toast" class="toast" role="status">{{ toast }}</div>
        <div v-if="busy && assets.length" class="import-progress" role="status">正在导入图片…</div>
    </main>
</template>

<style lang="scss">
html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; }
html, body, #app, .naive-container { height: 100%; }
*, *::before, *::after { box-sizing: border-box; }
body { background: #222; color: #ddd; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 12px; }
button, input, select { font: inherit; }
button:focus-visible, select:focus-visible { outline: 2px solid #62b9e8; outline-offset: 2px; }
button:disabled { opacity: .35; cursor: default !important; }
</style>

<style lang="scss" scoped>
.camera-raw { position: relative; display: grid; grid-template-rows: 52px minmax(0, 1fr) 128px; width: 100%; height: 100dvh; min-width: 760px; min-height: 0; overflow: hidden; background: #242424; }
.topbar { display: grid; grid-template-columns: 250px minmax(160px, 1fr) auto; align-items: center; border-bottom: 1px solid #111; background: #2c2c2c; box-shadow: 0 1px #444; z-index: 2; }
.brand { display: flex; align-items: center; gap: 8px; padding-left: 17px; .brand-icon { width: 25px; color: #eee; } strong { font-size: 16px; font-weight: 500; } span { padding: 2px 4px; border: 1px solid #666; color: #999; font-size: 8px; } }
.document-title { min-width: 0; text-align: center; strong, span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } strong { color: #ddd; font-size: 12px; font-weight: 400; } span { margin-top: 3px; color: #888; font-size: 9px; } }
.top-actions { display: flex; align-items: center; gap: 5px; padding-right: 12px; button { display: flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 9px; border: 1px solid #515151; border-radius: 3px; background: #373737; color: #ddd; cursor: pointer; &:hover { background: #444; } } .save-button { margin-left: 7px; } .export-button { border-color: #4686aa; background: #357ca6; color: white; &:hover { background: #438eb9; } } }
.agent-status { display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 5px; color: #888; font-size: 9px; &.online { color: #79c9a0; } }
.workspace { display: grid; grid-template-columns: 42px minmax(0, 1fr) 324px; min-height: 0; }
.left-tools { display: flex; flex-direction: column; align-items: center; gap: 5px; padding-top: 10px; border-right: 1px solid #111; background: #2b2b2b; button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 3px; background: transparent; color: #bbb; font-size: 18px; cursor: pointer; &:hover { background: #444; color: white; } } > span { width: 22px; height: 1px; margin: 6px 0; background: #444; } button:last-child { height: 24px; font-size: 9px; } }
.right-panel { display: grid; grid-template-rows: auto 54px minmax(0, 1fr) 39px; min-height: 0; border-left: 1px solid #111; background: #303030; }
.histogram-head { padding: 0 12px 9px; border-bottom: 1px solid #444; }
.histogram-tools { display: flex; align-items: center; justify-content: space-between; height: 34px; color: #999; font-size: 10px; button { display: flex; align-items: center; gap: 4px; border: 0; background: transparent; color: #aaa; font-size: 9px; cursor: pointer; } }
.panel-tabs { display: grid; grid-template-columns: repeat(8, 1fr); border-bottom: 1px solid #444; button { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; background: transparent; color: #888; font-size: 9px; cursor: pointer; .n-icon { font-size: 17px; } &.active { background: #3a3a3a; color: #fff; box-shadow: inset 0 -2px #6bbbea; } sup { position: absolute; top: 2px; right: 4px; color: #f0c64f; font-size: 15px; font-weight: 700; line-height: 1; } } }
.panel-scroll { min-height: 0; overflow-y: auto; scrollbar-color: #555 #303030; }
.no-image { padding: 35px 0; color: #777; text-align: center; }
.preset-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; padding: 6px 11px; border-top: 1px solid #444; button { border: 1px solid #555; border-radius: 3px; background: #373737; color: #bbb; font-size: 10px; cursor: pointer; &:hover { color: white; background: #444; } } }
.bottom-bar { position: relative; border-top: 1px solid #111; background: #292929; }
.film-toolbar { position: absolute; top: -31px; left: 42px; right: 324px; display: flex; align-items: center; height: 30px; padding: 0 9px; background: #292929; color: #999; font-size: 10px; z-index: 1; > span { margin-right: auto; } > i { width: 1px; height: 16px; margin: 0 5px; background: #484848; } button { display: flex; align-items: center; justify-content: center; gap: 4px; min-width: 25px; height: 23px; margin-left: 3px; padding: 0 5px; border: 0; border-radius: 2px; background: transparent; color: #aaa; cursor: pointer; &:hover { color: white; background: #3b3b3b; } &.active { color: #71c4ef; background: #3b3b3b; } } }
.empty-workspace { text-align: center; color: #aaa; .empty-icon { width: 58px; color: #777; } h1 { margin: 15px 0 8px; color: #ddd; font-size: 20px; font-weight: 400; } p { margin: 0 0 22px; font-size: 12px; } button { height: 32px; padding: 0 18px; border: 1px solid #609abb; border-radius: 3px; background: #397fa6; color: white; cursor: pointer; &.secondary { margin-left: 7px; border-color: #555; background: #383838; color: #ccc; } } small { display: block; margin-top: 22px; color: #6f6f6f; font-size: 10px; line-height: 1.8; } }
.toast { position: fixed; bottom: 145px; left: 50%; z-index: 20; max-width: 520px; transform: translateX(-50%); padding: 10px 16px; border: 1px solid #666; border-radius: 4px; background: #111e; color: #eee; box-shadow: 0 4px 20px #0006; font-size: 12px; }
.import-progress { position: fixed; top: 61px; left: 52px; z-index: 5; padding: 5px 9px; border-radius: 3px; background: #111c; color: #bbb; font-size: 10px; }
.top-actions .mobile-edit { display: none; }
@media (max-width: 800px) {
    .camera-raw { min-width: 0; grid-template-rows: 48px minmax(0, 1fr) 112px; }
    .topbar { grid-template-columns: auto minmax(0, 1fr) auto; }
    .brand { padding-left: 10px; strong, span { display: none; } }
    .document-title { text-align: left; padding: 0 7px; span { display: none; } }
    .top-actions { gap: 3px; padding-right: 6px; button { width: 30px; padding: 0; } button span { display: none; } .save-button { margin-left: 0; } .mobile-edit { display: flex; } .agent-status { display: none; } }
    .workspace { grid-template-columns: 34px minmax(0, 1fr); }
    .right-panel { position: absolute; top: 48px; right: 0; bottom: 112px; z-index: 8; width: min(324px, 86vw); transform: translateX(101%); transition: transform .18s ease; box-shadow: -8px 0 30px #0008; }
    .mobile-panel-open .right-panel { transform: translateX(0); }
    .left-tools button { width: 27px; }
    .film-toolbar { left: 34px; right: 0; }
    .empty-workspace { padding: 18px; h1 { font-size: 17px; } p { line-height: 1.7; } }
}
</style>
