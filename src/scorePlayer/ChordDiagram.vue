<script setup lang="ts">
import { computed } from 'vue';
import { CHORD_FINGERINGS, parseFingering } from './chordDb';

const props = defineProps<{ chord: string }>();

const fingering = computed(() => {
    const f = CHORD_FINGERINGS[props.chord];
    return f ? parseFingering(f) : null;
});

// 品位范围（横按和弦整体平移显示）
const layout = computed(() => {
    if (!fingering.value) return null;
    const frets = fingering.value.filter((f): f is number => f !== null && f > 0);
    if (!frets.length) return { strings: fingering.value, baseFret: 1 };
    const min = Math.min(...frets);
    const max = Math.max(...frets);
    const baseFret = max > 4 ? min : 1;
    return { strings: fingering.value, baseFret };
});

// 检测横按：最低品位出现在 3 根及以上弦
const barre = computed(() => {
    const l = layout.value;
    if (!l || l.baseFret === 1) return null;
    const pressed = l.strings.filter((f) => f === l.baseFret).length;
    if (pressed < 3) return null;
    const first = l.strings.findIndex((f) => f === l.baseFret);
    const last = 5 - [...l.strings].reverse().findIndex((f) => f === l.baseFret);
    return { from: first, to: last };
});

const W = 90;
const H = 110;
const padX = 14;
const padTop = 18;
const stringGap = (W - padX * 2) / 5;
const fretGap = (H - padTop - 14) / 4;

function sx(i: number) {
    return padX + i * stringGap;
}
function fy(fret: number, base: number) {
    // fret 为实际品位（1 起），返回指板上的 y 中心
    return padTop + (fret - base + 0.5) * fretGap;
}
</script>

<template>
    <div class="chord-diagram">
        <div class="chord-name">{{ chord }}</div>
        <svg v-if="layout" :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`">
            <!-- 弦顶标记 x/o -->
            <template v-for="(f, i) in layout.strings" :key="'t' + i">
                <text v-if="f === null" :x="sx(i)" y="10" class="mark">×</text>
                <circle v-else-if="f === 0" :cx="sx(i)" :cy="7" r="4" class="open" />
            </template>
            <!-- 品位横线 -->
            <line v-for="r in 5" :key="'f' + r" x1="8" :x2="W - 8" :y1="padTop + (r - 1) * fretGap" :y2="padTop + (r - 1) * fretGap" :class="r === 1 && layout.baseFret === 1 ? 'nut' : 'fret'" />
            <!-- 弦 -->
            <line v-for="i in 6" :key="'s' + i" :x1="sx(i - 1)" :x2="sx(i - 1)" :y1="padTop" :y2="padTop + 4 * fretGap" class="string" />
            <!-- 起始品位标记 -->
            <text v-if="layout.baseFret > 1" :x="2" :y="fy(layout.baseFret, layout.baseFret) + 3" class="basefret">{{ layout.baseFret }}fr</text>
            <!-- 横按 -->
            <rect v-if="barre" :x="sx(barre.from) - 6" :y="fy(layout.baseFret, layout.baseFret) - 5" :width="(barre.to - barre.from) * stringGap + 12" height="10" rx="5" class="dot-fill" />
            <!-- 按弦点 -->
            <template v-for="(f, i) in layout.strings" :key="'d' + i">
                <circle v-if="f !== null && f > 0 && !(barre && f === layout.baseFret)" :cx="sx(i)" :cy="fy(f, layout.baseFret)" r="5" class="dot-fill" />
            </template>
        </svg>
        <div v-else class="no-data">暂无指法图</div>
    </div>
</template>

<style scoped>
.chord-diagram {
    text-align: center;
}
.chord-name {
    font-weight: 600;
    margin-bottom: 4px;
}
.string {
    stroke: #888;
    stroke-width: 1;
}
.fret {
    stroke: #888;
    stroke-width: 1;
}
.nut {
    stroke: #333;
    stroke-width: 3;
}
.dot-fill {
    fill: #2080f0;
}
.mark {
    font-size: 10px;
    fill: #888;
    text-anchor: middle;
}
.open {
    fill: none;
    stroke: #888;
    stroke-width: 1.2;
}
.basefret {
    font-size: 9px;
    fill: #888;
}
.no-data {
    color: #999;
    font-size: 12px;
    padding: 12px 4px;
}
</style>
