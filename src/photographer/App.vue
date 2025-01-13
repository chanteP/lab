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
    NSwitch,
} from 'naive-ui';
import {
    getBaseBarOption,
    getExposureString,
    getExposureTimeOptions,
    getFocalLengthOptions,
    getFOptions,
    getPercent,
    parseExif,
    type PhotoUnit,
} from './photoStore';
import { type FileInfo, useFileHelper } from '../common/file';
import EChart from './EChart.vue';
import { ArrowUndoCircleSharp, CheckmarkCircle } from '@vicons/ionicons5';
import { throttle } from '../common/common';

const photos = ref<PhotoUnit[]>([]);
const parseTotal = ref(0);
const parseDone = ref(0);

const { total, done, error, scanning, getFileByDirPicker, getFileByDrop, getFileByFilePicker } = useFileHelper(
    async (file: File, info?: FileInfo) => {
        const ext = info.name.split('.').pop().toLowerCase();
        if (!['jpg', 'png', 'jpeg'].includes(ext)) {
            return;
        }
        try {
            parseTotal.value = parseTotal.value + 1;
            const exifData = await parseExif(file);

            if (!exifData?.exif) {
                throw new Error('not image');
            }
            const item = Object.seal({
                // url: URL.createObjectURL(file),
                info,
                meta: {
                    FocalLength: exifData.exif.FocalLength,
                    FNumber: exifData.exif.FNumber,
                    ExposureTime: `${getExposureString(exifData.exif.ExposureTime)}`,
                    ISOSpeedRatings: exifData.exif.ISO,
                    DateTime: exifData.exif.DateTimeOriginal,
                    Model: exifData.ifd0.Model ?? 'unknown',
                    Lens: exifData.exif.LensModel ?? 'unknown',
                },
            });

            photos.value.push(item);
        } catch (e) {
            console.error(e);
        } finally {
            parseDone.value = parseDone.value + 1;
            console.log(parseDone.value, parseTotal.value, photos.value);
        }
    },
);

const themeVars = useThemeVars();
const message = useMessage();

const viewModel = ref(true);

const FOptions = ref();
const mmOptions = ref();
const ExposureTimeOptions = ref();

const ModelBarOptions = ref();
const LensBarOptions = ref();

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
    const modelOrLens = viewModel.value ? 'Model' : 'Lens';

    FOptions.value = Object.seal(getFOptions(photos.value, modelOrLens));
    mmOptions.value = Object.seal(getFocalLengthOptions(photos.value, modelOrLens));
    ExposureTimeOptions.value = Object.seal(getExposureTimeOptions(photos.value, modelOrLens));

    ModelBarOptions.value = Object.seal(getBaseBarOption(photos.value, 'Model'));
    LensBarOptions.value = Object.seal(getBaseBarOption(photos.value, 'Lens'));
}

function handleDrop(e: DragEvent) {
    if (e.dataTransfer.files.length > 100) {
        message.warning('over 100 files.');
    }
    getFileByDrop(e);
}

watch(() => [photos.value, viewModel.value], throttle(gen, 1000), { deep: true, flush: 'post' });
</script>

<template>
    <div class="wrap" @dragover.prevent @drop.prevent="handleDrop">
        <NCard>
            <NFlex>
                <NButton primary @click="getFileByDirPicker">选择目录</NButton>
                <NButton :disabled="!hasChange" @click="gen">刷新</NButton>
                <NSwitch v-model:value="viewModel" size="large">
                    <template #checked> 相机 </template>
                    <template #unchecked> 镜头 </template>
                </NSwitch>

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
            <div class="flexbox">
                <EChart v-if="ModelBarOptions" class="bar-chart flex" :options="ModelBarOptions" />

                <EChart v-if="LensBarOptions" class="bar-chart flex" :options="LensBarOptions" />
            </div>

            <NDivider />
            <EChart
                v-if="FOptions"
                class="basic-chart"
                :options="FOptions"
                @dataZoom="getPercent"
                @legendselectchanged="getPercent"
            />

            <NDivider />

            <EChart
                v-if="mmOptions"
                class="basic-chart"
                :options="mmOptions"
                @dataZoom="getPercent"
                @legendselectchanged="getPercent"
            />

            <NDivider />

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
.flexbox {
    display: flex;
}
.flex {
    flex: 1;
}
.bar-chart {
    min-height: 250px;
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
