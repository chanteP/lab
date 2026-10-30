<script setup lang="ts">
import { computed } from 'vue';
import { NIcon, NPopover } from 'naive-ui';
import { CheckmarkOutline, ChevronDownOutline } from '@vicons/ionicons5';

export interface ViewportToolOption { label: string; value: string | number }

const props = withDefaults(defineProps<{
    label: string;
    subtitle?: string;
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    large?: boolean;
    descriptionOnHover?: boolean;
    options?: ViewportToolOption[];
    modelValue?: string | number;
}>(), {
    active: false,
    disabled: false,
    danger: false,
    large: false,
    descriptionOnHover: true,
    options: () => [],
});
const emit = defineEmits<{ click: []; select: [value: string | number] }>();

const hasDropdown = computed(() => props.options.length > 0);
const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue));
const subtitleLabel = computed(() => selectedOption.value?.label ?? props.subtitle);
</script>

<template>
    <NPopover trigger="hover" placement="bottom-start" :disabled="!hasDropdown" :show-arrow="false" :z-index="30" :content-style="{ padding: '4px', minWidth: '76px' }">
        <template #trigger>
            <button
                type="button"
                class="viewport-tool-item"
                :class="{ active, danger, large, 'description-on-hover': descriptionOnHover }"
                :aria-label="label"
                :disabled="disabled"
                @click="emit('click')"
            >
                <span class="viewport-tool-item__icon" aria-hidden="true"><slot /></span>
                <span class="viewport-tool-item__description">
                    <strong class="viewport-tool-item__title">{{ label }}</strong>
                    <small v-if="subtitleLabel || hasDropdown" class="viewport-tool-item__subtitle">
                        {{ subtitleLabel }}<NIcon v-if="hasDropdown"><ChevronDownOutline /></NIcon>
                    </small>
                </span>
            </button>
        </template>
        <div v-if="hasDropdown" class="viewport-tool-options">
            <button v-for="option in options" :key="option.value" type="button" :class="{ active: option.value === modelValue }" @click="emit('select', option.value)">
                <span>{{ option.label }}</span><NIcon v-if="option.value === modelValue"><CheckmarkOutline /></NIcon>
            </button>
        </div>
    </NPopover>
</template>

<style lang="scss" scoped>
.viewport-tool-item {
    position: relative;
    width: 100%;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    margin: 0;
    padding: 3px 5px;
    color: var(--model3d-ui-4d5e54);
    background: transparent;
    border: 0;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: color .15s ease;
}
.viewport-tool-item__icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex: 0 0 30px;
    color: var(--model3d-ui-4d675b);
    background: var(--model3d-ui-fff);
    border: 1px solid var(--model3d-ui-dfe6e1);
    border-radius: 50%;
    font-size: 16px;
    transition: transform .22s cubic-bezier(.34, 1.56, .64, 1), color .15s ease, border-color .15s ease;
}
.viewport-tool-item__description { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; background: transparent; text-shadow: 0 1px 2px var(--model3d-ui-f4f7f4); }
.viewport-tool-item__title { font-size: 11px; font-weight: 550; line-height: 1.25; white-space: nowrap; }
.viewport-tool-item__subtitle { display: flex; align-items: center; gap: 2px; color: var(--model3d-ui-89958e); font-size: 10px; font-weight: 400; line-height: 1.3; white-space: nowrap; }
.viewport-tool-item__subtitle .n-icon { font-size: 10px; }
.viewport-tool-item:hover, .viewport-tool-item.active { color: var(--model3d-ui-147d70); }
.viewport-tool-item:hover .viewport-tool-item__icon { color: var(--model3d-ui-147d70); border-color: var(--model3d-ui-7eb8aa); transform: scale(1.12); }
.viewport-tool-item.active .viewport-tool-item__icon { color: var(--model3d-ui-147d70); border-color: var(--model3d-ui-8fc4b7); }
.viewport-tool-item:active .viewport-tool-item__icon { transform: scale(.9); }
.viewport-tool-item:disabled { opacity: .28; cursor: default; }
.viewport-tool-item:disabled .viewport-tool-item__icon { transform: none; }
.viewport-tool-item:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }

.viewport-tool-item.description-on-hover { width: 34px; min-height: 34px; gap: 0; padding: 1px; }
.description-on-hover .viewport-tool-item__description { position: absolute; z-index: 2; left: calc(100% + 8px); top: 50%; opacity: 0; pointer-events: none; transform: translate(-5px, -50%); transition: transform .16s ease, opacity .16s ease; }
.description-on-hover:hover .viewport-tool-item__description, .description-on-hover:focus-visible .viewport-tool-item__description { opacity: 1; transform: translate(0, -50%); }

.viewport-tool-item.danger { color: var(--model3d-ui-c94f4f); }
.viewport-tool-item.danger .viewport-tool-item__icon { color: var(--model3d-ui-c94f4f); border-color: var(--model3d-ui-e2bcbc); }
.viewport-tool-item.danger:hover .viewport-tool-item__icon { color: var(--model3d-ui-fff); background: var(--model3d-ui-c94f4f); border-color: var(--model3d-ui-c94f4f); }
.viewport-tool-item.large { min-height: 46px; }
.viewport-tool-item.large .viewport-tool-item__icon { width: 36px; height: 36px; flex-basis: 36px; color: var(--model3d-ui-fff); background: var(--model3d-ui-c94f4f); border-color: var(--model3d-ui-ffffff70); font-size: 19px; }
.viewport-tool-item.large .viewport-tool-item__title { font-size: 14px; font-weight: 700; }

.viewport-tool-options { display: flex; flex-direction: column; gap: 2px; }
.viewport-tool-options button { min-width: 68px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 8px; color: var(--model3d-ui-56675d); background: transparent; border: 0; border-radius: 4px; font-size: 10px; text-align: left; cursor: pointer; }
.viewport-tool-options button:hover, .viewport-tool-options button.active { color: var(--model3d-ui-147d70); background: var(--model3d-ui-edf3ef); }
.viewport-tool-options button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 1px; }
</style>
