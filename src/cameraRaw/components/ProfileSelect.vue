<script setup lang="ts">
import { computed } from 'vue';
import { NIcon, NSelect, NTooltip } from 'naive-ui';
import { WarningOutline } from '@vicons/ionicons5';
import type { DcpCatalogEntry } from '../engine/dcp/types';
import { cameraModelMatches } from '../engine/dcp/parser';

const props = withDefaults(defineProps<{ value?: string; catalog: DcpCatalogEntry[]; cameraModel: string; loading?: boolean; disabled?: boolean }>(), { value: '', loading: false, disabled: false });
const emit = defineEmits<{ change: [value: string]; import: [] }>();
const compatible = computed(() => props.catalog.filter((entry) => cameraModelMatches(props.cameraModel, entry.cameraModel)));
const options = computed(() => [
    { label: '无', value: '' },
    ...(compatible.value.length ? [{ type: 'group' as const, label: `当前相机 · ${props.cameraModel || '未知'}`, key: 'compatible', children: compatible.value.map(option) }] : []),
    { type: 'group' as const, label: '所有 DCP', key: 'all', children: props.catalog.filter((entry) => !compatible.value.includes(entry)).map(option) },
]);
function option(entry: DcpCatalogEntry) { return { label: `${entry.name}${entry.custom ? '（已导入）' : ''}`, value: entry.id }; }
</script>

<template>
    <div class="profile-select">
        <div class="profile-label"><span>相机配置</span><NTooltip trigger="hover"><template #trigger><NIcon class="profile-warning" aria-label="RAW 导出限制"><WarningOutline /></NIcon></template>不支持写回原始 RAW；导出 DNG 时嵌入 DCP，JPG/PNG 会直接烘焙效果。</NTooltip></div>
        <NSelect size="small" filterable :value="value" :options="options" :loading="loading" :disabled="disabled || loading" placeholder="选择 DCP" @update:value="emit('change', $event)" />
        <div class="profile-actions"><span>{{ disabled ? '仅 RAW 支持 DCP' : '矩阵、色调曲线与色彩表' }}</span><button type="button" :disabled="disabled" @click="emit('import')">导入 DCP</button></div>
    </div>
</template>

<style lang="scss" scoped>
.profile-select { padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #444; }
.profile-label { display: flex; align-items: center; gap: 5px; margin-bottom: 7px; color: #ccc; font-size: 11px; }
.profile-warning { color: #e8b339; font-size: 15px; cursor: help; }
.profile-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; span { color: #777; font-size: 9px; } button { padding: 0; border: 0; background: transparent; color: #8fc5df; font-size: 10px; cursor: pointer; &:disabled { color: #555; } } }
</style>
