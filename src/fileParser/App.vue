<script setup lang="ts">
import { ref, watch } from 'vue';

import DataTable from './views/DataTable.vue';
import FileDrop from './views/FileDrop.vue';
import Rules from './views/Rules.vue';
import Editor from './views/Editor.vue';
import { FileRecords, parse } from './parser';
import { debounce } from 'lodash';
import './dataFormat';

const file = ref<File>(null);
const filter = ref('');
const fileFormat = ref('');

const result = ref([]);
const err = ref<Error>();

async function parseFile() {
    if (!fileFormat.value) {
        return;
    }
    try {
        console.time('parse file');
        const parsedData = await parse(fileFormat.value, file.value);
        result.value = parsedData.data;
        console.log('result-----', result.value);
        console.timeEnd('parse file');
    } catch (e) {
        err.value = e;
        console.warn(err);
    }
}

const parseFileDebounce = debounce(parseFile, 500);

watch(() => [file.value, filter.value, fileFormat.value], parseFileDebounce, {
    immediate: true,
});
</script>

<template>
    <div class="main">
        <FileDrop v-model:file="file" />
        <Editor v-model:format="fileFormat" v-model:filter="filter" />
        <DataTable :result="result" />
        <Rules />
    </div>
</template>

<style scoped lang="scss">
.main {
    min-height: 100vh;
    background: #f5f5f5;
}
</style>
