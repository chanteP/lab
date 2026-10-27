<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Grade } from '../types';

const props = defineProps<{ modelValue: Grade; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: Grade] }>();
const wheel = ref<HTMLDivElement>();
const position = computed(() => {
    const radius = props.modelValue.saturation / 100 * 46, angle = (props.modelValue.hue - 90) * Math.PI / 180;
    return { left: `${50 + Math.cos(angle) * radius}%`, top: `${50 + Math.sin(angle) * radius}%` };
});
function update(event: PointerEvent) {
    if (event.buttons !== 1 && event.type === 'pointermove') return;
    const rect = wheel.value!.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width - .5, y = (event.clientY - rect.top) / rect.height - .5;
    const hue = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360, saturation = Math.min(100, Math.hypot(x, y) * 2 / .92 * 100);
    emit('update:modelValue', { ...props.modelValue, hue, saturation });
}
function reset() { emit('update:modelValue', { ...props.modelValue, hue: 0, saturation: 0 }); }
</script>

<template>
    <div class="wheel-control">
        <div ref="wheel" class="color-wheel" role="slider" tabindex="0" :aria-label="props.label" :aria-valuenow="Math.round(props.modelValue.saturation)" title="拖动调整，双击复位" @pointerdown="update" @pointermove="update" @dblclick.stop.prevent="reset">
            <span class="wheel-center" /><span class="wheel-handle" :style="position" />
        </div>
        <span>{{ props.label }}</span>
    </div>
</template>

<style lang="scss" scoped>
.wheel-control { text-align: center; color: #bbb; font-size: 11px; }
.color-wheel { width: 100%; aspect-ratio: 1; position: relative; margin-bottom: 6px; border: 1px solid #555; border-radius: 50%; background: radial-gradient(circle, #7776 0%, transparent 68%), conic-gradient(#f44, #ff4, #4f4, #4ff, #44f, #f4f, #f44); cursor: crosshair; touch-action: none; }
.wheel-center { position: absolute; inset: 16%; border-radius: 50%; background: radial-gradient(circle, #777a, transparent 75%); }
.wheel-handle { position: absolute; width: 11px; height: 11px; transform: translate(-50%, -50%); border: 2px solid white; border-radius: 50%; box-shadow: 0 0 0 1px #111; pointer-events: none; }
</style>
