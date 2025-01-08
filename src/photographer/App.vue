<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, shallowRef, effect } from 'vue';
import {
    NButton,
    NDivider,
    NFlex,
    NImage,
    NImageGroup,
    NInput,
    NInputGroup,
    NInputGroupLabel,
    NSelect,
    NSpace,
    NTag,
    useMessage,
} from 'naive-ui';
import { addFile, getFocalLengthOptions, getFOptions, photos } from './photoStore';
import { useFileHelper } from '../common/file';
import EChart from './EChart.vue';

const { getFileByDirPicker, getFileByDrop, getFileByFilePicker } = useFileHelper(addFile);

const FOptions = ref();
const mmOptions = ref();

function gen() {
    FOptions.value = getFOptions();
    mmOptions.value = getFocalLengthOptions()
    console.log(FOptions.value);
}
</script>

<template>
    <div class="wrap" @dragover.prevent @drop.prevent="getFileByDrop">
        <NButton @click="getFileByDirPicker">select dir</NButton>
        <NButton @click="gen">gen</NButton>

        <EChart class="basic-chart" :options="FOptions" />
        <EChart class="basic-chart" :options="mmOptions" />
    </div>
</template>

<style scoped>
.wrap {
    position: relative;
    min-width: 100vw;
    min-height: 100vh;
}
.basic-chart {
    height: 500px;
}
</style>
