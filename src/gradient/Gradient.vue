<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed, nextTick } from 'vue';
import { keyword } from 'color-convert';

import { NButton, NInput, NSelect, NDivider, NInputGroup, NInputGroupLabel, NIcon } from 'naive-ui';
import ColorStop from './ColorStop.vue';
import { parseGradient } from './gradientParser';
import { fixNumber } from '../common/math';
import Handler from './Handler.vue';
import { copy } from '../common/common';

import ChevronUp from '@vicons/ionicons5/ChevronUp';
import ChevronDown from '@vicons/ionicons5/ChevronDown';

const props = defineProps<{
    type: string;
    stringValue: string;
    index: number;
    total: number;
}>();
const emit = defineEmits<{
    (e: 'update', value: string): void;
    (e: 'remove'): void;
    (e: 'up'): void;
    (e: 'down'): void;
}>();

const $band = ref<HTMLElement>();

const typeOptions = [
    'linear-gradient',
    'radial-gradient',
    'conic-gradient',
    'repeating-linear-gradient',
    'repeating-radial-gradient',
    'repeating-conic-gradient',
].map((t) => ({ label: t, key: t, value: t }));
const radialShapeOrSizeOptions = [
    'circle',
    'ellipse',
    'closest-corner',
    'farthest-corner',
    'closest-side',
    'farthest-side',
].map((t) => ({ label: t, key: t, value: t }));
const radialPositionOptions = ['top', 'left', 'center', 'bottom', 'right', 'top left', '0% 0%'].map((t) => ({
    label: t,
    key: t,
    value: t,
}));

const gradientType = ref<string>(props.type ?? typeOptions[0].value);

const positionSelection = ref<string>('');
const shapeOrSizeSelection = ref<string>('');

const direction = ref<number>(0);
const decorator = ref<string>('');
const colorStops = ref<{ color: string; value: number; id: number }[]>([]);
const calcGradientType = computed(() => {
    return (/(?:-\w+-)?(\w+)-gradient/i.exec(gradientType.value) ?? [])?.[1] ?? 'linear';
});

let colorStopId = 1;

const colorString = computed(() => {
    return colorStops.value.map((stop) => `${stop.color} ${fixNumber(stop.value, 4)}%`).join(',');
});
const firstPartString = computed(() => {
    if (calcGradientType.value === 'linear') {
        decorator.value = `${direction.value}deg`;
    } else if (calcGradientType.value === 'radial') {
        decorator.value = `${shapeOrSizeSelection.value ?? ''}${positionSelection.value ? ' at ' : ''}${
            positionSelection.value
        }`;
    } else if (calcGradientType.value === 'conic') {
        decorator.value = `from ${direction.value}deg${positionSelection.value ? ' at ' : ''}${
            positionSelection.value
        }`;
    }
    return decorator.value ? `${decorator.value}, ` : '';
});
const previewValue = computed(() => {
    return `linear-gradient(90deg, ${colorString.value})`;
});
const finalValue = computed(() => {
    return `${gradientType.value}(${firstPartString.value}${colorString.value})`;
});

function formatColorStop() {
    colorStops.value = colorStops.value.sort((a, b) => a.value - b.value);
}

function addColorStop(e: MouseEvent) {
    const x = e.offsetX;
    const total = $band.value?.clientWidth ?? 0;
    const percent = Math.round((x / total) * 100);

    const color =
        (colorStops.value.find((s) => s.value > percent) ?? colorStops.value[colorStops.value.length - 1]).color ??
        '#000';

    colorStops.value.push({
        color,
        value: percent,
        id: colorStopId++,
    });
}

function removeColorStop(index: number) {
    colorStops.value.splice(index, 1);
}

function parseInput(value: string) {
    const content = parseGradient(value);
    console.log(content);
    if (!content) {
        return;
    }
    direction.value = content.direction;
    decorator.value = content.decorator;
    shapeOrSizeSelection.value = content.shape;
    positionSelection.value = content.position;
    colorStops.value = (content.colorStops as { color: string; value: number; id: number }[])
        .map((stop) => {
            if (/^[\w\-]+$/.test(stop.color)) {
                try {
                    const rgb = keyword.rgb(stop.color);
                    if (rgb) {
                        stop.color = `rgb(${rgb.join(',')})`;
                    }
                } catch (e) {
                    console.error(`unknown color ${stop.color}`, e);
                }
            }
            return stop;
        })
        .map((stop) => {
            stop.id = colorStopId++;
            return stop;
        });
}

watch(() => colorStops.value, formatColorStop, {
    deep: true,
});

watch(
    () => props.type,
    () => {
        gradientType.value = props.type;
    },
    { immediate: true },
);
watch(
    () => props.stringValue,
    () => {
        parseInput(props.stringValue);
    },
    { immediate: true },
);

watch(
    () => [finalValue.value, gradientType.value],
    () => {
        emit('update', finalValue.value);
    },
);
</script>
<template>
    <div class="gradient">
        <NInputGroup>
            <div class="preview-icon" :style="{ backgroundImage: finalValue }"></div>

            <NSelect class="select-type" v-model:value="gradientType" :options="typeOptions" />

            <template v-if="calcGradientType === 'linear'">
                <Handler v-model:direction="direction" />
            </template>
            <template v-else-if="calcGradientType === 'radial'">
                <NSelect
                    class="select-type"
                    v-model:value="shapeOrSizeSelection"
                    filterable
                    tag
                    :options="radialShapeOrSizeOptions"
                />
                <NInputGroupLabel>at</NInputGroupLabel>
                <NSelect
                    class="select-type"
                    v-model:value="positionSelection"
                    filterable
                    tag
                    :options="radialPositionOptions"
                ></NSelect>
            </template>
            <template v-else-if="calcGradientType === 'conic'">
                <Handler v-model:direction="direction" />
                <NInputGroupLabel>at</NInputGroupLabel>
                <NSelect
                    class="select-type"
                    v-model:value="positionSelection"
                    filterable
                    tag
                    :options="radialPositionOptions"
                ></NSelect>
            </template>
            <div class="flex"></div>
            <NButton :disabled="props.index === 0" @click="emit('up')">
                <NIcon>
                    <ChevronUp />
                </NIcon>
            </NButton>
            <NButton :disabled="props.index === props.total - 1" @click="emit('down')">
                <NIcon>
                    <ChevronDown />
                </NIcon>
            </NButton>
            <NButton strong secondary type="error" @click="emit('remove')">remove</NButton>
        </NInputGroup>

        <div ref="$band" class="color-band" :style="{ backgroundImage: previewValue }" @click="addColorStop"></div>
        <div class="picker-band">
            <template v-for="(stop, index) in colorStops" :key="stop.id">
                <ColorStop
                    v-model:percent="stop.value"
                    v-model:color="stop.color"
                    :index="index"
                    @remove="removeColorStop(index)"
                />
            </template>
        </div>
        <NInput class="line-value" :value="finalValue" disabled @click.native="copy(finalValue)" />
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

.preview-icon {
    position: relative;
    width: 50px;
    margin-right: 4px;
    transform-origin: left top;
    z-index: 9;
    transition: transform 500ms ease, box-shadow 500ms ease;
}

.preview-icon:hover {
    transform: scale(4);
    box-shadow: rgba(0,0,0,.8) 0 0 50px 40px;
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
    box-shadow: rgba(0, 0, 0, 0.4) 0 0 8px;
    cursor: copy;
}

.picker-band {
    position: relative;
    height: 30px;
}
</style>
