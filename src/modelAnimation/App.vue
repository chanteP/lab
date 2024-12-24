<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { type ResourceItem, initContext, render } from './canvasUtils';

const modelResources: ResourceItem[] = [];
const hasModel = ref(false);
const $canvasContext = ref<HTMLCanvasElement>();

function setModel(file: File) {
    const fileExt = file.name.split('.').pop().toLowerCase();

    const resource: ResourceItem = {
        file,
        url: URL.createObjectURL(file),
        type: fileExt,
    };
    const result = render(resource);
    if (!result) {
        return;
    }
    modelResources.push(resource);
    hasModel.value = true;
}

function dropFile(e: DragEvent) {
    e.preventDefault();
    const files = [...e.dataTransfer?.files];

    files.forEach((file) => {
        setModel(file);
    });
}

onMounted(() => {
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => dropFile(e));

    initContext($canvasContext.value);
});
</script>

<template>
    <canvas class="canvas" ref="$canvasContext"></canvas>
    <div class="ui">
        <div v-if="!hasModel" class="drop-tips">DROP FILE HERE</div>
    </div>
</template>

<style>
body {
    background: #000;
}
</style>
<style scoped lang="scss">
.canvas {
    width: 100vw;
    height: 100vh;
}
.ui {
    position: absolute;
    top: 0;
    left: 0;
}
.drop-tips {
    position: absolute;
    width: 100vw;
    height: 100vh;
    line-height: 100vh;
    text-align: center;
    font-weight: 700;
    font-size: 80px;
    color: rgba(255, 255, 255, 0.45);
    text-shadow: rgba(0, 0, 0, 0.2) 0 0 12px;
    background-image: radial-gradient(#1fc3c9ff 0%, #ffffff00 100%);
}
</style>
