<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, shallowRef } from 'vue';
import { NButton, NDivider, NFlex, NImage, NImageGroup, NInput, NSelect, NSpace, NTag, useMessage } from 'naive-ui';
import Cell from './Cell.vue';
import FontList from './FontList.vue';

import FontPingFang from './PingFang-SC-Regular.ttf';
import FontArial from './Arial.ttf';

const input = ref('字Ay');
const align = ref('baseline');
const weight = ref('normal');
const style = ref('normal');

const message = useMessage();

const currentSelect = ref<{ name: string; file: File }>();

const alignOptions = [
    /* Keyword values */
    'baseline',
    'middle',
    'sub',
    'super',
    'text-top',
    'text-bottom',
    'top',
    'bottom',

    /* <length> values */
    '2em',
    '4px',

    /* <percentage> values */
    '20%',

    /* Global values */
    'inherit',
    'initial',
    'unset',
].map((ali) => ({
    label: ali,
    value: ali,
}));

const weightOptions = [
    'normal',
    'bold',
    'bolder',
    'lighter',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
    '1000',
    '1100',
    '1200',
    '1300',
    '1400',
].map((w) => ({
    label: w,
    value: w,
}));

const styleOptions = ['normal', 'italic', 'oblique'].map((s) => ({
    label: s,
    value: s,
}));

const fonts = ref<File[]>([]);

function remove(font: File) {
    const index = fonts.value.indexOf(font);
    if (index >= 0) {
        fonts.value.splice(index, 1);
    }
}

function addFont(fontFile: File) {
    console.log(`addFont ${fontFile.name}`);
    fonts.value.push(fontFile);
}

function bindDrop() {
    document.documentElement.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // @ts-expect-error
        const files = [...(e.dataTransfer?.files ?? [])];
        files.forEach((file) => {
            addFont(file);
        });
    });
    document.documentElement.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
}

async function loadFont(url: string, filename: string) {
    const loader = message.loading(`${filename} 加载中...`);
    const blob = await fetch(url).then((res) => res.blob());
    loader.destroy();
    return new File([blob], filename);
}

onMounted(async () => {
    bindDrop();

    addFont((await loadFont(FontPingFang, 'PingFang.ttf')) as File);
    addFont((await loadFont(FontArial, 'Arial.ttf')) as File);
});
</script>

<template>
    <NInput v-model:value="input" />
    <NFlex class="select-group">
        <NSelect class="style-select" v-model:value="align" :options="alignOptions"
            ><template #header><div class="select-head">vertical-align</div></template></NSelect
        >
        <NSelect class="style-select" v-model:value="weight" :options="weightOptions"
            ><template #header><div class="select-head">font-weight</div></template></NSelect
        >
        <NSelect class="style-select" v-model:value="style" :options="styleOptions"
            ><template #header><div class="select-head">font-style</div></template></NSelect
        >
    </NFlex>
    <div>
        <NTag v-for="font in fonts" :key="font.name" type="info" closable @close="remove(font)">
            {{ font.name }}
        </NTag>
    </div>

    <div class="line">
        <Cell
            v-for="font in fonts"
            :key="font.name"
            class="font"
            :file="font"
            :style="{ verticalAlign: align, fontWeight: weight, fontStyle: style }"
            @select="currentSelect = $event"
            >{{ input }}</Cell
        >
    </div>

    <!-- <FontList v-if="currentSelect" :font-name="currentSelect.name" :file="currentSelect.file" /> -->
</template>

<style>
body {
    margin: 0;
    /* 确保没有外边距影响背景 */
    background: repeating-linear-gradient(
            to bottom,
            rgba(255, 162, 0, 0.373),
            rgba(255, 162, 0, 0.373) 1px,
            transparent 1px,
            transparent 40px
        ),
        repeating-linear-gradient(to bottom, #e9e9e9, #e9e9e9 1px, transparent 1px, transparent 10px);
    height: 100vh;
    /* 设置body的高度至少为视口的100% */
}

.line {
    margin-top: 105px;
    border-top: 1px solid #333;
    font-size: 100px;
    line-height: 1;
}

.line .font {
    vertical-align: baseline;
}
.select-head {
    color: #ccc;
}
.select-group {
    gap: 0 !important;
}
.style-select {
    flex: 1;
}
</style>
