<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    value: number;
    min: number;
    max: number;
    step?: number | string;
    ariaLabel: string;
    ariaValuetext?: string;
    color?: string;
    trackColor?: string;
    disabled?: boolean;
}>(), {
    step: 1,
    color: 'var(--model3d-ui-147d70)',
    trackColor: 'var(--model3d-ui-fff)',
});
const emit = defineEmits<{ 'update:value': [value: number] }>();
const style = computed(() => ({ '--minimal-range-color': props.color, '--minimal-range-track': props.trackColor }));
</script>

<template>
    <input
        class="minimal-range"
        type="range"
        :style="style"
        :value="value"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :aria-valuetext="ariaValuetext"
        @input="emit('update:value', Number(($event.currentTarget as HTMLInputElement).value))"
    />
</template>

<style lang="scss" scoped>
.minimal-range { width: 100%; height: 20px; margin: 0; padding: 0; appearance: none; background: transparent; cursor: ew-resize; }
.minimal-range::-webkit-slider-runnable-track { height: 3px; background: var(--minimal-range-track); border: 0; border-radius: 2px; }
.minimal-range::-webkit-slider-thumb { width: 3px; height: 17px; margin-top: -7px; appearance: none; background: var(--minimal-range-color); border: 0; border-radius: 2px; box-shadow: 0 0 0 0 transparent; transition: box-shadow .15s ease; }
.minimal-range::-moz-range-track { height: 3px; background: var(--minimal-range-track); border: 0; border-radius: 2px; }
.minimal-range::-moz-range-thumb { width: 3px; height: 17px; background: var(--minimal-range-color); border: 0; border-radius: 2px; box-shadow: 0 0 0 0 transparent; transition: box-shadow .15s ease; }
.minimal-range:hover::-webkit-slider-thumb, .minimal-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px color-mix(in srgb, var(--minimal-range-color) 18%, transparent); }
.minimal-range:hover::-moz-range-thumb, .minimal-range:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px color-mix(in srgb, var(--minimal-range-color) 18%, transparent); }
.minimal-range:focus-visible { outline: 0; }
.minimal-range:disabled { opacity: .35; cursor: default; }
</style>
