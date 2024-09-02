<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, nextTick } from 'vue';
import { parse as cssTreeParse, walk as cssTreeWalk, generate as cssGenerate } from 'css-tree';

import { NButton, NFlex, NSpace, NSelect, NDivider, NImage, NImageGroup, NInput, useMessage, NInputGroup } from 'naive-ui';

import Gradient from './Gradient.vue';
import { cachedRef } from '../common/vue';
import { copy } from '../common/common';
import GithubLink from '../common/GithubLink.vue';

const message = useMessage();

const input = cachedRef<string>('gradientInput', 'linear-gradient(33deg, #000 0%,#FF0C0CAB 40.0347%,#e6050552 100%)', true);
const inputError = ref(false);
const displayInput = ref<string[]>([]);

const backgroundColor = ref<string>('');
const gradients = ref<{ type: string; stringValue: string; id: number }[]>([]);
let gradientId = 1;

const $gradientContent = ref<HTMLElement>();

let inputUpdateFlag = false;

function reset() {
    backgroundColor.value = '';
    gradients.value = [];
    displayInput.value = [];
}

function refreshShowInput() {
    input.value = displayInput.value.join(', ');

    nextTick(() => {
        inputUpdateFlag = false;
    });
}


function addGradient(css = 'linear-gradient(0deg, #000, #fff)', type = 'linear-gradient') {
    console.log('addGradient', css)

    gradients.value.push({
        type,
        stringValue: css,
        id: gradientId++,
    });
    displayInput.value.push(css);
    refreshShowInput();

    nextTick(() => {
        $gradientContent.value?.scrollTo({
            behavior: "smooth",
            top: 99999,
        });
    });
}

function move(index: number, offset: number) {
    inputUpdateFlag = true;
    const changeFrom = Math.min(index + offset, index);

    gradients.value.splice(changeFrom, 2, gradients.value[changeFrom + 1], gradients.value[changeFrom]);
    displayInput.value.splice(changeFrom, 2, displayInput.value[changeFrom + 1], displayInput.value[changeFrom]);
    refreshShowInput();
    gradients.value = gradients.value;
}

function parseInputCSS(isDeclaration = false) {
    try {
        const cssInput = input.value.toLowerCase();
        const ast = cssTreeParse(cssInput, {
            context: isDeclaration ? 'declaration' : 'value'
        });

        cssTreeWalk(ast, {
            enter(node) {
                if (node.type === 'Function' && node.name.endsWith('-gradient')) {
                    const css = cssGenerate(node);
                    addGradient(css, node.name);
                    return this.skip
                }
            }
        })
        inputError.value = false;
    } catch (e) {
        // 不确定输入会不会带完整属性名，默认使用value，解析失败再试试declaration，再不行就是输入问题了
        if (!isDeclaration) {
            return parseInputCSS(true);
        }
        message.error(e.message);
    }
}

function updateGradient(index: number, value: string) {
    inputUpdateFlag = true;
    displayInput.value[index] = value;
    refreshShowInput();
};

function removeGradient(index: number) {
    gradients.value.splice(index, 1);
    displayInput.value.splice(index, 1);
    refreshShowInput();
}

function save() {
    const data = encodeURIComponent(input.value);
    location.hash = `#${data}`;
}

watch(() => input.value, () => {
    if (inputUpdateFlag) { return; }
    reset();
    try {
        parseInputCSS()
    } catch (e) {
        console.error(e);
        inputError.value = true;
    }
}, {
    immediate: true,
});

onMounted(() => {
    if (location.hash.length > 2) {
        input.value = decodeURIComponent(location.hash.slice(1));
    }
});

</script>

<template>
    <div class="wrap">
        <div class="content">
            <NInputGroup class="info-group">
                <NInput type="textarea" v-model:value="input" :status="inputError ? 'error' : ''"
                    :autosize="{ minRows: 3, maxRows: 5 }" placeholder="input">
                    <template #prefix>
                        <div class="head">background-image:</div>
                    </template>
                </NInput>
                <div class="button-box">
                    <NButton class="button-main" type="success" @click="addGradient()">Add Gradient
                    </NButton>
                    <NButton class="button-sub" type="info" @click="copy(`background-image: ${input}`)">copy
                    </NButton>
                    <NButton class="button-sub" type="info" @click="save">save</NButton>
                </div>
            </NInputGroup>

            <div ref="$gradientContent" class="gradient-detail-group">
                <template v-for="(gradient, index) in gradients" :key="gradient.id">
                    <NDivider class="divider" v-if="index !== 0" />
                    <Gradient class="gradient" :index="index" :total="gradients.length"
                        :stringValue="gradient.stringValue" :type="gradient.type"
                        @update="updateGradient(index, $event)" @remove="removeGradient(index)" @up="move(index, -1)"
                        @down="move(index, 1)">
                    </Gradient>
                </template>
            </div>

        </div>
        <div class="preview" :style="{ backgroundColor, backgroundImage: input }"></div>
        <GithubLink />
    </div>
</template>
<style>
.n-input,
.n-base-selection {
    --n-color: rgba(255, 255, 255, .5) !important;
}
</style>
<style scoped>
.wrap {
    display: flex;
    box-sizing: border-box;
    width: 100vw;
    min-height: 100vh;
    flex-direction: column;
}

.content {
    background: #fff;
    box-shadow: rgba(0, 0, 0, .4) 0 0 12px;
}

.head {
    height: 100%;
}

.info-group {
    box-sizing: border-box;
    padding: 10px 20px;
}

.button-box {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
}

.button-main {
    display: flex;
    width: 100%;
    height: calc(50% - 1px);
}
.button-sub {
    display: flex;
    width: calc(50% - 1px);
    height: calc(50% - 1px);
}

@media screen and (width <=500px) {
    .info-group {
        flex-direction: column;
    }
    .button-box {
        height: 40px;
    }
    .button-main {
        width: 50%;
        height: 100%;
    }
    .button-sub{
        width: calc(25% - 1px);
        height: 100%;
    }
}


.gradient-detail-group {
    padding: 0 20px;
    max-height: 30vh;
    overflow-y: auto;
    background: #f0f0f0;
    box-shadow: inset rgba(0, 0, 0, .4) 0 0 8px;
    counter-reset: gradient-counter;
}

@media screen and (width <=500px) {
    .gradient-detail-group {
        max-height: 25vh;
    }
}

.gradient {
    position: relative;
    counter-increment: gradient-counter;
}

.gradient::before {
    content: counter(gradient-counter) ". ";
    position: absolute;
    font-size: 40px;
    font-weight: 700;
    top: 96px;
    left: 9px;
    line-height: 1;
    color: rgba(181, 181, 181, 0.302);
}

.preview {
    flex: 1;
    min-height: 600px;
}

@media screen and (width <=500px) {
    .preview {
        min-height: 30vh;
    }
}



.divider {
    --n-color: rgb(219, 219, 219) !important;
}
</style>
