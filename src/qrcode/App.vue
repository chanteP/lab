<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import QRCode from 'qrcode';

import NaiveUIContainer from '../common/NaiveUIContainer.vue';
import { NSlider, NInputNumber, NSpace, NSelect, NDivider, NImage, NImageGroup, NInput } from 'naive-ui';
import { cachedRef } from '../common/vue';

const input = cachedRef<string>('qr:input', '');
const qrSrc = ref<string>();

const margin = cachedRef<number>('qr:margin', 0);
const size = cachedRef<number>('qr:size', 250);
const type = cachedRef<'jpeg' | 'png' | 'webp'>('qr:type', 'jpeg');
const level = cachedRef<'L' | 'M' | 'Q' | 'H'>('qr:level', 'L');

function buildSelection(list: string[]) {
    return list.map(d => ({ label: d, value: d }));
}

async function getQR(text: string): Promise<string> {
    text = text || '';
    return new Promise<string>((res, rej) => {
        QRCode.toDataURL(
            text,
            {
                errorCorrectionLevel: level.value,
                type: `image/${type.value}`,
                width: size.value,
                margin: margin.value,
            },
            function (err, url) {
                if (err) rej(err);
                res(url);
            },
        );
    });
}

async function setQR() {
    qrSrc.value = await getQR(input.value);
}

watch(
    () => [input.value, size.value, type.value, margin.value, level.value],
    setQR,
    { immediate: true }
);

</script>

<template>
    <NaiveUIContainer>
        <div class="">
            <NInput type="textarea" v-model:value="input" placeholder="command"></NInput>

            <NSpace>
                <NSelect v-model:value="type" style="width: 10em;" :options="buildSelection(['jpeg', 'png', 'webp'])" />
                <NSelect v-model:value="level" :options="buildSelection(['L', 'M', 'Q', 'H'])" />
            </NSpace>

            <NSpace vertical>
                <NSlider v-model:value="size" :max="1000" :step="1" />
                <NInputNumber v-model:value="size" size="small">
                    <template #prefix>
                        size
                    </template>
                </NInputNumber>
            </NSpace>

            <NSpace vertical>
                <NSlider v-model:value="margin" :max="size" :step="1" />
                <NInputNumber v-model:value="margin" size="small">
                    <template #prefix>
                        margin
                    </template>
                </NInputNumber>
            </NSpace>

            <NDivider />

            <NImage :width="size" :src="qrSrc" />
        </div>

    </NaiveUIContainer>
</template>

<style scoped></style>
