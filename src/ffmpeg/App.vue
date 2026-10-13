<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';

import { loadScript } from '../common/loader';


import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import NaiveUIContainer from '../common/NaiveUIContainer.vue';
import { NButton, NDivider, NImage, NImageGroup, NInput } from 'naive-ui';

const videoURL = 'https://ffmpegwasm.netlify.app/video/video-15s.avi'

const command = ref('');
const fileMap = new Map<string, string>()
const fileList = ref<{ path: string; src: string }[]>([]);

const ffmpeg = new FFmpeg();
ffmpeg.on('log', ({ message }) => console.log(message));

const loaded = loadFFMPEG();


async function refreshFiles() {
    const all = await ffmpeg.listDir('./');
    console.log('all files:', all);

    fileList.value = all.filter(p => !p.startsWith('.') && !['tmp', 'home', 'dev', 'proc'].includes(p)).map(path => {
        return {
            path,
            src: fileMap.get(path),
        };
    })
}

async function addFile(e: DragEvent) {
    e.preventDefault();

    const files = e.dataTransfer?.files;
    if (!files) {
        return;
    }

    await loaded;

    await Promise.allSettled(Array.from(files).map(async (file, index) => {
        const data = new Uint8Array(await file.arrayBuffer());

        const path = file.name;
        await ffmpeg.writeFile(`./${path}`, data);
        fileMap.set(path, URL.createObjectURL(file));
    }));

    await refreshFiles();
}





let ffmpegLoaded = false;
async function loadFFMPEG() {
    if (ffmpegLoaded) {
        return;
    }
    console.time('load wasm');
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegLoaded = true;
    console.timeEnd('load wasm');
}

async function convertVideo(file: File) {
    console.time('exec');
    const { name } = file;
    await ffmpeg.writeFile(name, await fetchFile(file));
    await ffmpeg.exec(['-i', name, 'output.mp4']);
    const data = await ffmpeg.readFile('output.mp4');
    console.timeEnd('exec');
    return data;
}


</script>

<template>
    <NaiveUIContainer>
        <div class="file-drop" @dragover.prevent @drop.prevent="addFile">
            <NInput type="textarea" v-model:value="command" placeholder="command"></NInput>
            <NButton type="primary">run</NButton>
            <NDivider />
            <NImageGroup>
                <div class="image-item" v-for="file in fileList" :key="file.path">
                    <NImage class="image" :data-name="file.path" width="120" :src="file.src">
                    </NImage>
                    <div class="name">{{ file.path }}</div>
                </div>
            </NImageGroup>
        </div>

    </NaiveUIContainer>
</template>

<style scoped>
.file-drop {
    min-height: 100vh;
}

.image-item {
    display: inline-block;
    padding: 4px;
    margin: 2px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
}

.name {
    text-align: center;
}

.image-item:hover {
    background: rgba(0, 0, 0, .05);
    transition: background 200ms ease 0s;
}
</style>
