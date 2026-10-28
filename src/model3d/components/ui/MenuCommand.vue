<script setup lang="ts">
withDefaults(defineProps<{ title: string; subtitle?: string; active?: boolean; disabled?: boolean }>(), { subtitle: '', active: false, disabled: false });
const emit = defineEmits<{ click: [] }>();
</script>

<template>
    <button type="button" class="menu-command" :class="{ active }" :disabled="disabled" :aria-label="subtitle ? `${title}，${subtitle}` : title" @click="emit('click')">
        <span class="menu-command__icon" aria-hidden="true"><slot /></span>
        <span class="menu-command__text">
            <strong>{{ title }}</strong>
            <small v-if="subtitle">{{ subtitle }}</small>
        </span>
    </button>
</template>

<style lang="scss" scoped>
.menu-command {
    width: 100%;
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 2px 0;
    padding: 4px 6px;
    color: #56675d;
    background: transparent;
    border: 0;
    text-align: left;
    cursor: pointer;

    &__icon {
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        flex: 0 0 24px;
        color: #668078;
        font-size: 19px;
        transition: transform .22s cubic-bezier(.34, 1.56, .64, 1), color .15s ease;
    }

    &__text {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        line-height: 1.25;
        transition: transform .22s cubic-bezier(.34, 1.56, .64, 1);
        transform-origin: left center;
    }

    strong { font-size: 11px; font-weight: 600; }
    small { color: #89958e; font-size: 9px; }
    &:hover &__icon { color: #147d70; transform: scale(1.16); }
    &:hover &__text { transform: scale(1.045); }
    &:active &__icon { transform: scale(.9); }
    &.active { color: #147d70; background: transparent; }
    &:disabled { opacity: .3; cursor: default; }
    &:focus-visible { outline: 2px solid #147d70; outline-offset: 1px; }
}
</style>
