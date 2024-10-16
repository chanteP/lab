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
    NSelect,
    NSpace,
    NTag,
    useMessage,
} from 'naive-ui';
import { download } from '../common/common';
import { loadFFmpeg, simpleConvertTo } from './utils';

interface Img {
    name: string;
    src: string;
    selected: boolean;
}
const images = ref<Img[]>([]);

const selected = ref<Img[]>([]);
const message = useMessage();

function addImage(file: File) {
    const url = URL.createObjectURL(file);
    images.value.push({ name: file.name, src: url, selected: false });
}
function dropImage(e: DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    Array.from(files).forEach((f) => addImage(f));
}
function selectImage(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const files = target.files;
    Array.from(files).forEach((f) => addImage(f));

    target.value = '';
}

async function convert(type: string) {
    const list = selected.value;

    list.map(async (item) => {
        try{
            const url = await simpleConvertTo(item.src, item.name, type);
            download(url);

            item.selected = false;
        }catch(e){
            message.error(e as string);
            console.error(e);
        }
    });
}

watch(
    () => images.value,
    () => {
        selected.value = images.value.filter((i) => i.selected);
        console.log(images.value, selected.value);
    },
    {
        deep: true,
    },
);

onMounted(async () => {
    const loading = message.loading('初始化中...', { duration: 99999 });
    await loadFFmpeg();
    loading.destroy();
});
</script>

<template>
    <div class="wrap" @dragover.prevent @drop="dropImage">
        <div class="pic-list">
            <div v-for="img in images" :key="img.src" class="dashed-box img" @click="img.selected = !img.selected">
                <img class="thumbnail" :src="img.src" />
            </div>
            <label class="dashed-box add">
                <input type="file" accept="image/*,video/*" multiple @change="selectImage" hidden />
            </label>
        </div>
        <div class="main-side">
            <div class="preview">
                <div v-for="(img, index) in selected" :key="img.src" class="main-pic">
                    <img
                        :src="img.src"
                        :style="`transform: rotate(${((index * 23) % 17) * Math.sign((index % 3) - 1)}deg);`"
                    />
                </div>
            </div>
            <div class="control">
                <NButton type="primary" :disabled="selected.length === 0" size="large" @click="convert('jpg')">
                    to JPG
                </NButton>
                <NButton type="primary" :disabled="selected.length === 0" size="large" @click="convert('png')">
                    to PNG
                </NButton>
                <NButton type="primary" :disabled="selected.length === 0" size="large" @click="convert('mp4')">
                    to mp4
                </NButton>
            </div>
        </div>
    </div>
</template>

<style scoped>
.wrap {
    --noise-color: rgba(0, 0, 0, 0.2);
    --box-color: rgba(43, 43, 43, 0.68);
    position: relative;
    display: flex;
    width: 100vw;
    height: 100vh;
}

.wrap:before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    pointer-events: none;

    background: repeating-radial-gradient(var(--noise-color) 0 0.0001%, #fff 0 0.0002%) 50% 0 / 2500px 2500px,
        repeating-conic-gradient(var(--noise-color) 0 0.0001%, #fff 0 0.0002%) 60% 60% / 2500px 2500px;
    background-blend-mode: difference;
    opacity: 0.07;
    z-index: -1;
}

.pic-list {
    box-sizing: border-box;
    padding: 12px 8px;
    height: 100vh;
    overflow: auto;
    border-right: 1px solid var(--box-color);
}

.dashed-box {
    box-sizing: border-box;
    margin-bottom: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 200px;
    height: 150px;
    cursor: pointer;
    border-radius: 10px;
    overflow: hidden;
}
.img {
    border: 1px solid var(--box-color);
    box-shadow: rgba(0, 0, 0, 0.4) 2px 2px 8px;
}
.add {
    /* border: 6px dashed var(--box-color); */
    opacity: 0.7;
}
.add:after {
    content: '+';
    font-size: 50px;
    font-weight: 700;
    color: var(--box-color);
}
.thumbnail {
    max-width: 100%;
    max-height: 100%;
    box-shadow: rgba(0, 0, 0, 0.4) 0 0 20px 10px;
}

.main-side {
    flex: 1;
    display: flex;
    flex-direction: column;
}
.preview {
    position: relative;
    flex: 1;
}
.main-pic {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: 80%;
    max-height: 80%;
    transform: translate(-50%, -50%);
}
.main-pic img {
    width: 100%;
    height: 100%;
    display: block;
    transition: transform 300ms ease;
    box-shadow: rgba(0, 0, 0, 0.4) 2px 2px 8px;
    transform-origin: center center;
}

.control {
    display: flex;
    margin: 0 12px;
    align-items: center;
    gap: 12px;
    height: 100px;
    line-height: 100px;
}
</style>
