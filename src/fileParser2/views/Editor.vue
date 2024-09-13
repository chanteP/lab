<script setup lang="ts">
import { onMounted, ref, type Ref, computed, watch } from 'vue';
import { NForm, NInput, NButton, NSelect } from 'naive-ui';
import { insetFileFormat } from '../parser';
import { cachedRef } from '../../common/vue';

const localCacheKey = 'localFileFormat';
const localCacheKeyType = 'localFileFormatType';

const props = defineProps<{
    filter: string;
    format: string;
}>();

const emit = defineEmits<{
    (e: 'update:filter', filter: string): void;
    (e: 'update:format', format: string): void;
}>();

const formatMap: Record<string, string> = {};
const fileFormat = [
    {
        type: 'group',
        label: 'inset',
        children: insetFileFormat.map((fileFormat) => {
            formatMap[fileFormat.name] = fileFormat.format;
            return {
                label: fileFormat.name,
                value: fileFormat.name,
                data: fileFormat.format,
            };
        }),
    },
];

const currentFormat = cachedRef(localCacheKey, '');
const fileFormatList = ref(fileFormat);
const currentFileFormatSelected = cachedRef(localCacheKeyType, 'byte', {
    firstCheck: () => {
        const hashKey = location.hash.slice(1);
        if (formatMap[hashKey]) {
            return hashKey;
        }
    },
});

watch(
    () => currentFormat.value,
    () => {
        emit('update:format', currentFormat.value);
    },
    { immediate: true },
);
watch(
    () => currentFileFormatSelected.value,
    (v, ov) => {
        if (!ov && currentFormat.value) {
            // 有旧输入就不覆盖
            return;
        }
        location.hash = currentFileFormatSelected.value;

        const formatContent = formatMap[currentFileFormatSelected.value] ?? '';
        currentFormat.value = formatContent;
    },
    { immediate: true },
);
</script>

<template>
    <div class="editor" inline>
        <NForm inline class="inline-form">
            <NSelect
                class="format-list"
                v-model:value="currentFileFormatSelected"
                :options="fileFormatList"
                placeholder="file format"
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
