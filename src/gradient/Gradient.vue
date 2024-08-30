<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, nextTick } from 'vue';
import { keyword } from 'color-convert';

import { NButton, NSpace, NSelect, NFlex } from 'naive-ui';
import ColorStop from './ColorStop.vue';
import { parseGradient } from './gradientParser';
import { fixNumber } from '../common/math';
import Handler from './Handler.vue';

const props = defineProps<{
    type: string;
    stringValue: string;
}>();
const emit = defineEmits<{
    (e: 'update', value: string): void;
    (e: 'remove'): void;
}>();

const $band = ref<HTMLElement>();

const typeOptions = ['linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient'].map(t => ({ label: t, key: t, value: t, disabled: !t.includes('linear') }));
const gradientType = ref<string>(props.type ?? typeOptions[0].value);

const direction = ref<number>(0);
const colorStops = ref<{ color: string; value: number }[]>([]);
const colorString = computed(() => {
    return colorStops.value.map(stop => `, ${stop.color} ${fixNumber(stop.value, 4)}%`).join('');
});
function getDirectionString(value: number) {
    if(props.type.includes('conic-gradient')){
        return `from ${value}deg`;
    }
    if(props.type.includes('radial-gradient')){
        return `circle at center`;
    }
    return `${value}deg`;
}
const previewValue = computed(() => {
    return `linear-gradient(90deg${colorString.value})`;
});
const finalValue = computed(() => {
    return `${gradientType.value}(${getDirectionString(direction.value)}${colorString.value})`;
});

function formatColorStop() {
    colorStops.value = colorStops.value.sort((a, b) => a.value - b.value);
}

function addColorStop(e: MouseEvent) {
    const x = e.offsetX;
    const total = $band.value?.clientWidth ?? 0;
    const percent = Math.round(x / total * 100);

    const color = (colorStops.value.find(s => s.value > percent) ?? colorStops.value[colorStops.value.length - 1]).color ?? '#000';

    colorStops.value.push({
        color,
        value: percent,
    });
}

function removeColorStop(index: number) {
    colorStops.value.splice(index, 1);
}

function parseInput(value: string) {
    const content = parseGradient(value);
    if (!content) {
        return;
    }
    direction.value = content.direction;
    colorStops.value = content.colorStops.map(stop => {
        if (/^[\w\-]+$/.test(stop.color)) {
            try {
                const rgb = keyword.rgb(stop.color);
                stop.color = `rgb(${rgb.join(',')})`;
            } catch (e) {
                console.error(`unknown color ${stop.color}`, e);
            }
        }
        return stop;
    });
}

watch(() => colorStops.value, formatColorStop, {
    deep: true,
});

watch(() => props.type, () => {
    gradientType.value = props.type;
}, { immediate: true });
watch(() => props.stringValue, () => {
    parseInput(props.stringValue);
}, { immediate: true });

watch(() => finalValue.value, () => {
    emit('update', finalValue.value);
});

</script>
<template>
    <div class="gradient">
        <NFlex class="flexbox">
            <NSelect class="select-type" v-model:value="gradientType" :options="typeOptions" />
            <Handler v-model:direction="direction" />

            <div class="flex"></div>
            <NButton strong secondary type="error" @click="emit('remove')">remove</NButton>
        </NFlex>

        <div ref="$band" class="color-band" :style="{ backgroundImage: previewValue }" @click="addColorStop"></div>
        <div class="picker-band">
            <template v-for="(stop, index) in colorStops">
                <ColorStop v-model:percent="stop.value" v-model:color="stop.color" :index="index"
                    @remove="removeColorStop(index)" />
            </template>
        </div>
    </div>
</template>

<style scoped>
.gradient {
    padding: 10px 0;
}

.flexbox {
    display: flex;
}

.flex {
    flex: 1;
}

.select-type {
    width: 20em;
    margin-right: 10px;
    margin-bottom: 4px;
}

.color-band {
    height: 50px;
    background: transparent top left no-repeat;
    background-size: 100% 100%;
    border: 1px solid #fff;
    box-shadow: rgba(0, 0, 0, .4) 0 0 8px;
    cursor: copy;
}

.picker-band {
    position: relative;
    height: 30px;
}
</style>
