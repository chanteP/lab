<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
    eyebrow: string;
    title?: string;
    items: string[];
    avoidSelector?: string;
}>(), { title: '操作提示', avoidSelector: '.tool-panels' });
const panel = ref<HTMLElement>();
const top = ref(12);
let observer: ResizeObserver;

function updatePosition() {
    const parent = panel.value?.parentElement;
    if (!parent || !panel.value) return;
    const avoid = parent.querySelector<HTMLElement>(props.avoidSelector);
    const availableTop = avoid && avoid.offsetHeight > 0 ? avoid.offsetTop + avoid.offsetHeight + 12 : 12;
    const availableBottom = parent.clientHeight - 92;
    const availableHeight = Math.max(0, availableBottom - availableTop);
    top.value = availableTop + Math.max(0, (availableHeight - panel.value.offsetHeight) / 2);
}

onMounted(() => {
    const parent = panel.value?.parentElement;
    observer = new ResizeObserver(updatePosition);
    if (parent) observer.observe(parent);
    if (panel.value) observer.observe(panel.value);
    const avoid = parent?.querySelector<HTMLElement>(props.avoidSelector);
    if (avoid) observer.observe(avoid);
    updatePosition();
});
watch(() => props.items, () => nextTick(updatePosition), { deep: true });
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
    <aside ref="panel" class="hints-panel" aria-label="操作提示" :style="{ top: `${top}px` }">
        <div class="tool-panel-title"><div><small>{{ eyebrow }}</small><strong>{{ title }}</strong></div></div>
        <ul><li v-for="item in items" :key="item">{{ item }}</li></ul>
    </aside>
</template>

<style lang="scss" scoped>
.hints-panel { position: absolute; z-index: 7; right: 12px; width: 188px; max-height: calc(100% - 110px); padding: 12px; overflow-y: auto; background: transparent; border: 0; border-radius: 8px; box-shadow: none; scrollbar-width: thin; transition: background .16s ease; }
.hints-panel:hover { background: var(--model3d-ui-0000000a); }
.tool-panel-title { margin-bottom: 10px; padding-bottom: 9px; border-bottom: 1px solid var(--model3d-ui-e3e9e5); }
.tool-panel-title > div { display: flex; flex-direction: column; gap: 2px; }
.tool-panel-title small { color: var(--model3d-ui-87938c); font-size: 8px; }
.tool-panel-title strong { font-size: 12px; }
ul { margin: 0; padding-left: 16px; list-style: disc; }
li { margin: 7px 0 0; color: var(--model3d-ui-7e8b83); font-size: 10px; line-height: 1.6; }
</style>
