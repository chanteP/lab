<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import type { LayerInfo } from './types';
import { NInput, NInputGroup } from 'naive-ui';

const props = defineProps<{
    layer: LayerInfo;
}>();
</script>

<template>
    <div class="layer-wrap">
        <div class="head">
            <NInput class="name" v-model:value="props.layer.name" placeholder="className" passively-activated />
        </div>
        <div class="timeline"></div>
    </div>
</template>

<style scoped>
.layer-wrap {
    /* display: flex; */
    height: 34px;
    line-height: 34px;
}
.name {
    --n-color: rgba(255, 255, 255, 0) !important;
    --n-color-focus: rgba(255, 255, 255, 0.1) !important;
    --n-border: none !important;
    --n-text-color: #adadad !important;
}
.timeline {
    position: relative;
    flex: 1;
    box-sizing: border-box;
    padding: 6px 4px;
    height: 100%;
}
.timeline:before {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 8px;
}
</style>
