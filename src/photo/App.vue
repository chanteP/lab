<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, shallowRef, effect } from 'vue';
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
import { parseExif, parseFile } from './exitUtils';
import { exportImage, isSupportedWEBP } from './canvasUtils';
import ColorMap from './ColorMap.vue';

interface Img {
    name: string;
    src: string;
}
const images = ref<Img[]>([]);

const message = useMessage();

const src = ref<string>();
const name = ref<string>();
const groups = ref<Awaited<ReturnType<typeof parseFile>>>();

const APIKEY = 'AIzaSyCCsZTcKlqYk0LzNH8gbwQ290Zpgw9NS7w';

const staticMapURL = computed(() => {
    if (!groups.value.gps) {
        return undefined;
    }
    const latitude = groups.value.gps.fields.find((f) => f.key === 'latitude')?.value;
    const longitude = groups.value.gps.fields.find((f) => f.key === 'longitude')?.value;
    const marker = encodeURIComponent(`color:blue|${latitude},${longitude}`);
    // https://developers.google.com/maps/documentation/maps-static/start?hl=zh-cn#Markers
    return `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=14&size=600x450&maptype=roadmap&markers=${marker}&key=${APIKEY}`;
});

const mapUrl = computed(() => {
    if (!groups.value.gps) {
        return undefined;
    }
    const latitude = groups.value.gps.fields.find((f) => f.key === 'latitude')?.value;
    const longitude = groups.value.gps.fields.find((f) => f.key === 'longitude')?.value;
    return `https://www.google.com/maps/?q=${latitude},${longitude}`;
});

async function addImage(file: File) {
    if (!file) {
        return;
    }
    name.value = file.name;
    src.value = URL.createObjectURL(file);
    groups.value = undefined;

    const exif = await parseFile(file, true);
    console.log(exif);
    groups.value = exif;
}

const width = ref(0);
const height = ref(0);
function getImageInfo(e: Event) {
    const img = e.target as HTMLImageElement;
    width.value = img.naturalWidth;
    height.value = img.naturalHeight;
}

async function dropImage(e: DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    // Array.from(files).forEach((f) => addImage(f));

    try {
        await addImage(files[0]);
    } catch (e) {
        message.error(e.message);
    }
}
async function selectImage(e: InputEvent) {
    e.preventDefault();
    const files = (e.currentTarget as HTMLInputElement).files;
    // Array.from(files).forEach((f) => addImage(f));

    try {
        await addImage(files[0]);
    } catch (e) {
        message.error(e.message);
    }
}

async function transformImageAndDownload(mime: string) {
    const dataUrl = await exportImage(src.value, mime);

    const base64Data = dataUrl.split(',')[1];
    // 将Base64编码的数据转换为二进制数据
    const byteString = atob(base64Data);
    // 将二进制数据转换为8位无符号整型数组
    const mimeString = mime;
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    // 使用二进制数据创建一个Blob对象
    const blob = new Blob([ab], { type: mimeString });
    // 使用Blob对象创建一个File对象
    const file = new File([blob], name.value.replace(/\.[\w]+$/, `.${mime.split('/')[1]}`), { type: mimeString });

    download(file);
}
</script>

<template>
    <div class="wrap" @dragover.prevent @drop="dropImage">
        <template v-if="!src">
            <label class="empty">Drop image here<input type="file" hidden @change="selectImage" /></label>
        </template>
        <template v-else>
            <div class="background" :style="{ backgroundImage: `url(${src})` }"></div>

            <div class="lane">
                <label class="preview info">
                    <img class="thumb" :src="src" @load="getImageInfo" />
                    <input type="file" hidden @change="selectImage" />
                </label>
                <div class="info desc">
                    <div>{{ width }} x {{ height }} = {{ width * height }}</div>
                    <ColorMap :src="src" />
                </div>

                <div class="info">
                    <NSpace>
                        <NButton type="primary" @click="transformImageAndDownload('image/jpeg')">to JPEG</NButton>
                        <NButton type="primary" @click="transformImageAndDownload('image/png')">to PNG</NButton>
                        <NButton v-if="isSupportedWEBP" type="primary" @click="transformImageAndDownload('image/webp')"
                            >to WEBP</NButton
                        >
                    </NSpace>
                </div>

                <div v-if="groups?.ifd0" class="info">
                    <div class="title">{{ groups.ifd0.title }}</div>
                    <div v-for="field in groups.ifd0.fields" class="line">
                        <div class="field">{{ field.name }}</div>
                        <div class="data">{{ field.value }}</div>
                    </div>
                </div>
            </div>

            <div class="lane" v-if="groups">
                <div v-if="groups?.gps" class="info">
                    <div class="title">{{ groups.gps.title }}</div>
                    <div v-for="field in groups.gps.fields" class="line">
                        <div class="field">{{ field.name }}</div>
                        <div class="data">{{ field.value }}</div>
                    </div>
                    <a :href="mapUrl" target="_blank">
                        <img class="google-map" :src="staticMapURL" crossorigin="anonymous" @click="" />
                    </a>
                </div>

                <div v-for="group in groups.others" class="info">
                    <div class="title">{{ group.title }}</div>
                    <div v-for="field in group.fields" class="line">
                        <div class="field">{{ field.name }}</div>
                        <div class="data">{{ field.value }}</div>
                    </div>
                </div>
            </div>

            <div class="lane">
                <div v-if="groups?.exif" class="info">
                    <div class="title">{{ groups.exif.title }}</div>
                    <div v-for="field in groups.exif.fields" class="line">
                        <div class="field">{{ field.name }}</div>
                        <div class="data">{{ field.value }}</div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
<style>
body {
    user-select: auto;
}
</style>

<style scoped>
.wrap {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    min-width: 100vw;
    height: 100vh;
}

.background {
    position: absolute;
    width: 100%;
    height: 100%;
    filter: blur(20px) brightness(0.4);
    background: no-repeat;
    background-size: cover;
    background-position: center center;
    /* transform: scale(1.5); */
    transform-origin: center center;
    z-index: -1;
}
.desc {
    color: #333;
    font-size: 12px;
    text-indent: 2em;
}

.lane {
    flex: 1;
}
.info {
    box-sizing: border-box;
    padding: 2px 2px;
    background: rgba(255, 255, 255, 0.8);
}

.empty {
    box-sizing: border-box;
    display: flex;
    width: 100%;
    height: 100%;
    font-size: 50px;
    font-weight: 700;
    justify-content: center;
    align-items: center;
    border: 8px dashed #ccc;
    color: #ccc;
    border-radius: 5vw;
}
.preview {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
.preview img {
    max-width: 100%;
    max-height: 300px;
}

.thumb {
    display: block;
}

.title {
    box-sizing: border-box;
    padding: 0 4px;
    border-bottom: 1px #ccc solid;
    font-weight: 700;
    font-size: 24px;
    line-height: 2;
    color: #666;
    background: #eee;
}

.line {
    display: flex;
    font-size: 13px;
    line-height: 1.4;
    gap: 4px;
    border-bottom: 1px solid #dedede;
}
.field {
    padding: 8px 3px;
    width: 12em;
    height: 100%;
    text-align: right;
    font-size: 13px;
    line-height: 1.4;
    background: rgb(237, 237, 237);
}
.data {
    padding: 8px 3px;
    text-align: left;
    flex: 1;
    font-size: 13px;
    line-height: 1.4;
    height: 100%;
}

.google-map {
    display: block;
    width: 100%;
    /* height: 300px; */
    border: none;
}
</style>
