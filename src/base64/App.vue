<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, nextTick } from 'vue';
import QRCode from 'qrcode';

import NaiveUIContainer from '../common/NaiveUIContainer.vue';
import {
    NSlider,
    NInputNumber,
    NSpace,
    NSelect,
    NDivider,
    NImage,
    NImageGroup,
    NInput,
    useMessage,
    NIcon,
} from 'naive-ui';

import FileDrop from '../common/FileDrop.vue';
import { convertToBase64 } from '../common/common';

const message = useMessage();

const string = ref<string>('');
const base64 = ref<string>('');

const stringStatus = ref<string>();
const base64Status = ref<string>();

let lockFlag = false;

function encode() {
    const uriEncode = encodeURIComponent(string.value);
    base64.value = window.btoa(uriEncode);
}

function decode() {
    const s = window.atob(base64.value);
    string.value = decodeURIComponent(s);
}

async function translate(fn: () => unknown, statusRef: Ref<string>) {
    if (lockFlag) {
        return;
    }
    stringStatus.value = undefined;
    base64Status.value = undefined;
    lockFlag = true;
    try {
        await fn();
    } catch (e) {
        statusRef.value = 'error';
        message.error(e.message);
    }
    nextTick(() => {
        lockFlag = false;
    });
}

async function dropFile(files: File[]) {
    const file = files[0];
    translate(async () => {
        base64.value = await convertToBase64(file);
    }, stringStatus);
}

watch(
    () => string.value,
    () => {
        translate(encode, stringStatus);
    },
);
watch(
    () => base64.value,
    () => {
        translate(decode, base64Status);
    },
);
</script>

<template>
    <div class="wrap">
        <FileDrop class="img-upload" @drop-file="dropFile">
            <img v-if="base64.startsWith('data:image/')" class="preview-image" :src="base64" />
        </FileDrop>
        <NInput type="textarea" v-model:value="string" :status="stringStatus" placeholder="input"
            ><template #prefix><div class="head">string</div></template></NInput
        >

        <NInput type="textarea" v-model:value="base64" :status="base64Status" placeholder="input"
            ><template #prefix><div class="head">base64</div></template></NInput
        >
    </div>
</template>

<style scoped>
.wrap {
    padding: 100px 0;
}
.head {
    color: #aaa;
    font-size: 12px;
    width: 6em;
    height: 100%;
    padding: 4px 0 0;
}
.preview-image{
    display: block;
    width: 100%;
    height: 100%;
}
</style>
