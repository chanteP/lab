<script setup lang="ts">
import AppButton from './AppButton.vue';

defineProps<{ label: string; closeLabel?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
    <section class="operation-bar" :aria-label="label" @pointerdown.stop>
        <div class="operation-bar__content"><slot /></div>
        <AppButton class="operation-bar__close" type="danger" size="small" :aria-label="closeLabel || `关闭${label}`" @click="emit('close')">×</AppButton>
    </section>
</template>

<style lang="scss" scoped>
.operation-bar {
    position: absolute;
    z-index: 12;
    top: 12px;
    right: 12px;
    left: 144px;
    display: flex;
    align-items: center;
    gap: 10px;
    width: fit-content;
    max-width: calc(100% - 156px);
    min-height: 42px;
    padding: 6px 7px 6px 12px;
    color: var(--model3d-ui-42554b);
    background: var(--model3d-ui-surface97);
    border: 1px solid var(--model3d-ui-d4dfd8);
    border-radius: 9px;
    box-shadow: 0 5px 18px var(--model3d-ui-30433b12);
    backdrop-filter: blur(12px);
}
.operation-bar__content { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; min-width: 0; }
.operation-bar__close { width: 30px; flex: 0 0 30px; padding: 0 0 2px; font-size: 20px; font-weight: 400; line-height: 1; }
@media (max-width: 1100px) {
    .operation-bar { right: 12px; left: 144px; max-width: calc(100% - 156px); }
}
</style>
