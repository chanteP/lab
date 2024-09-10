<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import IconAdd from '@vicons/ionicons5/Add';

import { NIcon } from 'naive-ui';

const props = defineProps<{
    accepts?: string;
}>();

const emit = defineEmits<{
    (e: 'dropFile', files: File[]): void;
}>();

const hasFile = ref(false);

function checkFiles(files: FileList) {
    hasFile.value = true;
    // @ts-expect-error
    emit('dropFile', [...files]);
}

function uploadFile(e: Event) {
    const inputEl = e.currentTarget as HTMLInputElement;
    checkFiles(inputEl.files);
}

function dropData(e: DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    checkFiles(files);
}
</script>

<template>
    <label class="img-upload" @dragover.prevent @drop="dropData">
        <input class="uploader" type="file" :accept="props.accepts" @change="uploadFile" />
        <template v-if="!hasFile">
            <slot name="empty">
                <NIcon class="icon-add"><IconAdd /></NIcon>
            </slot>
        </template>
        <template v-else>
            <slot></slot>
        </template>
    </label>
</template>

<style scoped lang="scss">
.img-upload {
    display: flex;
    border: dashed 3px #dedede;
    min-height: 200px;
    justify-content: center;
    align-items: center;
    cursor: pointer;
}
.uploader {
    display: none;
}
.icon-add {
    color: #ccc;
    font-size: 80px;
    font-weight: bold;
}
</style>
