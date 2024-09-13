<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import { BaseParser } from './format/base';
import { getParser } from './format';

const props = defineProps<{
    fontName: string;
    file: File;
}>();

let parser: BaseParser = undefined;

const fontList = ref<string[]>([]);

async function parseFile() {
    if (!props.file) {
        return;
    }
    parser = new (getParser(props.file))(props.file);
    await parser.parse();
    fontList.value = parser.getFontList();
}

watch(() => props.file, parseFile, { immediate: true });
</script>

<template>
    <div class="list-wrap"></div>
    <div :style="`font-family:${props.fontName};`">
        <div v-for="item in fontList" :key="item">{{ item }}</div>
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
</style>
