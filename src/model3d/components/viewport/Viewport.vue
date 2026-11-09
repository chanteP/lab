<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Viewport, type ViewportCallbacks } from '../../engine/Viewport';
import ViewportOverlay from './ViewportOverlay.vue';
import SketchRulerOverlay from './SketchRulerOverlay.vue';
import type { SketchRulerFrame } from '../../engine/sketchRulers';
import type { ProjectedViewportOverlay } from '../../engine/viewport/OverlayController';

const props = defineProps<{ callbacks: ViewportCallbacks; suspended?: boolean; selectedGuideId?: string | null }>();
const emit = defineEmits<{ ready: [viewport: Viewport] }>();
const viewportElement = ref<HTMLElement>();
const overlayItems = shallowRef<ProjectedViewportOverlay[]>([]);
const rulerFrame = shallowRef<SketchRulerFrame | null>(null);
let viewport: Viewport | undefined;

onMounted(() => {
    viewport = new Viewport(viewportElement.value!, props.callbacks, {
        onOverlaysChange: (items) => overlayItems.value = items,
        onSketchRulersChange: (frame) => rulerFrame.value = frame,
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
        <SketchRulerOverlay v-if="!suspended" :frame="rulerFrame" :selected-id="selectedGuideId || null" :callbacks="callbacks" />
    </div>
</template>
