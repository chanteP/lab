<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Viewport, type ViewportCallbacks } from '../../engine/Viewport';
import ViewportOverlay from './ViewportOverlay.vue';
import type { ProjectedViewportOverlay } from '../../engine/viewport/OverlayController';

const props = defineProps<{ callbacks: ViewportCallbacks; suspended?: boolean }>();
const emit = defineEmits<{ ready: [viewport: Viewport] }>();
const viewportElement = ref<HTMLElement>();
const overlayItems = shallowRef<ProjectedViewportOverlay[]>([]);
let viewport: Viewport | undefined;

onMounted(() => {
    viewport = new Viewport(viewportElement.value!, props.callbacks, {
        onOverlaysChange: (items) => overlayItems.value = items,
    });
    emit('ready', viewport);
});

onBeforeUnmount(() => {
    viewport?.dispose();
    viewport = undefined;
});
</script>

<template>
    <div ref="viewportElement" class="viewport">
        <ViewportOverlay v-if="!suspended" :items="overlayItems" :callbacks="callbacks" />
    </div>
</template>
