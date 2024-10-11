<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, nextTick } from 'vue';
import { BaseParser } from './format/base';
import { cachedRef } from '../common/vue';
import { NButton, NInput, NInputGroup, NTag, useMessage } from 'naive-ui';
import { download } from '../common/common';
import { alphabet, hanzi3500, quotes } from './textMap';
import { type Glyph } from 'opentype.js';

const props = defineProps<{
    fontName: string;
    file: File;
}>();

const emit = defineEmits<{
    (e: 'clip', f: File): void;
}>();

const message = useMessage();

let parser: BaseParser = undefined;
const clipText = cachedRef('font-clip-text', '');

const fontList = ref<string[]>([]);
const ligatureList = ref<{ combo: string; result: Glyph }[]>([]);

async function parseFile() {
    if (!props.file) {
        return;
    }
    const loading = message.loading('解析中...', { duration: 9999999 });

    try {
        parser = new BaseParser(props.file);
        await parser.parse();

        fontList.value = parser.getFontList();
        ligatureList.value = parser.getLigatureList();

        await nextTick();
    } finally {
        loading.destroy();
    }
}

async function clipFile() {
    const loading = message.loading('处理中...', { duration: 9999999 });
    const file = await parser.clip(clipText.value, { familyName: props.fontName });
    loading.destroy();

    emit('clip', file);
    download(file);
}

watch(() => props.file, parseFile, { immediate: true });

function addQuick(text: string) {
    if (clipText.value) {
        clipText.value += '\n';
    }
    clipText.value += text;
}

function log(e: any) {
    console.log(e);
}

function add(char: string) {
    if (!clipText.value.includes(char)) {
        clipText.value += char;
    }
    log(char);
}
</script>

<template>
    <div class="list-wrap">
        <div class="tag">
            <NInputGroup>
                <NTag type="info">{{ props.fontName }} | {{ fontList.length }}</NTag>
            </NInputGroup>
        </div>

        <div class="quick-font">
            <NTag class="quick-text" checkable @click="addQuick(alphabet)">abc123</NTag>
            <NTag class="quick-text" checkable @click="addQuick(quotes)">#@%^</NTag>
            <NTag class="quick-text" checkable @click="addQuick(hanzi3500)">汉字简</NTag>
        </div>

        <div class="flexbox">
            <NInput
                class="clip-input flex"
                type="textarea"
                v-model:value="clipText"
                :style="`font-family:'${props.fontName}';`"
                show-count
                clearable
                placeholder="要裁剪的字集"
            />
            <NButton class="clip-button" type="success" @click="clipFile">裁剪</NButton>
        </div>
        <div class="flexbox char-list-wrap">
            <div class="char-list" :style="`font-family:'${props.fontName}';`">
                <div v-for="item in fontList" :key="item" class="char" @click="add(item)">{{ item }}</div>
            </div>
            <div v-if="ligatureList.length > 0" class="char-list side" :style="`font-family:'${props.fontName}';`">
                <div v-for="item in ligatureList" :key="item.combo" class="ligature">{{ item.combo }}</div>
            </div>
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

.quick-font {
    position: absolute;
    top: -26px;
    right: 10px;
}
.quick-text {
    font-size: 12px;
    cursor: pointer;
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
.clip-input :deep(.n-input__suffix),
.clip-input :deep(.n-input-word-count) {
    font-family: initial;
}

.char-list-wrap {
    height: calc(100% - 100px);
}
.char-list {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    height: 100%;
    overflow: auto;
    user-select: auto;
}
.side {
    display: block;
    padding-left: 4px;
    border-left: 1px solid #eee;
    flex: none;
    width: 15vw;
}
.char {
    width: 30px;
    font-size: 30px;
    text-align: center;
    line-height: 30px;
    cursor: pointer;
}
.char:hover {
    background: rgba(0, 0, 0, 0.1);
}
.ligature {
    max-width: 100%;
    font-size: 30px;
    white-space: nowrap;
    cursor: pointer;
    overflow-x: auto;
}
.ligature:hover {
    background: rgba(0, 0, 0, 0.1);
    font-variant-ligatures: no-common-ligatures;
}
</style>
