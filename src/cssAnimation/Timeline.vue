<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';

const props = defineProps<{
    duration: number;
}>();

const currentPercent = ref(-1);
const currentOffset = ref(0);
const currentValue = computed(() => Math.round(props.duration * currentPercent.value));

const $timeline = ref<HTMLElement>();

const tickDuration = computed(() => {
    // if(props.duration > )
    // return props.duration /
    return 250;
});

function buildTick(val: number, total: number) {
    return {
        time: val,
        left: val / total,
    };
}

const tickList = computed(() => {
    const tickList: ReturnType<typeof buildTick>[] = [];
    let cur = 0;
    while (cur < props.duration) {
        tickList.push(buildTick(cur, props.duration));
        cur += tickDuration.value;
    }

    tickList.push(buildTick(props.duration, props.duration));

    return tickList;
});

function setPin(e: MouseEvent) {
    const timelineRect = $timeline.value.getBoundingClientRect();
    if (e.pageX < timelineRect.left || e.pageX > timelineRect.right) {
        currentPercent.value = -1;
        return;
    }
    currentPercent.value = (e.pageX - timelineRect.left) / timelineRect.width;
    currentOffset.value = currentPercent.value * timelineRect.width;
}
</script>

<template>
    <div class="timeline-panel" @mousemove="setPin">
        <div class="toolbox">
            <div class="head">
                <slot name="tools"></slot>
            </div>
            <div ref="$timeline" class="timeline">
                <div v-for="tick in tickList" class="tick" :style="`left:${tick.left * 100}%;`"></div>
            </div>
        </div>
        <slot></slot>
        <div v-if="currentPercent >= 0" class="pin" :style="`transform: translate(${currentOffset}px, 0);`">
            <span>{{ currentValue }}ms</span>
        </div>
    </div>
</template>

<style scoped>
.timeline-panel {
    --common-head: 10em;

    position: relative;
    display: flex;
    flex-direction: column;
    height: 30vh;
    background: #333334;
    box-shadow: rgba(0, 0, 0, 0.4) 0 0 8px;
    overflow: hidden;
}
.toolbox {
    height: 50px;
}

.tick {
    position: absolute;
    bottom: 10px;
    height: 5px;
}
.tick:empty {
    width: 1px;
    background: rgba(255, 255, 255, 0.8);
}

.timeline-panel:deep(.head) {
    position: absolute;
    left: 0;
    width: var(--common-head);
}
.timeline-panel:deep(.timeline) {
    position: relative;
    margin-left: var(--common-head);
    margin-right: 2em;
    height: 100%;
}

.pin {
    position: absolute;
    top: 10px;
    left: var(--common-head);
    bottom: 0px;
    width: 0;
    color: #7ea77e;
    pointer-events: none;
}
.pin span {
    display: block;
    width: fit-content;
    transform: translate(-50%, 0);
}
.pin:after {
    content: '';
    position: absolute;
    left: 50%;
    top: 1.5em;
    width: 1px;
    height: 100%;
    background: #7ea77e;
}
</style>
