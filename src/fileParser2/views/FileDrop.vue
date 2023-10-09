<template>
    <label
        class="file-drop"
        :class="{ placeholder: !file }"
        :style="{ backgroundColor: backgroundColor, opacity: progress >= 1 ? 1 : 0.7 }"
        @dragover.prevent="handleDragOver"
        @dragleave="handleLeave"
        @drop.prevent="handleDrop"
    >
        <span v-if="file" class="file-type">{{ file.type }}</span>
        <span v-if="file">{{ file.name }}</span>
        <span v-else>Drop File...</span>
        <input type="file" hidden @change="handleFileChange" />
    </label>
</template>
<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue';
import { genColorFromString } from '../utils';

const props = defineProps<{
    file: File | null;
}>();

const emit = defineEmits<{
    (e: 'update:file', file: File): void;
}>();

const progress = ref(0);
const backgroundColor = ref('');

watch(
    () => props.file,
    () => {
        if (!props.file) {
            return;
        }
        backgroundColor.value = `hsl(${genColorFromString(props.file.name)}, 50%, 65%)`;
    },
);

function handleDragOver(e) {
    backgroundColor.value = `#aaaaaa66`;
}
function handleLeave() {
    if (props.file) {
        return;
    }
    backgroundColor.value = '';
}
function handleDrop(e) {
    emit('update:file', e.dataTransfer.files[0]);
}
function handleFileChange(e) {
    emit('update:file', e.target.files[0]);
}
</script>
<style lang="scss">
.file-drop {
    display: block;
    position: relative;
    margin: 15px;
    border: 4px solid transparent;
    border-radius: 4px;
    height: 150px;
    line-height: 150px;
    text-align: center;
    font-size: 50px;
    color: #fff;
    font-weight: 700;
    white-space: nowrap;
    font-family: fontsc, 'PingFang SC', 'Helvetica Neue For Number', -apple-system, BlinkMacSystemFont, 'Segoe UI',
        Roboto, 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    transition: background, opacity 0.5s ease;
    cursor: pointer;
}
.file-drop:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 4px;
    background-color: none;
    transition: background 0.5s ease;
}
.progress-mark {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 4px;
    background: right top no-repeat;
    background-image: linear-gradient(-90deg, #00000033 0%, #000000cc 100%);
    background-size: 0% 100%;
    pointer-events: none;
    transition: background 0.5s ease;
}
.file-drop:hover:before {
    background-color: #aaaaaa66;
}

.placeholder {
    color: #bbb;
    border: 4px dashed #bbb;
}
.file-type {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    line-height: 2;
    font-size: 25px;
    font-weight: 100;
    color: #fff;
}
</style>
