<script setup lang="ts">
const props = withDefaults(defineProps<{ label: string; modelValue: number; min?: number; max?: number; step?: number; defaultValue?: number; unit?: string; gradient?: string; disabled?: boolean }>(), {
    min: -100, max: 100, step: 1, defaultValue: 0, unit: '', disabled: false,
});
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const update = (event: Event) => emit('update:modelValue', Number((event.target as HTMLInputElement).value));
</script>

<template>
    <label class="slider-field" :class="{ colorful: props.gradient, disabled: props.disabled }" :style="{ '--slider-gradient': props.gradient }" @dblclick="!props.disabled && emit('update:modelValue', props.defaultValue)">
        <span class="slider-label" :title="`${props.label}，双击复位`">{{ props.label }}</span>
        <input class="slider-range" type="range" :value="props.modelValue" :min="props.min" :max="props.max" :step="props.step" :aria-label="props.label" :disabled="props.disabled" @input="update" />
        <input class="slider-number" type="number" :value="props.modelValue" :min="props.min" :max="props.max" :step="props.step" :aria-label="`${props.label}数值`" :disabled="props.disabled" @input="update" />
        <span v-if="props.unit" class="slider-unit">{{ props.unit }}</span>
    </label>
</template>

<style lang="scss" scoped>
.slider-field { display: grid; grid-template-columns: 76px minmax(70px, 1fr) 44px; align-items: center; min-height: 29px; gap: 7px; position: relative; }
.slider-label { color: #d5d5d5; font-size: 12px; white-space: nowrap; cursor: default; }
.slider-range { appearance: none; width: 100%; height: 17px; margin: 0; background: transparent; cursor: ew-resize; &::-webkit-slider-runnable-track { height: 5px; background: var(--slider-gradient, #777); border-radius: 2px; } &::-webkit-slider-thumb { appearance: none; width: 10px; height: 16px; margin-top: -5.5px; border: 1px solid #eee; border-radius: 2px; background: #c7c7c7; box-shadow: 0 1px 2px #111; } &:focus-visible { outline: 1px solid #55b9eb; outline-offset: 3px; } }
.colorful .slider-range::-webkit-slider-runnable-track { height: 7px; border: 0; background: var(--slider-gradient); background-origin: border-box; box-shadow: none; }
.colorful .slider-range::-webkit-slider-thumb { margin-top: -5px; }
.slider-number { width: 44px; height: 22px; padding: 2px 3px; border: 1px solid transparent; border-radius: 2px; background: transparent; color: #ddd; font-size: 11px; text-align: right; appearance: textfield; &::-webkit-inner-spin-button { display: none; } &:hover, &:focus { border-color: #666; background: #252525; outline: none; } }
.slider-unit { position: absolute; right: 0; pointer-events: none; }
.disabled { opacity: .45; }
</style>
