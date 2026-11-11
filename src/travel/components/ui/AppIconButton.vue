<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
    <button class="icon-button" type="button" :aria-label="label" :title="label">
        <slot />
    </button>
</template>

<style lang="scss" scoped>
.icon-button {
    display: inline-grid; place-items: center; width: 38px; height: 38px; padding: 0;
    border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
    color: rgba(255,255,255,.8); background: rgba(25,32,33,.58); cursor: pointer;
    backdrop-filter: blur(18px); transition: background .2s ease, transform .2s ease, border-color .2s ease;
    &:hover { background: rgba(53,65,63,.76); border-color: rgba(255,255,255,.22); transform: translateY(-1px); }
    &:active { transform: scale(.96); }
    &:focus-visible { outline: 2px solid #d6e9ae; outline-offset: 3px; }
}
</style>
