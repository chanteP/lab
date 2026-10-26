<script setup lang="ts">
const props = withDefaults(defineProps<{ label: string; modelValue: number; min?: number; max?: number; step?: number; defaultValue?: number; unit?: string }>(), {
    min: -100, max: 100, step: 1, defaultValue: 0, unit: '',
});
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const update = (event: Event) => emit('update:modelValue', Number((event.target as HTMLInputElement).value));
</script>

<template>
    <label class="slider-field" @dblclick="emit('update:modelValue', props.defaultValue)">
        <span class="slider-label" :title="`${props.label}，双击复位`">{{ props.label }}</span>
        <input class="slider-range" type="range" :value="props.modelValue" :min="props.min" :max="props.max" :step="props.step" :aria-label="props.label" @input="update" />
        <input class="slider-number" type="number" :value="props.modelValue" :min="props.min" :max="props.max" :step="props.step" :aria-label="`${props.label}数值`" @input="update" />
        <span v-if="props.unit" class="slider-unit">{{ props.unit }}</span>
    </label>
</template>

<style lang="scss" scoped>
.slider-field { display: grid; grid-template-columns: 76px minmax(70px, 1fr) 44px; align-items: center; min-height: 29px; gap: 7px; position: relative; }
.slider-label { color: #d5d5d5; font-size: 12px; white-space: nowrap; cursor: default; }
.slider-range { appearance: none; width: 100%; height: 14px; margin: 0; background: transparent; cursor: ew-resize; &::-webkit-slider-runnable-track { height: 3px; background: #777; border-radius: 2px; } &::-webkit-slider-thumb { appearance: none; width: 9px; height: 13px; margin-top: -5px; border: 1px solid #ddd; border-radius: 2px; background: #c7c7c7; box-shadow: 0 1px 2px #111; } &:focus-visible { outline: 1px solid #55b9eb; outline-offset: 3px; } }
.slider-number { width: 44px; height: 22px; padding: 2px 3px; border: 1px solid transparent; border-radius: 2px; background: transparent; color: #ddd; font-size: 11px; text-align: right; appearance: textfield; &::-webkit-inner-spin-button { display: none; } &:hover, &:focus { border-color: #666; background: #252525; outline: none; } }
.slider-unit { position: absolute; right: 0; pointer-events: none; }
</style>
