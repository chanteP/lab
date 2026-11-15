<script setup lang="ts">
import { computed } from 'vue';
import { NIcon } from 'naive-ui';
import { SwapVerticalOutline } from '@vicons/ionicons5';
import type { CropSettings } from '../types';
import { centeredCrop, cropDimensions } from '../engine/crop';

const props = defineProps<{ crop?: CropSettings; width: number; height: number }>();
const emit = defineEmits<{ change: [crop?: CropSettings] }>();
const dimensions = computed(() => cropDimensions(props.width, props.height, props.crop));
const selectedRatio = computed(() => {
    const ratio = props.crop?.ratio;
    if (!ratio) return 'custom';
    if (Math.abs(ratio - props.width / props.height) < 1e-6) return 'original';
    return String(ratio);
});
function changeRatio(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'custom') { if (props.crop) emit('change', { ...props.crop, ratio: undefined }); return; }
    const ratio = value === 'original' ? props.width / props.height : Number(value);
    emit('change', centeredCrop(props.width, props.height, ratio, props.crop));
}
function swapRatio() {
    if (props.crop?.ratio) emit('change', centeredCrop(props.width, props.height, 1 / props.crop.ratio, props.crop));
}
</script>

<template>
    <section class="crop-panel">
        <header><h2>裁剪</h2><button type="button" aria-label="复位裁剪" @click="emit('change', undefined)">复位</button></header>
        <div class="crop-body">
            <label class="crop-ratio"><span>长宽比</span><select :value="selectedRatio" aria-label="裁剪长宽比" @change="changeRatio"><option value="custom">自定义</option><option value="original">原始比例</option><option :value="1">1 : 1</option><option :value="4 / 5">4 : 5</option><option :value="5 / 7">5 : 7</option><option :value="3 / 2">3 : 2</option><option :value="16 / 9">16 : 9</option></select></label>
            <button class="swap-button" type="button" :disabled="!crop?.ratio" title="交换长宽方向" aria-label="交换裁剪长宽方向" @click="swapRatio"><NIcon><SwapVerticalOutline /></NIcon><span>交换长宽方向</span></button>
            <div class="crop-size"><span>输出尺寸</span><strong>{{ dimensions.width }} × {{ dimensions.height }}</strong></div>
            <p class="crop-hint">拖动裁剪框移动，拖动边角或边缘缩放。固定比例下按住 Shift 可切换为自由裁剪。</p>
        </div>
    </section>
</template>

<style lang="scss" scoped>
.crop-panel { height: 100%; }
header { height: 40px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #454545; h2 { margin: 0; font-size: 13px; font-weight: 500; } button { border: 0; background: transparent; color: #999; font-size: 11px; cursor: pointer; &:hover { color: white; } } }
.crop-body { padding: 12px 13px 22px; }
.crop-ratio { display: flex; align-items: center; justify-content: space-between; select { width: 145px; height: 28px; padding: 0 7px; border: 1px solid #555; border-radius: 3px; background: #292929; color: #ddd; } }
.swap-button { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 30px; margin-top: 8px; border: 1px solid #555; border-radius: 3px; background: #373737; color: #bbb; cursor: pointer; &:hover { color: white; background: #444; } }
.crop-size { display: flex; justify-content: space-between; margin-top: 18px; padding: 12px 0; border-top: 1px solid #454545; border-bottom: 1px solid #454545; color: #888; strong { color: #ddd; font-weight: 400; } }
.crop-hint { color: #888; font-size: 10px; line-height: 1.7; }
</style>
