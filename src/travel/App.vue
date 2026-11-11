<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { NIcon, NTooltip, useMessage } from 'naive-ui';
import { InformationCircleOutline } from '@vicons/ionicons5';
import MapCanvas from './components/map/MapCanvas.vue';
import HomeView from './components/home/HomeView.vue';
import TripEditModal from './components/home/TripEditModal.vue';
import PlanView from './components/plan/PlanView.vue';
import { useTravelLibrary } from './composables/useTravelLibrary';
import { useWebMCP } from './composables/useWebMCP';
import type { Place, Trip } from './types';
import { downloadYaml, serializeTrip, serializeTripCollection } from './utils/yaml';

const message = useMessage();
const library = useTravelLibrary();
const { initWebMCP } = useWebMCP();
const routeId = ref('');
const selectedPlace = ref<Place>();
const editorOpen = ref(false);
const editingTrip = ref<Trip>();
const importInput = ref<HTMLInputElement>();
const mcp = ref({ mode: 'local', count: 4 });

const activeTrip = computed(() => library.trips.value.find((trip) => trip.id === routeId.value));

function readRoute() {
    routeId.value = decodeURIComponent(location.hash.match(/^#\/trip\/([^/]+)/)?.[1] || '');
    selectedPlace.value = undefined;
}
useEventListener(window, 'hashchange', readRoute);
readRoute();

function openTrip(id: string) {
    selectedPlace.value = undefined;
    library.rememberTrip(id);
    location.hash = `#/trip/${encodeURIComponent(id)}`;
}
function editTrip(id: string) {
    editingTrip.value = library.trips.value.find((trip) => trip.id === id);
    editorOpen.value = true;
}
function createTrip() {
    editingTrip.value = undefined;
    editorOpen.value = true;
}
async function saveTrip(trip: Trip) {
    const isNew = !editingTrip.value;
    try {
        const saved = await library.saveTrip(trip);
        editorOpen.value = false;
        message.success('旅行计划已保存');
        if (isNew) openTrip(saved.id);
    } catch (error) { message.error((error as Error).message); }
}
function exportTrip(trip: Trip) {
    downloadYaml(serializeTrip(trip), trip.title);
    message.success('YAML 已导出');
}
function exportAll() {
    downloadYaml(serializeTripCollection(library.trips.value), 'atlas-travel-plans');
    message.success(`已导出 ${library.trips.value.length} 个旅行计划`);
}
async function onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
        const imported = await library.importYaml(await file.text());
        message.success(`已导入 ${imported.length} 个旅行计划`);
    } catch (error) { message.error(`导入失败：${(error as Error).message}`); }
}

onMounted(async () => {
    try {
        await library.loadTrips();
        mcp.value = initWebMCP();
    } catch (error) { message.error(`读取旅行计划失败：${(error as Error).message}`); }
});
</script>

<template>
    <main class="travel-app">
        <MapCanvas :trips="library.trips.value" :active-trip="activeTrip" :selected-place="selectedPlace"
            @open-trip="openTrip" @edit-trip="editTrip" @select-place="selectedPlace = $event" />

        <Transition name="home">
            <HomeView v-if="!activeTrip" :trips="library.trips.value" :loading="library.loading.value"
                @import="importInput?.click()" @export-all="exportAll" @create="createTrip" />
        </Transition>
        <Transition name="plan">
            <PlanView v-if="activeTrip" :trip="activeTrip" :selected-place="selectedPlace"
                @back="selectedPlace = undefined" @export="exportTrip(activeTrip)"
                @select-place="selectedPlace = $event" @close-place="selectedPlace = undefined" />
        </Transition>

        <NTooltip trigger="hover" :delay="250" placement="top-end">
            <template #trigger>
                <button class="mcp-info" type="button" aria-label="WebMCP 状态">
                    <NIcon :size="19"><InformationCircleOutline /></NIcon>
                </button>
            </template>
            WebMCP 可用 · {{ mcp.count }} 个 Agent 工具<br>
            <span class="mcp-info__mode">{{ mcp.mode === 'webmcp' ? '原生 WebMCP 已连接' : '本地 Agent bridge 已就绪' }}</span>
        </NTooltip>

        <input ref="importInput" type="file" accept=".yaml,.yml,application/yaml,text/yaml" hidden @change="onImportFile" />
        <TripEditModal :show="editorOpen" :trip="editingTrip" @close="editorOpen = false"
            @save="saveTrip" @export="exportTrip" />
    </main>
</template>

<style lang="scss">
html, body, #app, .naive-container, .travel-app { width: 100%; height: 100%; margin: 0; overflow: hidden; }
body { background: #101516; }
.travel-app {
    position: relative; color: #f3f5ef;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    button, input, textarea { font: inherit; }
}
.mcp-info {
    position: absolute; z-index: 800; right: 22px; bottom: 38px; display: grid; place-items: center;
    width: 34px; height: 34px; padding: 0; border: 1px solid rgba(255,255,255,.13); border-radius: 50%;
    color: rgba(255,255,255,.48); background: rgba(27,35,35,.38); cursor: help;
    backdrop-filter: blur(12px); transition: color .2s ease, background .2s ease, transform .2s ease;
    &:hover { color: #e0efbe; background: rgba(45,56,53,.7); transform: translateY(-2px); }
    &:focus-visible { outline: 2px solid #d6e9ae; outline-offset: 3px; }
}
.mcp-info__mode { color: rgba(255,255,255,.5); }
@media (max-width: 700px) { .mcp-info { right: 14px; bottom: 42px; } }
</style>
