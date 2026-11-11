<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import type { LengthUnit, Point2 } from '../../types';

const props = defineProps<{ modelValue: number; position: Point2; unit: LengthUnit }>();
const emit = defineEmits<{ update: [value: number]; close: [] }>();
const input = ref<HTMLInputElement>();
const draft = ref(props.modelValue.toFixed(2));

watch(() => props.modelValue, (value) => { if (Number(draft.value) !== value) draft.value = value.toFixed(2); });
onMounted(() => nextTick(() => { input.value?.focus(); input.value?.select(); }));

function commit() {
    const value = Number(draft.value);
    if (Number.isFinite(value) && value > 0) emit('update', value);
    else draft.value = props.modelValue.toFixed(2);
}
function step(direction: number) {
    draft.value = String(Math.max(0.01, Math.round((Number(draft.value) + direction) * 100) / 100));
    commit();
}
</script>

<template>
    <div class="shell-thickness" :style="{ left: `${position[0]}px`, top: `${position[1]}px` }" role="group" aria-label="抽壳壁厚" @pointerdown.stop>
        <label for="shell-wall-thickness">壁厚</label>
        <input id="shell-wall-thickness" ref="input" v-model="draft" type="number" min="0.01" step="0.1" inputmode="decimal" @blur="commit" @keydown.enter.prevent="commit" @keydown.up.prevent="step(1)" @keydown.down.prevent="step(-1)" @keydown.esc.prevent="emit('close')">
        <span>{{ unit }}</span>
        <button type="button" aria-label="完成抽壳" title="完成" @click="commit(); emit('close')">✓</button>
    </div>
</template>

<style lang="scss" scoped>
.shell-thickness { position: fixed; z-index: 40; display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 10px; color: var(--model3d-ui-405148); background: var(--model3d-ui-fff); border: 1px solid var(--model3d-ui-d8e2dc); border-radius: 7px; box-shadow: 0 5px 20px #203b3020; font-size: 11px; }
.shell-thickness label { color: var(--model3d-ui-738079); white-space: nowrap; }
.shell-thickness input { width: 62px; padding: 3px 4px; color: inherit; background: transparent; border: 0; border-bottom: 1px solid var(--model3d-ui-a7b8ae); outline: none; font: inherit; font-variant-numeric: tabular-nums; }
.shell-thickness input:focus { border-color: var(--model3d-ui-147d70); }
.shell-thickness button { width: 23px; height: 23px; padding: 0; color: var(--model3d-ui-fff); background: var(--model3d-ui-147d70); border: 0; border-radius: 4px; cursor: pointer; }
.shell-thickness button:focus-visible { outline: 2px solid var(--model3d-ui-147d70); outline-offset: 2px; }
</style>
