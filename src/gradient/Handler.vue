<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { useDragUtils } from '../common/dragPointerUtils';
import { useEventListener } from '@vueuse/core';
import { fixNumber } from '../common/math';

const props = defineProps<{
    direction: number;
}>();

const emit = defineEmits<{
    (e: 'update:direction', deg: number): void;
}>();

const { bindTouchStart, bindTouchMove, bindTouchEnd } = useDragUtils({
    onMove(x, y) {
        const deg = Math.atan2(y, x) * 180 / Math.PI + 90;
        emit('update:direction', fixNumber(deg % 360, 0));
    },
});

useEventListener('pointermove', bindTouchMove);
useEventListener('pointerup', bindTouchEnd);
useEventListener('pointerleave', bindTouchEnd);
useEventListener('pointercancel', bindTouchEnd);

</script>

<template>
    <div class="handler" @pointerdown="bindTouchStart">
        <div class="pin" :style="{transform: `rotate(${props.direction}deg)`}"></div>
    </div>
</template>

<style scoped>
.handler {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #eee;
    cursor: pointer;
}

.pin {
    position: absolute;
    left: 50%;
    top: 0;
    height: 50%;
    width: 1px;
    background: #000;
    transform-origin: center bottom;
}
</style>
