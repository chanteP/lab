<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Adjustments, MixerColor } from '../types';
import { MIXER_COLORS, MIXER_LABELS } from '../types';
import SliderField from './SliderField.vue';
import CurveEditor from './CurveEditor.vue';
import ColorWheel from './ColorWheel.vue';
import { MIXER_HUE_SCALE } from '../engine/color';
import PresetPanel from './PresetPanel.vue';

defineProps<{ modelValue: Adjustments; panel: string; camera?: string; lens?: string }>();
const emit = defineEmits<{ reset: []; 'update:modelValue': [value: Adjustments] }>();
const mixerMode = ref<'hue' | 'saturation' | 'luminance'>('hue');
const mixerModeLabel = computed(() => ({ hue: '色相', saturation: '饱和度', luminance: '明亮度' }[mixerMode.value]));
const calibrationHueGradient = (hue: number) => `linear-gradient(90deg, hsl(${hue - 20} 75% 50%) 0%, hsl(${hue} 75% 50%) 50%, hsl(${hue + 20} 75% 50%) 100%)`;
const temperatureGradient = 'linear-gradient(90deg, #428bd1, #b9c8d0, #d8d4c5, #e2a84b)';
const tintGradient = 'linear-gradient(90deg, #50a56c, #a7a7a7, #c64c9b)';
const saturationGradient = 'linear-gradient(90deg, #777, #c64c81)';
const mixerCenters: Record<MixerColor, number> = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 225, purple: 275, magenta: 315 };
function mixerGradient(color: MixerColor) {
    const h = mixerCenters[color];
    if (mixerMode.value === 'hue') return `linear-gradient(90deg, hsl(${h - 100 * MIXER_HUE_SCALE} 75% 50%) 0%, hsl(${h} 75% 50%) 50%, hsl(${h + 100 * MIXER_HUE_SCALE} 75% 50%) 100%)`;
    if (mixerMode.value === 'saturation') return `linear-gradient(90deg, hsl(${h} 0% 50%) 0%, hsl(${h} 100% 50%) 100%)`;
    return `linear-gradient(90deg, #111 0%, hsl(${h} 75% 50%) 50%, #eee 100%)`;
}
const whiteBalance = ref('asShot');
const wbPresets: Record<string, [number, number]> = { daylight: [5, 0], cloudy: [15, 2], shade: [25, 3], tungsten: [-45, -5], fluorescent: [-25, 20], flash: [10, 1] };
function setWhiteBalance(value: string, adjustments: Adjustments) {
    whiteBalance.value = value;
    if (wbPresets[value]) [adjustments.temperature, adjustments.tint] = wbPresets[value];
}
</script>

<template>
    <section class="adjustment-panel">
        <header><h2>{{ { basic: '基本', curve: '曲线', effects: '效果', mixer: '混色器', grading: '颜色分级', calibration: '校准', optics: '光学', presets: '预设' }[panel] }}</h2><button v-if="panel !== 'presets'" type="button" title="复位当前调整" aria-label="复位当前调整" @click="emit('reset')">复位</button></header>
        <div v-if="panel === 'basic'" class="panel-body">
            <label class="select-row"><span>白平衡</span><select :value="whiteBalance" @change="setWhiteBalance(($event.target as HTMLSelectElement).value, modelValue)"><option value="asShot">原照设置</option><option value="daylight">日光</option><option value="cloudy">阴天</option><option value="shade">阴影</option><option value="tungsten">白炽灯</option><option value="fluorescent">荧光灯</option><option value="flash">闪光灯</option></select></label>
            <SliderField v-model="modelValue.temperature" label="色温" :gradient="temperatureGradient" /><SliderField v-model="modelValue.tint" label="色调" :gradient="tintGradient" />
            <div class="separator" />
            <SliderField v-model="modelValue.exposure" label="曝光" :min="-5" :max="5" :step="0.05" />
            <SliderField v-model="modelValue.contrast" label="对比度" /><SliderField v-model="modelValue.highlights" label="高光" />
            <SliderField v-model="modelValue.shadows" label="阴影" /><SliderField v-model="modelValue.whites" label="白色" />
            <SliderField v-model="modelValue.blacks" label="黑色" />
            <div class="separator" />
            <SliderField v-model="modelValue.vibrance" label="自然饱和度" :gradient="saturationGradient" /><SliderField v-model="modelValue.saturation" label="饱和度" :gradient="saturationGradient" />
        </div>
        <div v-else-if="panel === 'curve'" class="panel-body"><CurveEditor v-model="modelValue.curves" /></div>
        <div v-else-if="panel === 'effects'" class="panel-body">
            <SliderField v-model="modelValue.effects.texture" label="纹理" /><SliderField v-model="modelValue.effects.clarity" label="清晰度" />
            <SliderField v-model="modelValue.effects.dehaze" label="去除薄雾" />
            <div class="separator" />
            <SliderField v-model="modelValue.effects.vignette" label="晕影" /><SliderField v-model="modelValue.effects.vignetteMidpoint" label="晕影中点" :min="0" />
            <div class="separator" />
            <SliderField v-model="modelValue.effects.grain" label="颗粒" :min="0" /><SliderField v-model="modelValue.effects.grainSize" label="颗粒大小" :min="0" />
            <SliderField v-model="modelValue.effects.grainRoughness" label="颗粒粗糙度" :min="0" />
        </div>
        <div v-else-if="panel === 'mixer'" class="panel-body">
            <div class="mixer-modes" role="tablist" aria-label="混色调整方式"><button v-for="mode in ['hue', 'saturation', 'luminance'] as const" :key="mode" type="button" role="tab" :aria-selected="mixerMode === mode" :class="{ active: mixerMode === mode }" @click="mixerMode = mode">{{ { hue: '色相', saturation: '饱和度', luminance: '明亮度' }[mode] }}</button></div>
            <div class="mixer-sliders"><SliderField v-for="color in MIXER_COLORS" :key="color" v-model="modelValue.mixer[color][mixerMode]" :label="MIXER_LABELS[color]" :gradient="mixerGradient(color)" /></div>
            <p class="hint">{{ mixerModeLabel }}按 8 个目标色分别调整，渐变方向对应滑杆左右两侧。</p>
        </div>
        <div v-else-if="panel === 'grading'" class="panel-body">
            <div class="wheels"><ColorWheel v-model="modelValue.grading.shadows" label="阴影" /><ColorWheel v-model="modelValue.grading.midtones" label="中间调" /><ColorWheel v-model="modelValue.grading.highlights" label="高光" /></div>
            <SliderField v-model="modelValue.grading.shadows.luminance" label="阴影明度" /><SliderField v-model="modelValue.grading.midtones.luminance" label="中调明度" /><SliderField v-model="modelValue.grading.highlights.luminance" label="高光明度" />
            <div class="separator" /><SliderField v-model="modelValue.grading.blending" label="混合" :min="0" /><SliderField v-model="modelValue.grading.balance" label="平衡" />
        </div>
        <div v-else-if="panel === 'calibration'" class="panel-body">
            <SliderField v-model="modelValue.calibration.shadowTint" label="阴影色调" :gradient="tintGradient" />
            <h3>红原色</h3><SliderField v-model="modelValue.calibration.redHue" label="色相" :gradient="calibrationHueGradient(0)" /><SliderField v-model="modelValue.calibration.redSaturation" label="饱和度" gradient="linear-gradient(90deg, #777, #ed4040)" />
            <h3>绿原色</h3><SliderField v-model="modelValue.calibration.greenHue" label="色相" :gradient="calibrationHueGradient(120)" /><SliderField v-model="modelValue.calibration.greenSaturation" label="饱和度" gradient="linear-gradient(90deg, #777, #42b957)" />
            <h3>蓝原色</h3><SliderField v-model="modelValue.calibration.blueHue" label="色相" :gradient="calibrationHueGradient(240)" /><SliderField v-model="modelValue.calibration.blueSaturation" label="饱和度" gradient="linear-gradient(90deg, #777, #397bd8)" />
        </div>
        <div v-else-if="panel === 'optics'" class="panel-body">
            <div class="profile-info"><span>相机</span><strong>{{ camera || '未识别' }}</strong><span>镜头</span><strong>{{ lens || '未识别；使用手动校正' }}</strong></div>
            <SliderField v-model="modelValue.optics.distortion" label="畸变" /><SliderField v-model="modelValue.optics.chromaticAberration" label="色差" />
            <p class="hint">手动光学调整。自动镜头配置文件仅在可靠识别镜头后启用。</p>
        </div>
        <PresetPanel v-show="panel === 'presets'" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    </section>
</template>

<style lang="scss" scoped>
.adjustment-panel { height: 100%; }
header { height: 40px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #454545; h2 { margin: 0; font-size: 13px; font-weight: 500; } button { border: 0; background: transparent; color: #999; font-size: 11px; cursor: pointer; &:hover { color: white; } } }
.panel-body { padding: 12px 13px 22px; }
.separator { height: 1px; margin: 10px 0; background: #444; }
h3 { margin: 16px 0 6px; color: #ddd; font-size: 12px; font-weight: 500; }
.select-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; font-size: 12px; select { width: 142px; height: 26px; border: 1px solid #555; background: #292929; color: #ddd; font-size: 11px; } }
.mixer-modes { display: grid; grid-template-columns: repeat(3, 1fr); margin: -2px 0 14px; border-bottom: 1px solid #494949; button { height: 31px; border: 0; background: transparent; color: #999; cursor: pointer; &.active { color: #fff; box-shadow: inset 0 -2px #64b9e8; } } }
.mixer-sliders { display: grid; gap: 5px; }
.hint { margin-top: 18px; color: #888; font-size: 10px; line-height: 1.6; }
.wheels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-bottom: 16px; }
.profile-info { display: grid; grid-template-columns: 50px 1fr; gap: 8px; margin-bottom: 18px; font-size: 11px; span { color: #888; } strong { color: #ccc; font-weight: 400; overflow-wrap: anywhere; } }
</style>
