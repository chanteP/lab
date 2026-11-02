<script setup lang="ts">
defineProps<{ x: number; y: number; mode: 'union' | 'subtract' }>();
const emit = defineEmits<{ update: [mode: 'union' | 'subtract'] }>();
</script>

<template>
    <div class="direct-boolean-toggle" :style="{ left: `${x}px`, top: `${y + 18}px` }">
        <button type="button" :class="{ active: mode === 'union' }" aria-label="并集 Union" title="并集 Union" @pointerdown.stop @click.stop="emit('update', 'union')">+</button>
        <button type="button" :class="{ active: mode === 'subtract' }" aria-label="差集 Subtract" title="差集 Subtract" @pointerdown.stop @click.stop="emit('update', 'subtract')">−</button>
    </div>
</template>

<style lang="scss" scoped>
.direct-boolean-toggle { position: fixed; z-index: 20; display: flex; gap: 4px; transform: translateX(-50%); }
.direct-boolean-toggle button { width: 10px; height: 10px; display: grid; place-items: center; padding: 0; border: 1px solid var(--model3d-ui-d5ddd8); border-radius: 2px; color: var(--model3d-ui-527067); background: var(--model3d-ui-fff); font-size: 9px; line-height: 1; cursor: pointer; }
.direct-boolean-toggle button.active { color: var(--model3d-ui-fff); border-color: var(--model3d-ui-147d70); background: var(--model3d-ui-147d70); }
.direct-boolean-toggle button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
</style>
