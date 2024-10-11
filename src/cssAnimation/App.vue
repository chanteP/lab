<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, shallowRef } from 'vue';
import {
    NButton,
    NDivider,
    NFlex,
    NImage,
    NImageGroup,
    NInput,
    NInputGroup,
    NInputGroupLabel,
    NInputNumber,
    NSelect,
    NSpace,
    NTag,
    useMessage,
} from 'naive-ui';
import { cachedRef } from '../common/vue';
import type { LayerInfo } from './types';
import Layer from './Layer.vue';
import { nanoid } from 'nanoid';
import Timeline from './Timeline.vue';

const viewSize = cachedRef<{ width: number; height: number }>('cssAnimationViewSize');
const animationInfo = cachedRef<{ duration: number }>('cssAnimationAnimationInfo', { duration: 3000 });
const layers = cachedRef<LayerInfo[]>('cssAnimationLayers', []);
const nodeRefs = new Map<LayerInfo, HTMLElement>();

const $view = ref<HTMLElement>();
const $container = ref<HTMLElement>();

const scaleView = ref(1);

function addLayer(layerInfo?: LayerInfo) {
    const id = nanoid(6);

    const layerData: LayerInfo = layerInfo ?? {
        name: `layer_${id}`,
        id,

        width: 100,
        height: 100,

        keyframes: [],
        animationText: ``,

        children: [],
    };

    layers.value.push(layerData);
}

function fitView() {
    const maxWidth = $view.value.clientWidth;
    const maxHeight = $view.value.clientHeight;
    const padding = 0.95;

    if (!viewSize.value) {
        viewSize.value = {
            width: maxWidth * padding,
            height: maxHeight * padding,
        };
    }

    scaleView.value = Math.max(viewSize.value.width / maxWidth, viewSize.value.height / maxHeight);
}

function reset() {
    viewSize.value = undefined;

    layers.value = [];

    addLayer();
}

watch(() => viewSize.value, fitView);

onMounted(() => {
    fitView();

    if (layers.value.length === 0) {
        addLayer();
    }
});
</script>

<template>
    <div class="wrap">
        <div>
            <NInputGroup>
                <NInputGroupLabel>width</NInputGroupLabel>
                <NInputNumber v-model:value="viewSize.width" />
                <NInputGroupLabel>height</NInputGroupLabel>
                <NInputNumber v-model:value="viewSize.height" />
                <NInputGroupLabel>duration</NInputGroupLabel>
                <NInputNumber v-model:value="animationInfo.duration" />
                <NButton strong secondary type="warning" @click="reset"> Reset </NButton>
            </NInputGroup>
        </div>

        <div ref="$view" class="view">
            <div
                ref="$container"
                class="container"
                :style="`width:${viewSize.width}px;height:${viewSize.height}px;transform: scale(${scaleView})`"
            ></div>
        </div>
        <Timeline :duration="animationInfo.duration">
            <template #tools>
                <div>123</div>
            </template>
            <Layer v-for="(layer, index) in layers" :key="layer.id" :layer="layer" />
        </Timeline>
    </div>
</template>

<style scoped>
.wrap {
    --noise-color: rgba(0, 0, 0, 0.2);
    --box-color: rgba(43, 43, 43, 0.68);
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
}

.view {
    background: #f0f0f0;
    display: flex;
    flex: 1;

    align-items: center;
    justify-content: center;
}
.container {
    position: relative;
    box-shadow: rgba(0, 0, 0, 0.4) 0 0 8px;
    background: #fff;
}

.layers {
    flex: 1;
    overflow: auto;
}
</style>
