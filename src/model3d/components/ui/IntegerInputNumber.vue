<script setup lang="ts">
import { NInputNumber } from 'naive-ui';
import { integerStep } from '../../utils/number';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ value: number | null; min?: number; max?: number; step?: number }>(), { step: 1 });
const emit = defineEmits<{ 'update:value': [value: number | null] }>();

function update(direction: 1 | -1) {
    const next = integerStep(props.value ?? 0, direction, props.step);
    emit('update:value', Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, next)));
}
function onButtonDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const button = target.closest('button');
    const root = event.currentTarget as HTMLElement;
    const buttons = root.querySelectorAll('button');
    if (!button || (button !== buttons[0] && button !== buttons[1])) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    update(button === buttons[1] ? 1 : -1);
}
function onWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopImmediatePropagation();
    update(event.deltaY < 0 ? 1 : -1);
}
function onKeydown(event: KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    update(event.key === 'ArrowUp' ? 1 : -1);
}
</script>

<template>
    <NInputNumber v-bind="$attrs" :value="value" :min="min" :max="max" :step="step" @update:value="emit('update:value', $event)"
        @mousedown.capture="onButtonDown" @wheel.capture="onWheel" @keydown.capture="onKeydown" />
</template>
