<script setup lang="ts">
withDefaults(defineProps<{ label: string; active?: boolean; disabled?: boolean }>(), { active: false, disabled: false });
const emit = defineEmits<{ click: [] }>();
</script>

<template>
    <button type="button" class="ui-tool-button" :class="{ active }" :data-label="label" :aria-label="label" :disabled="disabled" @click="emit('click')">
        <slot />
    </button>
</template>

<style lang="scss" scoped>
.ui-tool-button {
    position: relative;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    margin: 1px 0;
    padding: 0;
    color: #63716a;
    background: #fff;
    border: 1px solid #d4dfd8;
    border-radius: 50%;
    cursor: pointer;
    transition: transform .22s cubic-bezier(.34, 1.56, .64, 1), color .15s ease, border-color .15s ease;

    &::after {
        content: attr(data-label);
        position: absolute;
        left: calc(100% + 8px);
        top: 50%;
        padding: 4px 2px;
        color: #56675d;
        background: transparent;
        font-size: 10px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transform: translate(-5px, -50%);
        transition: transform .16s ease, opacity .16s ease;
    }

    &:hover,
    &.active {
        color: #147d70;
        border-color: #7eb8aa;
    }

    &:hover { transform: scale(1.12); }
    &:hover::after { opacity: 1; transform: translate(0, -50%); }
    &:active { transform: scale(.92); }
    &:disabled { opacity: .28; cursor: default; }
    &:focus-visible { outline: 2px solid #147d70; outline-offset: 2px; }
}
</style>
