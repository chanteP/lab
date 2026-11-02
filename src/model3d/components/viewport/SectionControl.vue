<script setup lang="ts">
import { computed } from 'vue';
import type { LengthUnit } from '../../types';

const props = defineProps<{
    value: number;
    limit: number;
    lengthUnit: LengthUnit;
    displayLength: (value: number) => number;
}>();
const emit = defineEmits<{ update: [value: number] }>();
const valueLabel = computed(() => Number(props.displayLength(props.value).toFixed(2)));
</script>

<template>
    <div class="section-control">
        <label for="model3d-section-range">剖面</label>
        <input id="model3d-section-range" type="range" :min="-limit" :max="limit" step="any" :value="value"
            :aria-valuetext="`${displayLength(value)} ${lengthUnit}`" @input="emit('update', Number(($event.target as HTMLInputElement).value))" />
        <output for="model3d-section-range">{{ valueLabel }} {{ lengthUnit }}</output>
    </div>
</template>

<style lang="scss" scoped>
.section-control { position: absolute; z-index: 7; left: 50%; bottom: 44px; width: min(440px, calc(100% - 410px)); min-width: 240px; display: flex; align-items: center; gap: 12px; padding: 10px 14px; transform: translateX(-50%); color: var(--model3d-ui-527067); background: var(--model3d-ui-surface95); border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 6px; box-shadow: 0 3px 14px var(--model3d-ui-0000000a); backdrop-filter: blur(8px); }
.section-control label { flex: 0 0 auto; font-size: 11px; font-weight: 600; }
.section-control input { flex: 1; min-width: 0; accent-color: var(--model3d-ui-147d70); cursor: ew-resize; }
.section-control output { min-width: 72px; color: var(--model3d-ui-147d70); font-size: 11px; text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) { .section-control { width: calc(100% - 150px); min-width: 0; } .section-control output { min-width: 62px; } }
</style>
