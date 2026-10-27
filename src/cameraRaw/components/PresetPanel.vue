<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NIcon } from 'naive-ui';
import { SaveOutline, TrashOutline, CloudUploadOutline } from '@vicons/ionicons5';
import type { Adjustments } from '../types';
import { blendAdjustments, cloneAdjustments } from '../engine/adjustments';
import { parsePreset, serializePreset } from '../io/preset';
import { deletePreset, listPresets, putPreset, type StoredPreset } from '../io/presetStore';
import SliderField from './SliderField.vue';

const props = defineProps<{ modelValue: Adjustments }>();
const emit = defineEmits<{ 'update:modelValue': [value: Adjustments] }>();
const presets = ref<StoredPreset[]>([]), amount = ref(100), selectedId = ref(''), presetName = ref(''), status = ref('');
const fileInput = ref<HTMLInputElement>();
let base: Adjustments | undefined;

async function refresh() { presets.value = await listPresets(); }
function report(error: unknown) { status.value = error instanceof Error ? error.message : String(error); }

async function importPresets(event: Event) {
    const input = event.target as HTMLInputElement;
    try {
        for (const file of Array.from(input.files ?? [])) {
            const name = file.name.replace(/\.(xmp|json)$/i, ''), parsed = parsePreset(await file.text());
            await putPreset({ name, xmp: serializePreset(parsed, name), source: 'import' });
        }
        status.value = '预设已导入'; await refresh();
    } catch (error) { report(error); }
    input.value = '';
}

async function saveCurrent() {
    try {
        const name = presetName.value.trim() || `自定义预设 ${presets.value.length + 1}`;
        await putPreset({ name, xmp: serializePreset(props.modelValue, name), source: 'saved' });
        presetName.value = ''; status.value = '已保存当前参数'; await refresh();
    } catch (error) { report(error); }
}

function applyCurrent() {
    const preset = presets.value.find((item) => item.id === selectedId.value);
    if (!preset || !base) return;
    emit('update:modelValue', blendAdjustments(base, parsePreset(preset.xmp), amount.value / 100));
}

function apply(preset: StoredPreset) {
    base = cloneAdjustments(props.modelValue); selectedId.value = preset.id; amount.value = 100; applyCurrent();
}

async function remove(preset: StoredPreset) {
    try { await deletePreset(preset.id); if (selectedId.value === preset.id) { selectedId.value = ''; base = undefined; } await refresh(); }
    catch (error) { report(error); }
}

watch(amount, applyCurrent);
onMounted(() => { void refresh().catch(report); window.addEventListener('camera-raw-presets-changed', refresh); });
onBeforeUnmount(() => window.removeEventListener('camera-raw-presets-changed', refresh));
</script>

<template>
    <div class="preset-panel panel-body">
        <div class="preset-save"><input v-model="presetName" type="text" aria-label="预设名称" placeholder="预设名称" @keydown.enter="saveCurrent" /><button type="button" title="保存当前参数" @click="saveCurrent"><NIcon><SaveOutline /></NIcon>保存</button></div>
        <button class="import-button" type="button" @click="fileInput?.click()"><NIcon><CloudUploadOutline /></NIcon>导入 XMP / JSON 预设</button>
        <input ref="fileInput" hidden type="file" multiple accept=".xmp,.json,application/json" @change="importPresets" />
        <div class="strength"><SliderField v-model="amount" label="应用强度" :min="0" :max="100" :disabled="!selectedId" /><span>%</span></div>
        <p v-if="status" class="preset-status" role="status">{{ status }}</p>
        <p v-if="!presets.length" class="preset-empty">还没有预设。导入 Camera Raw XMP，或保存当前调整。</p>
        <ul v-else class="preset-list" aria-label="已保存预设">
            <li v-for="preset in presets" :key="preset.id" :class="{ selected: selectedId === preset.id }">
                <button class="preset-name" type="button" :title="`应用 ${preset.name}`" @click="apply(preset)"><span>{{ preset.name }}</span><small>{{ preset.source === 'import' ? '导入' : preset.source === 'agent' ? 'Agent' : '保存' }}</small></button>
                <button class="preset-delete" type="button" :aria-label="`删除预设 ${preset.name}`" :title="`删除 ${preset.name}`" @click="remove(preset)"><NIcon><TrashOutline /></NIcon></button>
            </li>
        </ul>
        <p class="hint">先点击预设应用，再拖动强度。0% 保留应用前参数，100% 完整应用预设。</p>
    </div>
</template>

<style lang="scss" scoped>
.preset-save { display: grid; grid-template-columns: 1fr auto; gap: 6px; input { min-width: 0; height: 29px; padding: 0 8px; border: 1px solid #555; border-radius: 3px; background: #272727; color: #ddd; font-size: 11px; } button { display: flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid #555; border-radius: 3px; background: #3a3a3a; color: #ccc; cursor: pointer; } }
.import-button { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; height: 30px; margin-top: 7px; border: 1px solid #555; border-radius: 3px; background: #3a3a3a; color: #ccc; cursor: pointer; }
.strength { position: relative; margin: 15px 0 12px; > span { position: absolute; right: 3px; top: 5px; color: #999; font-size: 9px; pointer-events: none; } }
.preset-status { margin: 0 0 8px; color: #8fbcd2; font-size: 10px; }
.preset-empty, .hint { color: #888; font-size: 10px; line-height: 1.6; }
.preset-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; li { display: grid; grid-template-columns: 1fr 27px; align-items: center; border: 1px solid #454545; border-radius: 3px; background: #2b2b2b; &.selected { border-color: #6c9eb7; background: #35444b; } } }
.preset-name { display: flex; align-items: center; justify-content: space-between; min-width: 0; height: 35px; padding: 0 8px; border: 0; background: transparent; color: #ddd; text-align: left; cursor: pointer; span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { margin-left: 6px; color: #888; font-size: 9px; } }
.preset-delete { display: grid; place-items: center; width: 25px; height: 25px; padding: 0; border: 0; background: transparent; color: #888; cursor: pointer; &:hover { color: #ef8b8b; } }
.hint { margin-top: 14px; }
</style>
