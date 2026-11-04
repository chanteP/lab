<script setup lang="ts">
withDefaults(defineProps<{
    type?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'small' | 'medium';
    disabled?: boolean;
}>(), { type: 'secondary', size: 'medium', disabled: false });
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
    <button type="button" class="app-button" :class="[`is-${type}`, `is-${size}`]" :disabled="disabled" @click="emit('click', $event)"><slot /></button>
</template>

<style lang="scss" scoped>
.app-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid transparent; border-radius: 6px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease; }
.app-button.is-small { min-width: 30px; height: 30px; padding: 0 10px; font-size: 11px; }
.app-button.is-medium { min-width: 34px; height: 34px; padding: 0 14px; font-size: 12px; }
.app-button.is-primary { color: var(--model3d-ui-fff); background: var(--model3d-ui-147d70); border-color: var(--model3d-ui-147d70); }
.app-button.is-primary:hover { background: var(--model3d-ui-0e6a5e); border-color: var(--model3d-ui-0e6a5e); }
.app-button.is-secondary { color: var(--model3d-ui-42554b); background: var(--model3d-ui-fff); border-color: var(--model3d-ui-d4dfd8); }
.app-button.is-secondary:hover { color: var(--model3d-ui-147d70); border-color: var(--model3d-ui-9cc8bb); }
.app-button.is-danger { color: var(--model3d-ui-fff); background: var(--model3d-ui-c94f4f); border-color: var(--model3d-ui-c94f4f); }
.app-button.is-danger:hover { background: var(--model3d-ui-c45757); border-color: var(--model3d-ui-c45757); }
.app-button.is-ghost { color: var(--model3d-ui-64716a); background: transparent; border-color: transparent; }
.app-button.is-ghost:hover { color: var(--model3d-ui-147d70); background: var(--model3d-ui-edf3ef); }
.app-button:disabled { opacity: .35; cursor: not-allowed; }
.app-button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
</style>
