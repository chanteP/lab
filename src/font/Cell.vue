<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import opentype from 'opentype.js';
import { useMessage, NButton, NIcon, NInputGroup, NInputGroupLabel, NTooltip } from 'naive-ui';
import { download, sleep } from '../common/common';

import ChevronUp from '@vicons/ionicons5/ChevronUp';
import ChevronDown from '@vicons/ionicons5/ChevronDown';
import InformationCircleOutline from '@vicons/ionicons5/InformationCircleOutline';
import CodeSlashSharp from '@vicons/ionicons5/CodeSlashSharp';
import DownloadOutline from '@vicons/ionicons5/DownloadOutline';

const props = defineProps<{
    file: File;
    value: string;
}>();

const emit = defineEmits<{
    (e: 'select', data: { name: string; file: File }): void;
}>();

const file = ref<File>(props.file);

const $canvas = ref<HTMLCanvasElement>();
const $font = ref<HTMLElement>();

const error = ref(false);
const message = useMessage();

const fontName = computed(() => {
    return file.value.name.replace(/\.[^/.]+$/, '');
});
const fontUrl = computed(() => {
    return URL.createObjectURL(file.value);
});
const suffix = computed(() => {
    return file.value.name.split('.').pop();
});

const halfHeight = ref(0);
const baselinePx = ref(0);

const info = ref<opentype.Font>();
let styleElement: HTMLStyleElement | undefined = undefined;

const css = computed(() => {
    return `
@font-face {
    font-family: '${fontName.value}';
    src: url('${fontUrl.value}');
    font-weight: normal;
    font-style: normal;
    font-display: block;
}`;
});
const cssTips = computed(() => {
    return `
@font-face {
    font-family: '${fontName.value}';
    src: url('./${fontName.value}.otf');
    font-weight: normal;
    font-style: normal;
    font-display: block;
}`;
});

async function insertCSS() {
    // if (styleElement) {
    //     styleElement.parentNode!.removeChild(styleElement);
    //     styleElement = undefined;
    // }

    if (!styleElement) {
        // 动态创建一个 style 元素并插入到 head 中
        styleElement = document.createElement('style');
        $font.value!.appendChild(styleElement);
    }

    // 创建 @font-face CSS 规则

    // 将 CSS 规则添加到 style 元素中
    styleElement.appendChild(document.createTextNode(css.value));

    // 默认的字体加载慢一点
    await sleep(10);
}

function draw() {
    if (!info.value || !$canvas.value) {
        return;
    }

    const ctx = $canvas.value.getContext('2d');
    if (!ctx) {
        return;
    }

    const node = $canvas.value;

    const ratio = 2;

    node.width = node.clientWidth * ratio;
    node.height = node.clientHeight * ratio;

    const clientWidth = node.width;
    const clientHeight = node.height;
    halfHeight.value = clientHeight / 2;

    const ascenderUnit = info.value.ascender;
    const descenderUnit = info.value.descender;
    const heightUnit = ascenderUnit - descenderUnit;

    const pxUnitRatio = clientHeight / heightUnit;

    const baselineTopPx = ascenderUnit * pxUnitRatio;
    baselinePx.value = Math.floor(baselineTopPx);

    // console.log(`${ascenderUnit} * ${clientHeight} / ${perEm} = ${baselineTopPx}, ${pxUnitRatio}`)

    ctx.clearRect(0, 0, clientWidth, clientHeight);

    ctx.fillStyle = '#f00';
    ctx.fillRect(0, baselineTopPx, clientWidth, 1);
    ctx.fillStyle = '#090';
    ctx.fillRect(0, clientHeight / 2, clientWidth, 1);
}

function parse(sync = false) {
    if (sync) {
        try {
            info.value = Object.seal(opentype.parse(fontUrl.value));
            draw();
        } catch (e) {
            error.value = e;
            message.error(e.message);
            return;
        }
    } else {
        opentype.load(fontUrl.value, (err, font) => {
            if (err) {
                parse(true);
                return;
            }
            // console.log(fontUrl.value, font)
            info.value = Object.seal(font);
            draw();
        });
    }
}

async function reset() {
    await insertCSS();
    parse();
}

function logInfo() {
    console.log(fontName.value, info.value);
}

async function move(isAscender: boolean, offset: number) {
    if (!info.value) {
        return;
    }
    const data = info.value;
    const key = isAscender ? 'ascender' : 'descender';
    data[key] = data[key] + offset;

    const buffer = data.toArrayBuffer();
    const blob = new Blob([buffer], { type: 'font/opentype' });
    file.value = new File([blob], `${fontName.value}.otf`);

    reset();
}

function downloadSVG() {
    const font = info.value;

    // 设置字体大小
    const fontSize = 100;

    // 创建一个bounds来获取文本的边界
    const path = font.getPath(props.value, 0, 0, fontSize);
    const bounds = path.getBoundingBox();

    // 计算SVG的宽度和高度
    const svgWidth = bounds.x2 - bounds.x1;
    const svgHeight = bounds.y2 - bounds.y1;

    // 将路径转换为SVG
    const svgPath = path.toSVG(4);

    // 创建一个SVG元素，包括适当的视图框
    const svgElement = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth + 100}" height="${
        svgHeight + 100
    }" viewBox="0 -100 ${svgWidth} ${svgHeight + 100}">\n${svgPath}\n</svg>`;

    const blob = new Blob([svgElement]);
    const file = new File([blob], `${fontName.value}.svg`, { type: 'image/svg+xml' });

    download(file);
}

onMounted(() => {
    reset();
});
</script>

<template>
    <span v-if="!error" ref="$font" class="font" :style="{ fontFamily: `'${fontName}'` }">
        <span @click="emit('select', { name: fontName, file })">{{ props.value }}</span>
        <canvas ref="$canvas" class="canvas"></canvas>

        <div class="info name" @click="logInfo">{{ fontName }}</div>
        <div class="info height">
            <span style="color: #090">{{ halfHeight }}px</span><span style="color: #900">{{ baselinePx }}px</span>
        </div>

        <div class="control left-top top-hide">
            <NTooltip placement="top-start" trigger="hover">
                <template #trigger>
                    <NButton size="tiny">
                        <template #icon>
                            <NIcon>
                                <InformationCircleOutline />
                            </NIcon>
                        </template>
                    </NButton>
                </template>
                <pre>
                    {{ cssTips }}
                </pre>
            </NTooltip>

            <NTooltip placement="top-start" trigger="hover">
                <template #trigger>
                    <NButton size="tiny" @click="downloadSVG">
                        <template #icon>
                            <NIcon>
                                <CodeSlashSharp />
                            </NIcon>
                        </template>
                    </NButton>
                </template>
                download SVG
            </NTooltip>
        </div>
        <div class="control c-ascender top-hide">
            <NInputGroup>
                <NInputGroupLabel class="label" size="tiny">Ascender</NInputGroupLabel>
                <NButton size="tiny">
                    <template #icon>
                        <NIcon @click="move(true, 10)">
                            <ChevronUp />
                        </NIcon>
                    </template>
                </NButton>
                <NButton size="tiny">
                    <template #icon>
                        <NIcon @click="move(true, -10)">
                            <ChevronDown />
                        </NIcon>
                    </template>
                </NButton>
            </NInputGroup>
        </div>
        <div class="control c-descender bottom-hide">
            <NInputGroup>
                <NInputGroupLabel class="label" size="tiny">Descender</NInputGroupLabel>
                <NButton size="tiny">
                    <template #icon>
                        <NIcon @click="move(false, 10)">
                            <ChevronUp />
                        </NIcon>
                    </template>
                </NButton>
                <NButton size="tiny">
                    <template #icon></template>
                    <NIcon @click="move(false, -10)">
                        <ChevronDown />
                    </NIcon>
                </NButton>
            </NInputGroup>
        </div>
        <div class="control download bottom-hide">
            <NTooltip placement="top-start" trigger="hover">
                <template #trigger>
                    <NButton secondary type="info" size="tiny" @click="download(file)">
                        <template #icon>
                            <NIcon>
                                <DownloadOutline />
                            </NIcon>
                        </template>
                    </NButton>
                </template>
                download
            </NTooltip>
            <!-- <NButton tertiary type="info" size="tiny" @click="emit('select', { name: fontName, file })">info</NButton> -->
        </div>
    </span>
</template>

<style scoped>
.font {
    position: relative;
    padding: 0 10px;
    background: rgba(0, 0, 0, 0.1);
}

.canvas {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.info {
    position: absolute;
    font-size: 10px;
    text-shadow: #fff 0 0 2px;
    font-family: initial;
}

.name {
    right: 0;
    top: 0;
}

.height {
    left: 0;
    top: 0;
}

.control {
    /* display: none; */
    position: absolute;
    font-size: 12px;
    font-family: initial;
    cursor: pointer;
}

.font:hover {
    .control {
        opacity: 1;
        transform: translate(0, 0px);
        /* display: block; */
    }
}

.top-hide {
    opacity: 0;
    transform: translate(0, -20px);
    transition: opacity 300ms ease, transform 300ms ease;
}
.bottom-hide {
    opacity: 0;
    transform: translate(0, 22px);
    transition: opacity 300ms ease, transform 300ms ease;
}

.left-top {
    top: -20px;
    left: 0;
}

.c-ascender {
    right: 0;
    top: -20px;
}

.c-descender {
    right: 0;
    bottom: -22px;
}

.download {
    left: 0;
    bottom: -20px;
}
</style>
