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
    NCard,
    NIcon,
    NProgress,
    useThemeVars,
} from 'naive-ui';
import {
    addFile,
    getExposureTimeOptions,
    getFocalLengthOptions,
    getFOptions,
    getPercent,
    parseDone,
    parseTotal,
    photos,
} from './photoStore';
import { useFileHelper } from '../common/file';
import EChart from './EChart.vue';
import { ArrowUndoCircleSharp, CheckmarkCircle } from '@vicons/ionicons5';

const { total, done, error, scanning, getFileByDirPicker, getFileByDrop, getFileByFilePicker } = useFileHelper(addFile);

const themeVars = useThemeVars();

const FOptions = ref();
const mmOptions = ref();
const ExposureTimeOptions = ref();

const hasChange = ref(false);

watch(
    () => parseTotal.value,
    () => {
        hasChange.value = true;
    },
);

const reading = computed(() => ((done.value + error.value) * 100) / total.value);
const parsing = computed(() => (parseDone.value * 100) / parseTotal.value);

function gen() {
    FOptions.value = getFOptions();
    mmOptions.value = getFocalLengthOptions();
    ExposureTimeOptions.value = getExposureTimeOptions();
}

watch(() => photos.value, gen, { deep: true });
</script>

<template>
    <div class="wrap" @dragover.prevent @drop.prevent="getFileByDrop">
        <NCard>
            <NFlex>
                <NButton primary @click="getFileByDirPicker">select folder</NButton>
                <NButton :disabled="!hasChange" @click="gen">analysis</NButton>

                <NProgress type="line" :percentage="reading" indicator-placement="inside" :processing="reading < 100">
                    <span v-if="error">({{ error }} errors)</span>{{ done + error }} / {{ total }}
                </NProgress>
                <NProgress
                    type="line"
                    :percentage="parsing"
                    :color="themeVars.successColor"
                    indicator-placement="inside"
                    :processing="parsing < 100"
                >
                    {{ parseDone }} / {{ parseTotal }}
                </NProgress>

                <div class="info-box">
                    <NFlex v-for="(hasDone, path) in scanning" :key="path" align="center" class="info">
                        <NIcon v-if="hasDone" :size="18" :color="themeVars.successColor" :component="CheckmarkCircle" />
                        <NIcon v-else :size="18" :color="themeVars.infoColor" :component="ArrowUndoCircleSharp" />
                        <div>{{ path }}</div>
                    </NFlex>
                </div>
            </NFlex>
            <NDivider />

            <EChart
                v-if="FOptions"
                class="basic-chart"
                :options="FOptions"
                @dataZoom="getPercent"
                @legendselectchanged="getPercent"
            />
            <EChart
                v-if="mmOptions"
                class="basic-chart"
                :options="mmOptions"
                @dataZoom="getPercent"
                @legendselectchanged="getPercent"
            />
            <EChart
                v-if="ExposureTimeOptions"
                class="basic-chart"
                :options="ExposureTimeOptions"
                @dataZoom="getPercent"
                @legendselectchanged="getPercent"
            />
        </NCard>
    </div>
</template>

<style scoped lang="scss">
.wrap {
    position: relative;
    min-width: 100vw;
    min-height: 100vh;
}
.basic-chart {
    height: 300px;
}
.info-box {
    width: 100%;
    height: 100px;
    font-size: 10px;
    overflow-y: auto;
    background: #fefefe;
    box-shadow: rgba(0, 0, 0, 0.02) 0 0 12px inset;
    border-radius: 8px;
    .info {
        margin: 1px 0;
        background: #ebebeb;
        border-radius: 8px;
    }
}
</style>
