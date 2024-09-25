<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, nextTick } from 'vue';
import { BaseParser } from './format/base';
import { cachedRef } from '../common/vue';
import { NButton, NInput, NTag, useMessage } from 'naive-ui';
import { download } from '../common/common';

const props = defineProps<{
    fontName: string;
    file: File;
}>();

const message = useMessage();

let parser: BaseParser = undefined;
const clipText = cachedRef('font-clip-text', '');

const fontList = ref<string[]>([]);

async function parseFile() {
    if (!props.file) {
        return;
    }
    const loading = message.loading('解析中...', { duration: 9999999 });

    try {
        parser = new BaseParser(props.file);
        await parser.parse();

        fontList.value = parser.getFontList();

        await nextTick();
    } finally {
        loading.destroy();
    }
}

async function clipFile() {
    const loading = message.loading('处理中...', { duration: 9999999 });
    const file = await parser.clip(clipText.value, { familyName: props.fontName });
    loading.destroy();

    download(file);
}

watch(() => props.file, parseFile, { immediate: true });

function log(e: any) {
    console.log(e);
}
</script>

<template>
    <div class="list-wrap">
        <NTag class="tag" type="info">{{ props.fontName }}</NTag>
        <div class="flexbox">
            <NInput class="clip-input flex" type="textarea" v-model:value="clipText" placeholder="要裁剪的字集" />
            <NButton class="clip-button" type="success" @click="clipFile">裁剪</NButton>
        </div>
        <div class="char-list" :style="`font-family:'${props.fontName}';`">
            <div v-for="item in fontList" :key="item" class="char" @click="log(item)">{{ item }}</div>
        </div>
    </div>
</template>

<style scoped>
.list-wrap {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #fefefe;
    border-radius: 8px 8px 0 0;
    height: 50vh;
    box-shadow: rgba(0, 0, 0, 0.4) 0 0 28px;
}
.tag {
    position: absolute;
    top: -26px;
    left: 10px;
}

.flexbox {
    display: flex;
}
.flex {
    flex: 1;
}
.clip-button {
    width: 10em;
    height: 100px;
}
.clip-input {
    height: 100px;
}

.char-list {
    display: flex;
    flex-wrap: wrap;
    height: calc(100% - 100px);
    overflow: auto;
    user-select: auto;
}
.char {
    width: 30px;
    font-size: 30px;
    text-align: center;
    line-height: 30px;
}
.char:hover{
    background: rgba(0,0,0,.1);
}
</style>
