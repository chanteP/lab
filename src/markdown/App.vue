<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, shallowRef } from 'vue';
import {
    NButton,
    NDivider,
    NFlex,
    NImage,
    NImageGroup,
    NInput,
    NInputGroup,
    NInputGroupLabel,
    NInputNumber,
    NSelect,
    NSpace,
    NTag,
    useMessage,
} from 'naive-ui';
import { cachedRef } from '../common/vue';

import markdownit from 'markdown-it';
import './markdown.scss';

const markdownData = cachedRef('markdownContent', '');
const previewData = ref('');
const md = markdownit({
    html: true, // 启用 HTML 解析
    linkify: true, // 启用自动链接解析
    typographer: true, // 启用排版功能
});

function print(){
    window.print();
}

watch(
    () => markdownData.value,
    () => {
        previewData.value = md.render(markdownData.value);
    },
    {
        immediate: true,
    },
);
</script>

<template>
    <div class="wrap">
        <div class="side content">
            <NInput class="editor" v-model:value="markdownData" type="textarea" placeholder="markdown content" />
        </div>
        <div class="side preview">
            <NSpace class="fn">
                <NButton type="primary" @click="print">print</NButton>
            </NSpace>
            <div class="markdown print" v-html="previewData"></div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.wrap {
    --noise-color: rgba(0, 0, 0, 0.2);
    --box-color: rgba(43, 43, 43, 0.68);
    width: 100vw;
    height: 100vh;
    display: flex;
}
.content {
    flex: 1;
}
.editor {
    width: 100%;
    height: 100vh;
    background: transparent !important;
    border: none !important;
    outline: none !important;

    :deep(.n-input__border),
    :deep(.n-input__state-border) {
        visibility: hidden !important;
    }

    :deep(.n-input-wrapper) {
        resize: none !important;
    }
}
.preview {
    display: flex;
    flex-direction: column;
    width: calc(1 / 1.414 * 100vh);
    height: 100vh;
    background: #fff;
    box-shadow: rgba(0, 0, 0, 0.4) 0 0 8px;
    .fn{
        justify-content: end !important;
        padding: 4px 12px;
        border-bottom: 1px solid #dedede;
    }
    .markdown {
        margin: 0;
        padding: 12px 24px;
        overflow-y: auto;
        overflow-x: hidden;
    }
}

@media print {
    .wrap {
        height: auto;
    }
    .wrap > *:not(.preview) {
        display: none;
    }

    .preview {
        height: auto;
        box-shadow: none;
        .fn{
            display: none !important;
        }
        .markdown {
            padding: 1.2cm 1.4cm;
            height: auto;
            overflow: visible;
        }
    }

    /* 隐藏页头和页尾 */
    header,
    footer {
        display: none;
    }

    /* 设置页码 */
    @page {
        size: auto;
        margin: 0.5rem 0;
    }
}
</style>
