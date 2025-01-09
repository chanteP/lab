<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';
import * as echarts from 'echarts';

const props = defineProps<{
    options: any;
}>();

const emit = defineEmits<{
    (e: 'dataZoom', chart: echarts.ECharts): void;
    (e: 'legendselectchanged', chart: echarts.ECharts): void;
}>();

const $container = ref<HTMLElement>();
let chart: echarts.ECharts | undefined = undefined;

function setOptions() {
    if (!chart || !props.options) {
        return;
    }
    chart.setOption(props.options);
}

watch(() => props.options, setOptions, { flush: 'post' });

onMounted(() => {
    chart = echarts.init($container.value);
    setOptions();

    // 监听 dataZoom 事件
    chart.on('dataZoom', (e) => {
        emit('dataZoom', chart);
    });
    chart.on('legendselectchanged', (e) => {
        emit('legendselectchanged', chart);
    });
});

defineExpose({
    getChart: () => chart,
    getOption: () => props.options,
});
</script>

<template>
    <div class="chart" ref="$container"></div>
</template>

<style scoped>
.chart {
    min-height: 100px;
}
</style>
