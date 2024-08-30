<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, nextTick } from 'vue';
import { parse as cssTreeParse, walk as cssTreeWalk, generate as cssGenerate } from 'css-tree';

import { NButton, NInputNumber, NSpace, NSelect, NDivider, NImage, NImageGroup, NInput, useMessage } from 'naive-ui';

import Gradient from './Gradient.vue';
import { cachedRef } from '../common/vue';
import { string } from 'css-tree';

const message = useMessage();

const input = cachedRef<string>('gradientInput', 'linear-gradient(33deg, #000 0%, #424F3D52 27.4896%, #E6050552 100%)');
const inputError = ref(false);
const displayInput = ref<string[]>([]);

const backgroundColor = ref<string>('');
const gradients = ref<{ type: string; stringValue: string }[]>([]);

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
    gradients.value.push({
        type,
        stringValue: css,
    });
    displayInput.value.push(css);
    refreshShowInput();
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

let inputUpdateFlag = false;

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


</script>

<template>
    <div class="wrap">
        <div class="content">
            <NInput type="textarea" v-model:value="input" :status="inputError ? 'error' : ''" autosize
                placeholder="input">
                <template #prefix>
                    <div class="head">background-image:</div>
                </template>
            </NInput>
            <NSpace class="flexbox">
                <NButton type="success" @click="addGradient()">Add Gradient</NButton>
                <!-- <NButton type="info">copy</NButton> -->
            </NSpace>
            <template v-for="(gradient, index) in gradients">
                <Gradient :stringValue="gradient.stringValue" :type="gradient.type"
                    @update="updateGradient(index, $event)" @remove="removeGradient(index)">
                </Gradient>
            </template>
        </div>
        <div class="preview" :style="{ backgroundColor, backgroundImage: input }"></div>

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
    padding: 50px 20px;
    background: #fff;
    box-shadow: rgba(0, 0, 0, .4) 0 0 12px;
}

.head {
    height: 100%;
}

.preview {
    flex: 1;
    min-height: 600px;
}
</style>
