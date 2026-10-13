<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { NButton, NIcon, NPopover, NSlider, NSwitch, useMessage } from 'naive-ui';
import IconPlay from '@vicons/ionicons5/Play';
import IconPause from '@vicons/ionicons5/Pause';
import IconStop from '@vicons/ionicons5/Stop';
import IconLocate from '@vicons/ionicons5/Locate';
import FileDrop from '../common/FileDrop.vue';
import ChordDiagram from './ChordDiagram.vue';
import { ScorePlayer } from './player';
import { SAMPLE_SCORE } from './sample';
import { flattenScore, parseKey, transposeChord, transposeKey } from './theory';
import type { FlatBar, FlatNote, Score } from './types';

const message = useMessage();

/* ---------------- 状态 ---------------- */
const score = ref<Score | null>(null);
const scoreName = ref('');
const transposeSemis = ref(0);
const rate = ref(1);
const followMode = ref(true); // 自动滚动跟随
const scrollSeek = ref(true); // 手动滚动定位进度
const playing = ref(false);

const player = new ScorePlayer();
player.events.onStateChange = (p) => (playing.value = p);

const keyInfo = computed(() => transposeKey(parseKey(score.value?.meta.key), transposeSemis.value));
const flat = computed(() => (score.value ? flattenScore(score.value, keyInfo.value) : null));

const sectionMap = computed(() => {
    const m = new Map<number, string>();
    for (const s of score.value?.sections ?? []) m.set(s.bar, s.name);
    return m;
});

function displayChord(chord: string) {
    return transposeSemis.value ? transposeChord(chord, transposeSemis.value) : chord;
}

/* ---------------- 布局：小节打包成行 ---------------- */
const BEAT_W = 40; // 每拍宽度 px
const scoreEl = ref<HTMLElement | null>(null);
const containerWidth = ref(800);

interface Line {
    bars: FlatBar[];
}
const lines = computed<Line[]>(() => {
    if (!flat.value) return [];
    const max = containerWidth.value - 16;
    const out: Line[] = [];
    let cur: Line = { bars: [] };
    let w = 0;
    for (const bar of flat.value.bars) {
        const bw = bar.beats * BEAT_W + 14;
        if (cur.bars.length && w + bw > max) {
            out.push(cur);
            cur = { bars: [] };
            w = 0;
        }
        cur.bars.push(bar);
        w += bw;
    }
    if (cur.bars.length) out.push(cur);
    return out;
});

/* ---------------- 渲染单元格（音符 + 延音线占位） ---------------- */
interface Cell {
    type: 'note' | 'dash';
    /** 占位宽度（拍） */
    w: number;
    note?: FlatNote;
    /** 下划线数（八分=1，十六分=2） */
    under: number;
    dotted: boolean;
}

function cellsOf(bar: FlatBar): Cell[] {
    const cells: Cell[] = [];
    for (const n of bar.notes) {
        let len = n.len;
        let dashes = 0;
        if (len >= 1.999) {
            dashes = Math.round(len) - 1;
            len = 1;
        }
        const dotted = Math.abs((len * 2) % 2 - 1) < 0.01 && len < 2 && len >= 0.75;
        const under = len <= 0.25 ? 2 : len < 1 ? 1 : 0;
        cells.push({ type: 'note', w: len, note: n, under, dotted });
        for (let i = 0; i < dashes; i++) cells.push({ type: 'dash', w: 1, under: 0, dotted: false });
    }
    return cells;
}

/* ---------------- DOM 注册（光标定位） ---------------- */
const noteEls = new Map<number, HTMLElement>();
const lineEls = new Map<number, HTMLElement>();
function setNoteEl(idx: number, el: unknown) {
    if (el instanceof HTMLElement) noteEls.set(idx, el);
}
function setLineEl(li: number, el: unknown) {
    if (el instanceof HTMLElement) lineEls.set(li, el);
}
watch(flat, () => {
    noteEls.clear();
    lineEls.clear();
});

/* ---------------- 播放 / 光标 ---------------- */
const activeNoteIdx = ref(-1);
const activeBarIdx = ref(-1);
const caret = reactive({ show: false, x: 0, y: 0, h: 0 });
const curSec = ref(0);
const totalSec = ref(0);

function noteAtBeat(beat: number): FlatNote | null {
    const notes = flat.value?.notes;
    if (!notes || !notes.length) return null;
    let lo = 0;
    let hi = notes.length - 1;
    let ans = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (notes[mid].startBeat <= beat + 1e-6) {
            ans = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    return notes[ans];
}

let raf = 0;
function tick() {
    raf = requestAnimationFrame(tick);
    if (!flat.value) return;
    const sec = player.seconds;
    curSec.value = sec;
    const beat = player.secondsToBeats(sec);
    const n = noteAtBeat(beat);
    if (!n) return;
    if (n.idx !== activeNoteIdx.value) {
        activeNoteIdx.value = n.idx;
        activeBarIdx.value = n.bar;
    }
    // 光标位置
    const el = noteEls.get(n.idx);
    const wrap = scoreEl.value;
    if (el && wrap) {
        const r = el.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        caret.show = true;
        caret.x = r.left - wr.left;
        caret.y = r.top - wr.top;
        caret.h = r.height;
    } else caret.show = false;
    // 自动滚动：保持光标所在行在视口 35% 处
    if (playing.value && followMode.value) {
        const li = lines.value.findIndex((l) => l.bars.some((b) => b.index === activeBarIdx.value));
        const lineEl = lineEls.get(li);
        if (lineEl) {
            const target = lineEl.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.35;
            const cur = window.scrollY;
            if (Math.abs(target - cur) > 2) {
                window.scrollTo({ top: cur + (target - cur) * 0.14, behavior: 'instant' as ScrollBehavior });
            }
        }
    }
}

/* ---------------- 手动滚动 ---------------- */
let scrollTimer = 0;
function onUserScroll() {
    if (!flat.value) return;
    if (followMode.value && playing.value) followMode.value = false;
    if (!scrollSeek.value) return;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
        // 视口中心行 → 定位播放进度
        const cy = window.scrollY + window.innerHeight * 0.45;
        let best = -1;
        let bestDist = Infinity;
        lineEls.forEach((el, li) => {
            const top = el.getBoundingClientRect().top + window.scrollY;
            const d = Math.abs(top - cy);
            if (d < bestDist) {
                bestDist = d;
                best = li;
            }
        });
        if (best >= 0 && lines.value[best]?.bars.length) {
            const bar = lines.value[best].bars[0];
            player.seek(bar.startBeat);
            if (!playing.value) {
                activeBarIdx.value = bar.index;
                const n = bar.notes[0];
                if (n) activeNoteIdx.value = n.idx;
            }
            followMode.value = true;
        }
    }, 550);
}

/* ---------------- 控制 ---------------- */
async function togglePlay() {
    if (!flat.value) return;
    if (player.playing) {
        player.pause();
        return;
    }
    // 播到结尾后重新播放从头开始
    const beat = player.secondsToBeats(player.seconds);
    const from = beat >= flat.value.totalBeats - 0.01 ? 0 : undefined;
    await player.play(flat.value.bars, flat.value.notes, from);
}

function stopAll() {
    player.stop();
    player.seek(0);
    activeNoteIdx.value = -1;
    activeBarIdx.value = -1;
}

function seekNote(n: FlatNote) {
    player.seek(n.startBeat);
    activeNoteIdx.value = n.idx;
    activeBarIdx.value = n.bar;
}

function resumeFollow() {
    followMode.value = true;
}

function rebuildAtCurrent() {
    if (!flat.value) return;
    const beat = player.secondsToBeats(player.seconds);
    player.rebuild(flat.value.bars, flat.value.notes, beat);
    totalSec.value = player.beatsToSeconds(flat.value.totalBeats);
}

watch(rate, rebuildAtCurrent);
watch(transposeSemis, rebuildAtCurrent);

function fmtTime(raw: number) {
    const s = Math.max(0, isFinite(raw) ? raw : 0);
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
}

/* ---------------- 加载 ---------------- */
function applyScore(s: Score, name: string) {
    stopAll();
    score.value = s;
    scoreName.value = name;
    transposeSemis.value = 0;
    player.setBaseBpm(s.meta.bpm || 90);
    // 等 DOM 渲染后初始化调度
    requestAnimationFrame(() => {
        rebuildAtCurrent();
        player.seek(0);
        window.scrollTo({ top: 0 });
    });
}

async function loadFile(file: File) {
    try {
        const text = await file.text();
        const data = JSON.parse(text) as Score;
        if (!data.bars?.length) throw new Error('谱面缺少 bars 数据');
        applyScore(data, file.name.replace(/\.json$/i, ''));
        message.success(`已加载：${data.meta?.title || file.name}`);
    } catch (e) {
        message.error(`谱面文件解析失败：${(e as Error).message}`);
    }
}

function onDrop(files: File[]) {
    const f = files.find((x) => /\.json$/i.test(x.name));
    if (f) loadFile(f);
    else message.warning('请导入 .json 谱面文件');
}

function loadSample() {
    applyScore(JSON.parse(JSON.stringify(SAMPLE_SCORE)) as Score, '小星星（示例）');
}

function openPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
        const f = input.files?.[0];
        if (f) loadFile(f);
    };
    input.click();
}

/* ---------------- 生命周期 ---------------- */
let ro: ResizeObserver | null = null;
onMounted(() => {
    raf = requestAnimationFrame(tick);
    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchmove', onUserScroll, { passive: true });
    ro = new ResizeObserver(() => {
        if (scoreEl.value) containerWidth.value = scoreEl.value.clientWidth;
    });
    if (scoreEl.value) {
        containerWidth.value = scoreEl.value.clientWidth;
        ro.observe(scoreEl.value);
    }
});
onBeforeUnmount(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener('wheel', onUserScroll);
    window.removeEventListener('touchmove', onUserScroll);
    ro?.disconnect();
    player.dispose();
});
</script>

<template>
    <div class="score-player">
        <!-- 工具栏 -->
        <header class="toolbar">
            <div class="meta">
                <template v-if="score">
                    <span class="title">{{ score.meta.title }}</span>
                    <span class="sub">{{ score.meta.artist }}</span>
                    <span class="tag">{{ keyInfo.label }}</span>
                    <span class="tag">♩={{ Math.round((score.meta.bpm || 90) * rate) }}</span>
                    <span class="tag">{{ score.meta.timeSig || '4/4' }}</span>
                    <span v-if="score.meta.capo" class="tag">Capo {{ score.meta.capo }}</span>
                </template>
                <span v-else class="title dim">滚动跟谱播放器</span>
            </div>
            <div class="controls">
                <NButton size="small" @click="openPicker">导入谱面</NButton>
                <NButton size="small" tertiary @click="loadSample">示例</NButton>
                <NButton v-if="score" size="small" circle @click="togglePlay">
                    <NIcon><IconPause v-if="playing" /><IconPlay v-else /></NIcon>
                </NButton>
                <NButton v-if="score" size="small" circle tertiary @click="stopAll">
                    <NIcon><IconStop /></NIcon>
                </NButton>
                <template v-if="score">
                    <span class="time">{{ fmtTime(curSec) }} / {{ fmtTime(totalSec) }}</span>
                    <div class="rate">
                        <span>速度</span>
                        <NSlider v-model:value="rate" :min="0.5" :max="1.25" :step="0.05" style="width: 90px" />
                        <span>{{ rate.toFixed(2) }}x</span>
                    </div>
                    <div class="transpose">
                        <NButton size="tiny" tertiary @click="transposeSemis--">♭</NButton>
                        <span>{{ transposeSemis > 0 ? '+' : '' }}{{ transposeSemis }}</span>
                        <NButton size="tiny" tertiary @click="transposeSemis++">♯</NButton>
                    </div>
                    <label class="switch"><NSwitch v-model:value="player.melodyOn" size="small" />旋律</label>
                    <label class="switch"><NSwitch v-model:value="player.chordOn" size="small" />和弦</label>
                    <label class="switch"><NSwitch v-model:value="scrollSeek" size="small" />滚动定位</label>
                    <NButton v-if="!followMode" size="small" type="primary" @click="resumeFollow">
                        <NIcon><IconLocate /></NIcon>&nbsp;跟随
                    </NButton>
                </template>
            </div>
        </header>

        <!-- 空状态 -->
        <div v-if="!score" class="empty">
            <FileDrop accepts=".json,application/json" @drop-file="onDrop">
                <template #empty>
                    <div class="drop-hint">
                        <p>拖入或点击选择 <b>.json</b> 谱面文件</p>
                        <p class="dim">谱面由扒谱管线生成，包含调式 / BPM / 和弦 / 简谱 / 歌词</p>
                        <NButton size="small" tertiary @click.stop="loadSample">先看看示例</NButton>
                    </div>
                </template>
            </FileDrop>
        </div>

        <!-- 谱面 -->
        <div v-else ref="scoreEl" class="sheet">
            <div class="caret" v-show="caret.show" :style="{ transform: `translate(${caret.x}px, ${caret.y}px)`, height: caret.h + 'px' }"></div>
            <div v-for="(line, li) in lines" :key="li" class="line" :ref="(el) => setLineEl(li, el)">
                <div v-for="bar in line.bars" :key="bar.index" class="bar" :style="{ flexBasis: bar.beats * BEAT_W + 14 + 'px' }">
                    <span v-if="sectionMap.get(bar.index)" class="section-tag">{{ sectionMap.get(bar.index) }}</span>
                    <div class="chord-row" @click.stop="seekNote(bar.notes[0])" v-if="bar.notes.length">
                        <NPopover v-if="bar.chord" trigger="click" placement="bottom">
                            <template #trigger>
                                <span class="chord-label" :class="{ active: bar.index === activeBarIdx }">{{ displayChord(bar.chord) }}</span>
                            </template>
                            <ChordDiagram :chord="displayChord(bar.chord)" />
                        </NPopover>
                    </div>
                    <div class="cells">
                        <template v-for="(cell, ci) in cellsOf(bar)" :key="ci">
                            <div
                                v-if="cell.type === 'note' && cell.note"
                                class="cell"
                                :class="{ active: cell.note.idx === activeNoteIdx }"
                                :style="{ flexBasis: cell.w * BEAT_W + 'px' }"
                                :ref="(el) => setNoteEl(cell.note!.idx, el)"
                                @click.stop="seekNote(cell.note!)"
                            >
                                <div class="digit" :class="{ rest: cell.note.d === '0', u1: cell.under === 1, u2: cell.under === 2 }">
                                    <span v-if="cell.note.oct > 0" class="oct top">{{ '·'.repeat(cell.note.oct) }}</span>
                                    <sup v-if="cell.note.acc" class="acc">{{ cell.note.acc }}</sup>
                                    <span class="num">{{ cell.note.d }}</span>
                                    <span v-if="cell.dotted" class="aug">·</span>
                                    <span v-if="cell.note.oct < 0" class="oct bottom">{{ '·'.repeat(-cell.note.oct) }}</span>
                                </div>
                                <div class="lyric">{{ cell.note.ly }}</div>
                            </div>
                            <div v-else class="cell dash" :style="{ flexBasis: cell.w * BEAT_W + 'px' }">
                                <div class="digit">–</div>
                                <div class="lyric"></div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
            <div class="tail-space"></div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.score-player {
    min-height: 100vh;
    background: #fafaf7;
}
.toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(250, 250, 247, 0.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #e5e2da;
    padding: 8px 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
    .meta {
        display: flex;
        align-items: baseline;
        gap: 10px;
        .title {
            font-size: 17px;
            font-weight: 600;
        }
        .sub {
            color: #777;
            font-size: 13px;
        }
        .tag {
            font-size: 12px;
            background: #efede6;
            border-radius: 4px;
            padding: 1px 7px;
            color: #555;
        }
        .dim {
            color: #999;
        }
    }
    .controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 12px;
        color: #666;
        .time {
            font-variant-numeric: tabular-nums;
        }
        .rate,
        .transpose {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .switch {
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
        }
    }
}
.empty {
    padding: 48px 20px;
    .drop-hint {
        text-align: center;
        color: #555;
        line-height: 2;
        .dim {
            color: #999;
            font-size: 13px;
        }
    }
}
.sheet {
    position: relative;
    padding: 24px 12px 40vh;
    max-width: 1100px;
    margin: 0 auto;
}
.caret {
    position: absolute;
    left: 0;
    top: 0;
    width: 2px;
    background: #f0a020;
    box-shadow: 0 0 6px rgba(240, 160, 32, 0.7);
    pointer-events: none;
    z-index: 5;
    transition: transform 0.06s linear;
}
.line {
    display: flex;
    margin: 26px 0 8px;
    border-top: 1px solid transparent;
}
.bar {
    position: relative;
    flex-grow: 0;
    flex-shrink: 0;
    border-left: 1px solid #c9c5ba;
    padding: 0 2px;
    &:last-child {
        border-right: 1px solid #c9c5ba;
    }
}
.section-tag {
    position: absolute;
    top: -20px;
    left: 0;
    font-size: 12px;
    color: #2080f0;
    background: #e8f1fd;
    padding: 0 8px;
    border-radius: 3px;
    white-space: nowrap;
}
.chord-row {
    height: 24px;
    padding-left: 4px;
}
.chord-label {
    display: inline-block;
    font-weight: 700;
    font-size: 15px;
    color: #b03a2e;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 3px;
    &.active {
        background: #fdeceb;
    }
    &:hover {
        background: #f6e3e1;
    }
}
.cells {
    display: flex;
}
.cell {
    flex-grow: 0;
    flex-shrink: 0;
    min-width: 20px;
    text-align: center;
    cursor: pointer;
    border-radius: 4px;
    &.active {
        background: #fff3d6;
        .num {
            color: #d48806;
        }
    }
}
.digit {
    position: relative;
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    min-width: 18px;
    padding: 8px 1px 3px;
    font-size: 19px;
    font-weight: 600;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #333;
    &.rest .num {
        color: #aaa;
        font-weight: 400;
    }
    .acc {
        font-size: 11px;
        margin-right: 1px;
    }
    .aug {
        margin-left: 1px;
    }
    .oct {
        position: absolute;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 14px;
        line-height: 1;
        letter-spacing: 1px;
        color: inherit;
        &.top {
            top: 0;
        }
        &.bottom {
            bottom: -3px;
        }
    }
    // 减时线：八分一条，十六分两条
    &.u1 {
        background-image: linear-gradient(#333, #333);
        background-repeat: no-repeat;
        background-size: 100% 1.6px;
        background-position: 0 100%;
    }
    &.u2 {
        background-image:
            linear-gradient(#333, #333),
            linear-gradient(#333, #333);
        background-repeat: no-repeat;
        background-size:
            100% 1.6px,
            100% 1.6px;
        background-position:
            0 100%,
            0 calc(100% - 3.5px);
    }
}
.dash .digit {
    color: #666;
    font-weight: 400;
}
.lyric {
    min-height: 20px;
    font-size: 14px;
    color: #444;
    padding-top: 3px;
}
.tail-space {
    height: 40vh;
}
</style>
