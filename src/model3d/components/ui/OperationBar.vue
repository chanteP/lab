<script setup lang="ts">
defineProps<{ label: string; closeLabel?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
    <section class="operation-bar" :aria-label="label" @pointerdown.stop>
        <div class="operation-bar__content"><slot /></div>
        <button type="button" class="operation-bar__close" :aria-label="closeLabel || `关闭${label}`" @click="emit('close')">×</button>
    </section>
</template>

<style lang="scss" scoped>
.operation-bar {
    position: absolute;
    z-index: 12;
    top: 12px;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 410px);
    min-height: 42px;
    padding: 6px 7px 6px 12px;
    transform: translateX(-50%);
    color: var(--model3d-ui-42554b);
    background: var(--model3d-ui-surface97);
    border: 1px solid var(--model3d-ui-d4dfd8);
    border-radius: 9px;
    box-shadow: 0 5px 18px var(--model3d-ui-30433b12);
    backdrop-filter: blur(12px);
}
.operation-bar__content { display: flex; align-items: center; gap: 10px; min-width: 0; }
.operation-bar__close { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 30px; padding: 0 0 2px; color: var(--model3d-ui-fff); background: var(--model3d-ui-c94f4f); border: 0; border-radius: 50%; font-size: 23px; line-height: 1; cursor: pointer; }
.operation-bar__close:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
@media (max-width: 1100px) {
    .operation-bar { right: 196px; left: 196px; max-width: none; transform: none; }
}
</style>
