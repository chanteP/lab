<script setup lang="ts">
import { computed } from 'vue';
import { NIcon } from 'naive-ui';
import { EyeOffOutline, EyeOutline } from '@vicons/ionicons5';
import type { Adjustments } from '../types';
import type { AdjustmentSection, MaskAdjustmentSection } from '../engine/adjustments';
import { ADJUSTMENT_SECTION_LABELS, ADJUSTMENT_SECTIONS } from '../engine/adjustments';
import type { DcpCatalogEntry } from '../engine/dcp/types';
import type { ImageMask, MaskTool } from '../engine/masks/types';
import PresetPanel from './PresetPanel.vue';
import MaskPanel from './MaskPanel.vue';
import AdjustmentControls from './AdjustmentControls.vue';

const props = withDefaults(defineProps<{
    modelValue: Adjustments;
    panel: string;
    maskSection: MaskAdjustmentSection;
    panelHidden?: boolean;
    modifiedSections?: Set<string>;
    camera?: string;
    lens?: string;
    cameraModel?: string;
    dcpCatalog: DcpCatalogEntry[];
    dcpProfileId?: string;
    dcpLoading?: boolean;
    rawSupported?: boolean;
    masks?: ImageMask[];
    activeMaskId?: string;
    maskTool?: MaskTool | '';
    maskMode?: 'add' | 'subtract';
}>(), { cameraModel: '', dcpProfileId: '', dcpLoading: false, rawSupported: true, masks: () => [], activeMaskId: undefined, maskTool: '', maskMode: 'add', panelHidden: false, modifiedSections: () => new Set<string>() });
const emit = defineEmits<{
    reset: [];
    'toggle-hidden': [];
    'update:modelValue': [value: Adjustments];
    'update:panel': [value: AdjustmentSection];
    'update:maskSection': [value: MaskAdjustmentSection];
    'dcp-change': [value: string];
    'dcp-import': [];
    'mask-tool': [tool: MaskTool];
    'mask-select': [id: string];
    'mask-update': [mask: ImageMask];
    'mask-remove': [id: string];
    'mask-duplicate': [id: string];
    'mask-mode': [mode: 'add' | 'subtract'];
    'mask-interaction': [active: boolean];
}>();
const adjustmentPanel = computed(() => ADJUSTMENT_SECTIONS.includes(props.panel as AdjustmentSection));
const title = computed(() => adjustmentPanel.value ? ADJUSTMENT_SECTION_LABELS[props.panel as AdjustmentSection] : props.panel === 'presets' ? '预设' : `蒙版 · ${ADJUSTMENT_SECTION_LABELS[props.maskSection]}`);
const canEdit = computed(() => adjustmentPanel.value || (props.panel === 'masking' && Boolean(props.activeMaskId)));
</script>

<template>
    <section class="adjustment-panel">
        <header>
            <h2>{{ title }}</h2>
            <div v-if="panel !== 'presets'" class="header-actions">
                <button type="button" class="visibility-button" :class="{ active: panelHidden }" :disabled="!canEdit" :title="panelHidden ? `显示${title}调整` : `临时隐藏${title}调整`" :aria-label="panelHidden ? `显示${title}调整` : `隐藏${title}调整`" :aria-pressed="panelHidden" @click="emit('toggle-hidden')"><NIcon><EyeOffOutline v-if="panelHidden" /><EyeOutline v-else /></NIcon></button>
                <button type="button" :disabled="!canEdit" :title="`复位${title}调整`" :aria-label="`复位${title}调整`" @click="emit('reset')">复位</button>
            </div>
        </header>
        <nav v-if="adjustmentPanel" class="section-tabs" aria-label="调整项目"><button v-for="section in ADJUSTMENT_SECTIONS" :key="section" type="button" :class="{ active: panel === section }" :aria-current="panel === section ? 'page' : undefined" @click="emit('update:panel', section)">{{ ADJUSTMENT_SECTION_LABELS[section] }}<sup v-if="modifiedSections.has(section)" aria-label="已调整">*</sup></button></nav>
        <MaskPanel v-if="panel === 'masking'" :masks="masks" :active-mask-id="activeMaskId" :tool="maskTool" :mode="maskMode" :section="maskSection" @update:section="emit('update:maskSection', $event)" @tool="emit('mask-tool', $event)" @select="emit('mask-select', $event)" @update-mask="emit('mask-update', $event)" @remove="emit('mask-remove', $event)" @duplicate="emit('mask-duplicate', $event)" @mode="emit('mask-mode', $event)" @interaction="emit('mask-interaction', $event)" />
        <AdjustmentControls v-else-if="adjustmentPanel" :model-value="modelValue" :panel="panel as AdjustmentSection" :camera="camera" :camera-model="cameraModel" :lens="lens" :dcp-catalog="dcpCatalog" :dcp-profile-id="dcpProfileId" :dcp-loading="dcpLoading" :raw-supported="rawSupported" @dcp-change="emit('dcp-change', $event)" @dcp-import="emit('dcp-import')" />
        <PresetPanel v-show="panel === 'presets'" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    </section>
</template>

<style lang="scss" scoped>
.adjustment-panel { height: 100%; }
header { height: 40px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #454545; h2 { margin: 0; font-size: 13px; font-weight: 500; } button { border: 0; background: transparent; color: #999; font-size: 11px; cursor: pointer; &:hover { color: white; } } }
.header-actions { display: flex; align-items: center; gap: 10px; .visibility-button { display: grid; place-items: center; width: 23px; height: 26px; padding: 0; font-size: 16px; &.active { color: #e7b85c; } } }
.section-tabs { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #454545; button { position: relative; height: 31px; padding: 0; border: 0; border-bottom: 1px solid transparent; background: transparent; color: #888; font-size: 10px; cursor: pointer; &.active { border-bottom-color: #6bbbea; color: white; } &:hover { color: #ddd; } } sup { margin-left: 2px; color: #f0c64f; } }
</style>
