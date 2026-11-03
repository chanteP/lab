<script setup lang="ts">
withDefaults(defineProps<{
    /** Arrow edge; omit it for a plain floating panel. */
    arrow?: 'top' | 'right' | 'bottom' | 'left';
    /** Distance from the panel's left/top edge to the arrow center. */
    arrowOffset?: number;
    label?: string;
}>(), { label: '浮层' });
</script>

<template>
    <section
        class="floating-panel"
        :class="arrow ? `has-arrow arrow-${arrow}` : ''"
        :style="{ '--floating-arrow-offset': arrowOffset === undefined ? '50%' : `${arrowOffset}px` }"
        role="dialog"
        aria-modal="false"
        :aria-label="label"
    >
        <div class="floating-panel-content"><slot /></div>
        <i v-if="arrow" class="floating-panel-arrow" aria-hidden="true"></i>
    </section>
</template>

<style lang="scss" scoped>
.floating-panel {
    position: absolute;
    z-index: 12;
    padding: 12px;
    color: var(--model3d-ui-314139);
    background: var(--model3d-ui-panelSurface);
    border: .5px solid var(--model3d-ui-panelBorder);
    border-radius: 10px;
    box-shadow: 0 8px 28px var(--model3d-ui-2c433616);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
}
.floating-panel-content { position: relative; z-index: 1; }
.floating-panel-arrow {
    position: absolute;
    z-index: 2;
    width: 10px;
    height: 10px;
    background: var(--model3d-ui-panelSurface);
    border: 0 solid var(--model3d-ui-panelBorder);
    transform: rotate(45deg);
    pointer-events: none;
}
.arrow-top .floating-panel-arrow { top: -5px; left: calc(var(--floating-arrow-offset) - 5px); border-top-width: .5px; border-left-width: .5px; }
.arrow-bottom .floating-panel-arrow { bottom: -5px; left: calc(var(--floating-arrow-offset) - 5px); border-right-width: .5px; border-bottom-width: .5px; }
.arrow-left .floating-panel-arrow { top: calc(var(--floating-arrow-offset) - 5px); left: -5px; border-bottom-width: .5px; border-left-width: .5px; }
.arrow-right .floating-panel-arrow { top: calc(var(--floating-arrow-offset) - 5px); right: -5px; border-top-width: .5px; border-right-width: .5px; }
</style>
