<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import opentype from 'opentype.js';
import { useMessage, NButton, NIcon } from 'naive-ui';
import ChevronUp from '@vicons/ionicons5/ChevronUp';
import ChevronDown from '@vicons/ionicons5/ChevronDown';
import { download, sleep } from '../common/common';

const props = defineProps<{
    file: File;
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
    const css = `
@font-face {
    font-family: '${fontName.value}';
    src: url('${fontUrl.value}');
    font-weight: normal;
    font-style: normal;
    font-display: block;
}`;

    // 将 CSS 规则添加到 style 元素中
    styleElement.appendChild(document.createTextNode(css));

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

onMounted(() => {
    reset();
});
</script>

<template>
    <span v-if="!error" ref="$font" class="font" :style="{ fontFamily: `'${fontName}'` }">
        <span @click="emit('select', { name: fontName, file })"><slot></slot></span>
        <canvas ref="$canvas" class="canvas"></canvas>

        <div class="info name" @click="logInfo">{{ fontName }}</div>
        <div class="info height">
            <span style="color: #090">{{ halfHeight }}px</span><span style="color: #900">{{ baselinePx }}px</span>
        </div>

        <div class="control c-ascender">
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
        </div>
        <div class="control c-descender">
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
        </div>
        <div class="control download">
            <NButton secondary type="info" size="tiny" @click="download(file)">download</NButton>
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
    display: none;
    position: absolute;
    font-size: 12px;
    font-family: initial;
    cursor: pointer;
}

.font:hover {
    .control {
        display: block;
    }
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
