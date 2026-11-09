<script setup lang="ts">
import { computed } from 'vue';
import { useEventListener } from '@vueuse/core';
import { NIcon } from 'naive-ui';
import { AddOutline, BrushOutline, CopyOutline, EyeOffOutline, EyeOutline, RadioButtonOffOutline, RemoveOutline, TrashOutline } from '@vicons/ionicons5';
import type { ImageMask, MaskShape, MaskTool } from '../engine/masks/types';
import type { MaskAdjustmentSection } from '../engine/adjustments';
import { ADJUSTMENT_SECTION_LABELS, MASK_ADJUSTMENT_SECTIONS } from '../engine/adjustments';
import SliderField from './SliderField.vue';
import AdjustmentControls from './AdjustmentControls.vue';

const props = withDefaults(defineProps<{ masks: ImageMask[]; activeMaskId?: string; tool?: MaskTool | ''; mode?: 'add' | 'subtract'; section?: MaskAdjustmentSection }>(), { activeMaskId: undefined, tool: '', mode: 'add', section: 'basic' });
const emit = defineEmits<{
    tool: [tool: MaskTool];
    select: [id: string];
    'update-mask': [mask: ImageMask];
    'update:section': [section: MaskAdjustmentSection];
    remove: [id: string];
    duplicate: [id: string];
    mode: [mode: 'add' | 'subtract'];
    interaction: [active: boolean];
}>();
const active = computed(() => props.masks.find((mask) => mask.id === props.activeMaskId));
const tools: { id: MaskTool; label: string }[] = [{ id: 'brush', label: '画笔' }, { id: 'linear', label: '线性渐变' }, { id: 'radial', label: '径向渐变' }];
let interacting = false;
function patch(mask: ImageMask, values: Partial<ImageMask>) { emit('update-mask', { ...mask, ...values }); }
function patchShape(shape: MaskShape, values: Record<string, unknown>) { if (active.value) emit('update-mask', { ...active.value, shapes: active.value.shapes.map((item) => item.id === shape.id ? { ...item, ...values } as MaskShape : item) }); }
function startAdjustment(event: PointerEvent) {
    if (event.button !== 0 || !(event.target as Element).closest('input[type="range"], .curve-grid, .color-wheel')) return;
    interacting = true; emit('interaction', true);
}
function endAdjustment() {
    if (!interacting) return;
    interacting = false; emit('interaction', false);
}
useEventListener(window, 'pointerup', endAdjustment);
useEventListener(window, 'pointercancel', endAdjustment);
useEventListener(window, 'blur', endAdjustment);
</script>

<template>
    <div class="mask-panel" @pointerdown.capture="startAdjustment">
        <div class="new-mask"><span>新建蒙版</span><div class="mask-tools"><button v-for="item in tools" :key="item.id" type="button" :class="{ active: tool === item.id && mode === 'add' }" @click="emit('select', ''); emit('mode', 'add'); emit('tool', item.id)"><NIcon><BrushOutline v-if="item.id === 'brush'" /><RemoveOutline v-else-if="item.id === 'linear'" /><RadioButtonOffOutline v-else /></NIcon>{{ item.label }}</button></div><small>选择工具后在图像上拖动创建</small></div>
        <div v-if="masks.length" class="mask-list">
            <button v-for="mask in masks" :key="mask.id" type="button" class="mask-row" :class="{ active: mask.id === activeMaskId }" @click="emit('select', mask.id)">
                <span class="mask-name"><NIcon><BrushOutline /></NIcon>{{ mask.name }}</span>
                <span class="mask-row-actions" @click.stop>
                    <NIcon :title="mask.visible ? '隐藏蒙版' : '显示蒙版'" @click="patch(mask, { visible: !mask.visible })"><EyeOffOutline v-if="!mask.visible" /><EyeOutline v-else /></NIcon>
                    <NIcon title="复制蒙版" @click="emit('duplicate', mask.id)"><CopyOutline /></NIcon>
                    <NIcon title="删除蒙版" @click="emit('remove', mask.id)"><TrashOutline /></NIcon>
                </span>
            </button>
        </div>
        <div v-else class="no-mask">尚未创建蒙版</div>
        <template v-if="active">
            <div class="mask-settings">
                <label class="mask-rename"><span>名称</span><input :value="active.name" @change="patch(active, { name: ($event.target as HTMLInputElement).value })" /></label>
                <SliderField :model-value="active.amount" label="蒙版强度" :min="0" :max="100" @update:model-value="patch(active, { amount: $event })" />
                <div class="mask-checks"><label><input type="checkbox" :checked="active.inverted" @change="patch(active, { inverted: ($event.target as HTMLInputElement).checked })" />反相</label><label><input type="checkbox" :checked="active.overlay" @change="patch(active, { overlay: ($event.target as HTMLInputElement).checked })" />显示叠加</label></div>
                <div class="refine-title">添加 / 减去</div><div class="mask-tools compact"><button v-for="item in tools" :key="item.id" type="button" @click="emit('tool', item.id)">{{ item.label }}</button></div>
                <div class="mask-tools compact mode"><button type="button" :class="{ active: mode === 'add' }" @click="emit('mode', 'add')"><NIcon><AddOutline /></NIcon>添加</button><button type="button" :class="{ active: mode === 'subtract' }" @click="emit('mode', 'subtract')"><NIcon><RemoveOutline /></NIcon>减去</button></div>
                <template v-for="shape in active.shapes" :key="shape.id">
                    <div class="shape-settings"><strong>{{ shape.type === 'brush' ? '画笔' : shape.type === 'linear' ? '线性渐变' : '径向渐变' }}</strong>
                        <SliderField :model-value="shape.feather" label="羽化" :min="0" :max="100" @update:model-value="patchShape(shape, { feather: $event })" />
                        <template v-if="shape.type === 'brush'"><SliderField :model-value="shape.size" label="大小" :min="1" :max="100" @update:model-value="patchShape(shape, { size: $event })" /><SliderField :model-value="shape.flow" label="流量" :min="1" :max="100" @update:model-value="patchShape(shape, { flow: $event })" /><SliderField :model-value="shape.density" label="密度" :min="1" :max="100" @update:model-value="patchShape(shape, { density: $event })" /></template>
                    </div>
                </template>
            </div>
            <div class="local-adjustments">
                <div class="local-head"><strong>蒙版内调整</strong></div>
                <div class="local-tabs" role="tablist" aria-label="蒙版调整项目"><button v-for="item in MASK_ADJUSTMENT_SECTIONS" :key="item" type="button" role="tab" :aria-selected="section === item" :class="{ active: section === item }" @click="emit('update:section', item)">{{ ADJUSTMENT_SECTION_LABELS[item] }}</button></div>
                <AdjustmentControls v-model="active.adjustments" :panel="section" local />
            </div>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.mask-panel { padding: 12px 13px 22px; }
.new-mask > span, .refine-title { display: block; margin-bottom: 8px; color: #ccc; font-size: 11px; }
.new-mask small { display: block; margin-top: 8px; color: #777; font-size: 9px; }
.mask-tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; button { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 2px; border: 1px solid #555; border-radius: 3px; background: #353535; color: #bbb; font-size: 10px; cursor: pointer; &.active, &:hover { border-color: #6bbbea; color: white; } .n-icon { font-size: 17px; } } &.compact button { flex-direction: row; justify-content: center; padding: 6px 2px; } &.mode { grid-template-columns: 1fr 1fr; margin-top: 5px; } }
.mask-list { margin: 14px -4px 0; border-top: 1px solid #444; }
.mask-row { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 9px 5px; border: 0; border-bottom: 1px solid #414141; background: transparent; color: #aaa; cursor: pointer; &.active { background: #3b3b3b; color: white; } }
.mask-name { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.mask-row-actions { display: flex; gap: 9px; .n-icon { cursor: pointer; &:hover { color: white; } } }
.no-mask { padding: 24px 0; color: #666; text-align: center; font-size: 10px; }
.mask-settings { padding-top: 12px; }
.mask-rename { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; color: #aaa; font-size: 11px; input { width: 160px; padding: 4px 6px; border: 1px solid #555; background: #292929; color: #ddd; } }
.mask-checks { display: flex; gap: 18px; margin: 10px 0 16px; color: #aaa; font-size: 11px; label { display: flex; align-items: center; gap: 5px; } }
.shape-settings { margin-top: 12px; padding-top: 8px; border-top: 1px solid #444; strong { display: block; margin-bottom: 8px; color: #888; font-size: 10px; font-weight: 400; } }
.local-adjustments { margin: 16px -13px -22px; padding: 0 0 22px; border-top: 1px solid #555; }
.local-head { display: flex; align-items: center; height: 42px; padding: 0 13px; strong { font-size: 12px; font-weight: 500; } }
.local-tabs { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0 13px 12px; button { height: 28px; border: 0; border-bottom: 1px solid #555; background: transparent; color: #888; cursor: pointer; &.active { border-bottom-color: #6bbbea; color: white; } } }
</style>
