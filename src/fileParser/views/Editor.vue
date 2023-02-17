<script setup lang="ts">
import { onMounted, ref, type Ref, computed, watch } from 'vue';
import { NForm, NInput, NButton, NSelect } from 'naive-ui';
import { insetFileFormat } from '../parser';

const localCacheKey = 'localFileFormat';

const props = defineProps<{
    filter: string;
    format: string;
}>();

const emit = defineEmits<{
    (e: 'update:filter', filter: string): void;
    (e: 'update:format', format: string): void;
}>();

const fileFormat = [
    {
        type: 'group',
        label: 'inset',
        children: insetFileFormat.map((fileFormat) => {
            return {
                label: fileFormat.name,
                value: fileFormat.format,
            };
        }),
    },
];

const currentFormat = ref('');
const fileFormatList = ref(fileFormat);
const currentFileFormatSelected = ref();

function setFormat(value: string) {
    currentFormat.value = value;
}

watch(
    () => currentFormat.value,
    () => {
        console.error('change----')
        localStorage.setItem(localCacheKey, currentFormat.value);
        emit('update:format', currentFormat.value);
    },
);

onMounted(() => {
    currentFormat.value = localStorage.getItem(localCacheKey) ?? '';
});
</script>

<template>
    <div class="editor" inline>
        <NForm inline class="inline-form">
            <NSelect
                class="format-list"
                v-model:value="currentFileFormatSelected"
                :options="fileFormatList"
                placeholder="file format"
                @change="setFormat"
            />
            <NButton>saveAs</NButton>
            <div class="flex1"></div>
            <NInput class="filter" v-model:value="props.filter" type="text" placeholder="filter fields" />
        </NForm>
        <NInput
            class="file-format"
            v-model:value="currentFormat"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 20 }"
            placeholder="file format"
        />
    </div>
</template>

<style scoped lang="scss">
.editor {
    padding: 8px;
}

.flex1 {
    flex: 1;
}
.inline-form {
    display: flex;
    justify-content: center;
    margin-bottom: 4px;
}

.format-list {
    width: 20em;
}

.filter {
    width: 20em;
}
</style>
