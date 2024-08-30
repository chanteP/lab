<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { useDragUtils } from '../common/dragPointerUtils';
import { NColorPicker } from 'naive-ui';
import { useEventListener } from '@vueuse/core';
import { inRange } from '../common/math';

const props = defineProps<{
    percent: number;
    color: string;
}>();

const emit = defineEmits<{
    (e: 'update:percent', value: number): void;
    (e: 'update:color', value: number): void;
    (e: 'remove'): void;
}>();

const opacity = ref(1);

const $pointer = ref<HTMLElement>();

const REMOVE_OFFSET = 200;

let lastX = 0;
function calcPercent(x: number) {
    const pointerEl = $pointer.value;
    return inRange((lastX + x) / (pointerEl.parentNode as HTMLElement).offsetWidth * 100, 0, 100);
}

const { bindTouchStart, bindTouchMove, bindTouchEnd } = useDragUtils({
    onMoveStart() {
        lastX = $pointer.value.offsetLeft;
    },
    onMove(x, y) {
        const yOffset = Math.abs(y);
        if (yOffset > REMOVE_OFFSET) {
            emit('remove');
        } else {
            opacity.value = (REMOVE_OFFSET - yOffset) / REMOVE_OFFSET;
            emit('update:percent', calcPercent(x));
        }
    },
    onEnd() {
        opacity.value = 1;
    },
});

useEventListener('pointermove', bindTouchMove);
useEventListener('pointerup', bindTouchEnd);
useEventListener('pointerleave', bindTouchEnd);
useEventListener('pointercancel', bindTouchEnd);

</script>

<template>
    <div ref="$pointer" class="point" :style="{ left: `${props.percent}%`, opacity }" @pointerdown="bindTouchStart">
        <NColorPicker class="color" :default-value="props.color" :show-preview="false"
            :style="{ background: props.color }" @update:value="emit('update:color', $event)">
            <template #label>123</template>
        </NColorPicker>
    </div>
</template>

<style scoped>
.point {
    --pointer-bg: rgba(236, 236, 236, 0.9);

    position: absolute;
    display: block;
    top: 0;
    border: 2px var(--pointer-bg) solid;
    border-radius: 0 0 50% 50%;
    transform: translate(-50%, 0);
    cursor: pointer;
    box-shadow: rgba(0, 0, 0, .4) 0 0 8px;
}

.point::before {
    content: '';
    position: absolute;
    left: -2px;
    top: -16px;
    border: transparent 7px solid;
    border-bottom-color: var(--pointer-bg);
    z-index: 1;
}

.color {
    position: relative;
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 0 0 50% 50%;
    z-index: 2;
    cursor: pointer;
    /* color: transparent; */
}

:deep(.n-color-picker-trigger) {
    border: none;
}

:deep(.n-color-picker-trigger__fill) {
    visibility: hidden;
}
</style>
