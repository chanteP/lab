<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';

import { loadScript } from '../common/loader';


import { createFFmpeg, fetchFile, FFmpeg } from '@ffmpeg/ffmpeg';
import NaiveUIContainer from '../common/NaiveUIContainer.vue';
import { NButton, NDivider, NImage, NImageGroup, NInput } from 'naive-ui';

const videoURL = 'https://ffmpegwasm.netlify.app/video/video-15s.avi'

const command = ref('');
const fileMap = new Map<string, string>()
const fileList = ref<{ path: string; src: string }[]>([]);

const ffmpeg = createFFmpeg({
    log: false,
    corePath: `${location.origin}/public/lib/ffmpeg/ffmpeg-core.js`,
});

const loaded = loadFFMPEG();


function refreshFiles() {
    const all = ffmpeg.FS('readdir', './');
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
        ffmpeg.FS('writeFile', `./${path}`, data);
        fileMap.set(path, URL.createObjectURL(file));
    }));

    refreshFiles();
}





async function loadFFMPEG() {
    if (ffmpeg.isLoaded()) {
        return;
    }
    console.time('load wasm');
    await ffmpeg.load();
    console.timeEnd('load wasm');
}

async function convertVideo(file: File) {
    console.time('exec');
    const { name } = file;
    ffmpeg.FS('writeFile', name, await fetchFile(file));
    await ffmpeg.run('-i', name, 'output.mp4');
    const data = ffmpeg.FS('readFile', 'output.mp4');
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
