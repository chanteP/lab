<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { loadImage } from '../common/loader';

const props = defineProps<{
    src?: string;
}>();

async function getImgData() {
    const img = await loadImage(props.src);

    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, img.width, img.height);
    ctx?.drawImage(img, 0, 0);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function forEachPixel(imageData: ImageData, callback: (r: number, g: number, b: number, a: number) => unknown) {
    let i = 0;
    const len = imageData.data.length;
    while (i < len) {
        callback(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2], imageData.data[i + 3]);
        i += 4;
    }
}

const map = new Map<string, number>();
const colorMap = ref<[string, number][]>([]);
const count = ref(0);

async function setupMap() {
    if (!props.src) {
        return;
    }
    map.clear();
    colorMap.value = [];
    count.value = 0;

    const imageData = await getImgData();
    forEachPixel(imageData, (r, g, b, a) => {
        const key = `rgba(${r},${g},${b},${a / 255})`;
        const count = map.get(key) || 0;
        map.set(key, count + 1);
    });

    colorMap.value = [...map.entries()].sort((a, b) => (a[1] > b[1] ? -1 : 1));
    count.value = map.size;
}

watch(() => props.src, setupMap, {
    immediate: true,
});

function log(color: string, num: number) {
    console.log(color, num);
}
</script>

<template>
    <div>colors: {{ count }}</div>
    <div class="flexbox">
        <div
            class="color-bit"
            v-for="color in colorMap"
            :key="color[0]"
            :style="`background:${color[0]};color:${color[0]}`"
            @click="log(color[0], color[1])"
        >
            <!-- {{ color[1] }} -->
        </div>
    </div>
</template>

<style scoped lang="scss">
.flexbox {
    display: flex;
    flex-wrap: wrap;
    padding: 2px;
    border: 1px solid #dedede;
    max-height: 400px;
    overflow-y: auto;
    background: #fff;
    border-radius: 4px;
}
.color-bit {
    width: 10px;
    height: 10px;
    font-size: 4px;

    &:hover {
        outline: 1px solid currentColor;
        box-shadow: rgba(0, 0, 0, 0.1) 0 0 4px;
    }
}
</style>
