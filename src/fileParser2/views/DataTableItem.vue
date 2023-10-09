<script setup lang="ts">
import { onMounted, ref, type Ref, computed } from 'vue';
import { pipeDataFormatter, type FileRecords } from '../parser';
import { getHSLColor } from '../utils';

import DataTableItem from './DataTableItem.vue';

const props = defineProps<{
    item: FileRecords;
    file: FileRecords[];
}>();

const showContent = ref(false);

const lastFormatter = computed(() => {
    if (props.item.type === 'field') {
        return props.item.formatter[props.item.formatter.length - 1];
    }
    return null;
});

const showType = computed(() => {
    if (!lastFormatter.value) {
        return 'byte';
    }
    if (lastFormatter.value === 'image' || lastFormatter.value === 'png') {
        return 'html';
    }
    return 'text';
});

function getValue(item: FileRecords) {
    if (item.type === 'field') {
        return pipeDataFormatter(item, item.formatter, props.file);
    }
    return '';
}

function log() {
    console.log(props.item);
}

function copy(value: string) {
    try {
        navigator.clipboard.writeText(value);
        console.log('copy complete');
    } catch (e) {
        console.warn(e);
    }
    console.log(value);
}

onMounted(() => {
    // in screen
    setTimeout(() => {
        showContent.value = true;
    }, 3000);
});
</script>

<template>
    <div
        v-if="props.item.type === 'group'"
        class="group nest-group"
        :style="{ backgroundColor: getHSLColor(props.item.name, props.item.loop) }"
    >
        <div class="row">
            <div class="col col-name" @click="log()">
                <strong>{{ '#'.repeat(props.item.level) + props.item.name }}</strong>
                <div v-if="props.item.optional" class="tag optional"></div>
                <div v-if="props.item.loop" class="tag loop"></div>
            </div>
            <div class="col"></div>
            <div class="col"></div>
        </div>

        <template v-for="item in props.item.content">
            <DataTableItem :item="item" :file="props.file" />
        </template>
    </div>

    <div v-else-if="props.item.type === 'field'" class="row">
        <div class="col col-name" @click="log()">
            <span>{{ props.item.name }}</span>

            <div v-if="props.item.optional" class="tag optional"></div>
            <div v-if="props.item.loop" class="tag loop"></div>
        </div>
        <div class="col offset-content">
            <template v-if="'length' in props.item">
                <span class="length">{{ props.item.length }}</span>
                <span class="offset">{{ props.item.offset }} - {{ props.item.offset + props.item.length }}</span>
            </template>
            <template v-else>
                <span class="length">{{ props.item.end - props.item.offset }}</span>
                <span class="offset">{{ props.item.offset }} - {{ props.item.end }}</span>
            </template>
        </div>
        <div class="col col-content" @click="copy(props.item.value)">
            <template v-if="showContent">
                <div class="cell-content" v-if="showType === 'byte'" style="word-break: break-all">
                    {{ props.item.value }}
                </div>
                <div class="cell-content" v-else-if="showType === 'html'" v-html="getValue(props.item)"></div>
                <pre class="cell-content" v-else-if="showType === 'text'">{{ props.item.value }}</pre>
            </template>
        </div>
    </div>
    <div v-else-if="props.item.type === 'command'" class="row">
        <div class="col" @click="log()">«{{ props.item.name }}»</div>
        <div class="col"></div>
        <div class="col">{{ props.item.args }}</div>
    </div>
</template>

<style scoped lang="scss">
.col-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.col-name {
    position: relative;
    text-align: right;
}

.tag {
    position: absolute;
    left: 0;
    padding: 0 0.3em;
    font-size: 8px;
    font-weight: 700;
    color: #fff;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0 3px 3px 0;

    &.optional {
        top: 0;
        background: rgba(16, 16, 135, 0.5);
        &:after {
            content: 'optional';
        }
    }
    &.loop {
        bottom: 0;
        background: rgba(148, 77, 23, 0.5);
        &:after {
            content: 'loop';
        }
    }
}

.cell-content {
    margin: 0;
    overflow: auto;
    max-height: 300px;
    font-size: 10px;
}
.offset-content {
    position: relative;
}
.length {
    &:after {
        content: ' byte';
        font-size: 10px;
        color: #999;
    }
}
.offset {
    position: absolute;
    bottom: -4px;
    right: 0;
    font-size: 10px;
    color: #999;
    white-space: nowrap;
    transform: scale(0.8);
}

.group {
    border-top: 2px solid #ccc;
}
.nest-group {
    border-right: 4px solid #83848b;
}
</style>
