<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CHORDS, NOTE_NAMES, TUNINGS, findVoicing, noteName } from '../theory/chords';
import type { GuitarSynth } from '../audio/GuitarSynth';
import ChordEditor from './ChordEditor.vue';
import { METERS, DEFAULT_PATTERN, patternById, patternsForMeter, fretForStep } from './patterns';
import { CURRENT_SONG_KEY, deleteArrangement, getArrangement, listArrangements, saveArrangement } from './store';
import type { ArrangedChord, Arrangement, Measure } from './types';

const props = defineProps<{ tuningId: string; root: number; chordSuffix: string; synth: GuitarSynth }>();
const LAST_PATTERN_KEY = 'guitar:last-rhythm-pattern';
const uid = () => crypto.randomUUID();
const lastPattern = ref(localStorage.getItem(LAST_PATTERN_KEY) || DEFAULT_PATTERN);
const defaultPattern = (meter: string) => {
    const remembered = patternById(lastPattern.value);
    return remembered.meter === meter ? remembered.id : patternsForMeter(meter)[0].id;
};
const emptyMeasures = (meter: string) => Array.from({ length: 4 }, () => ({ id: uid(), chord: null, patternId: defaultPattern(meter) }));
const createSong = (index = 1): Arrangement => ({
    id: uid(), name: `未命名谱子 ${index}`, meter: '4/4', bpm: 80,
    tuningId: props.tuningId, measures: emptyMeasures('4/4'), updatedAt: Date.now(),
});

const song = ref<Arrangement>(createSong());
const songs = ref<Arrangement[]>([]);
const selectedId = ref(song.value.id);
const ready = ref(false);
const loading = ref(false);
const saveState = ref('正在读取');
const dragTarget = ref<string | null>(null);
const editingMeasure = ref<Measure | null>(null);
const exporting = ref(false);
const playbackState = ref<'stopped' | 'playing' | 'paused'>('stopped');
const currentMeasure = ref(-1);
const currentStep = ref(-1);
const playbackOffset = ref(0);
const playbackProgress = ref(0);
const sheetPaper = ref<HTMLElement | null>(null);
let saveTimer = 0;
let transportTimer = 0;
let transportAnchor = 0;
let transportVersion = 0;
const availablePatterns = computed(() => patternsForMeter(song.value.meter));
const editingChord = computed(() => editingMeasure.value?.chord ?? null);

async function replaceSong(next: Arrangement) {
    stopPlayback();
    loading.value = true;
    window.clearTimeout(saveTimer);
    song.value = JSON.parse(JSON.stringify(next));
    selectedId.value = next.id;
    localStorage.setItem(CURRENT_SONG_KEY, next.id);
    await nextTick();
    loading.value = false;
    saveState.value = '已保存';
}
async function refreshList() {
    songs.value = await listArrangements();
}
async function persist() {
    if (!ready.value || loading.value) return;
    const snapshot: Arrangement = JSON.parse(JSON.stringify(song.value));
    snapshot.updatedAt = Date.now();
    song.value.updatedAt = snapshot.updatedAt;
    await saveArrangement(snapshot);
    const index = songs.value.findIndex(item => item.id === snapshot.id);
    if (index >= 0) songs.value[index] = snapshot;
    else songs.value.unshift(snapshot);
    songs.value.sort((a, b) => b.updatedAt - a.updatedAt);
    saveState.value = '已自动保存';
}
function queueSave() {
    if (!ready.value || loading.value) return;
    saveState.value = '保存中…';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 350);
}
async function selectSong() {
    const selected = await getArrangement(selectedId.value);
    if (selected) await replaceSong(selected);
}
async function newSong() {
    const next = createSong(songs.value.length + 1);
    await saveArrangement(next);
    await refreshList();
    await replaceSong(next);
}
async function removeSong() {
    if (!window.confirm(`确定删除“${song.value.name}”吗？此操作无法撤销。`)) return;
    window.clearTimeout(saveTimer);
    await deleteArrangement(song.value.id);
    await refreshList();
    if (songs.value.length) await replaceSong(songs.value[0]);
    else await newSong();
}
function addMeasure() {
    song.value.measures.push({ id: uid(), chord: null, patternId: defaultPattern(song.value.meter) });
}
function removeMeasure(measure: Measure) {
    if (song.value.measures.length <= 1) return;
    song.value.measures = song.value.measures.filter(item => item.id !== measure.id);
}
function assignChord(measure: Measure, root: number, suffix: string) {
    const definition = CHORDS.find(chord => chord.suffix === suffix);
    if (!definition) return;
    const tuning = TUNINGS.find(item => item.id === props.tuningId) ?? TUNINGS[0];
    const voicing = findVoicing(root, definition, tuning.strings);
    const chord: ArrangedChord = {
        root, suffix, name: `${NOTE_NAMES[root]}${suffix}`,
        frets: voicing.frets, midi: voicing.midi, strings: [...tuning.strings],
    };
    measure.chord = chord;
    song.value.tuningId = props.tuningId;
    if (patternById(measure.patternId).meter !== song.value.meter) measure.patternId = defaultPattern(song.value.meter);
}
function dropChord(event: DragEvent, measure: Measure) {
    event.preventDefault();
    dragTarget.value = null;
    try {
        const data = JSON.parse(event.dataTransfer?.getData('application/x-guitar-chord') || '') as { root: number; suffix: string };
        assignChord(measure, data.root, data.suffix);
    } catch { /* 非本页面的拖入内容直接忽略。 */ }
}
function choosePattern(measure: Measure) {
    lastPattern.value = measure.patternId;
    localStorage.setItem(LAST_PATTERN_KEY, lastPattern.value);
}
function saveFingering(frets: Array<number | null>, midi: number[]) {
    if (!editingMeasure.value?.chord) return;
    editingMeasure.value.chord.frets = frets;
    editingMeasure.value.chord.midi = midi;
    editingMeasure.value = null;
}
function normalizeBpm() {
    song.value.bpm = Math.max(30, Math.min(240, Math.round(song.value.bpm || 80)));
}
const stepDuration = computed(() => 60 / song.value.bpm / 2);
const measureDuration = computed(() => patternsForMeter(song.value.meter)[0].steps.length * stepDuration.value);
const totalDuration = computed(() => song.value.measures.length * measureDuration.value);

function clearTransportClock() {
    window.clearInterval(transportTimer);
    transportTimer = 0;
}
function updateTransport() {
    const position = Math.max(0, props.synth.now - transportAnchor);
    playbackProgress.value = Math.min(1, position / Math.max(0.01, totalDuration.value));
    currentMeasure.value = Math.min(song.value.measures.length - 1, Math.floor(position / measureDuration.value));
    currentStep.value = Math.floor((position % measureDuration.value) / stepDuration.value);
    if (position >= totalDuration.value) stopPlayback();
}
function startTransportClock() {
    clearTransportClock();
    transportTimer = window.setInterval(updateTransport, 40);
    updateTransport();
}
async function schedulePlayback(offset: number, version: number) {
    await props.synth.resume();
    transportAnchor = props.synth.now + 0.2 - offset;
    for (let measureIndex = 0; measureIndex < song.value.measures.length; measureIndex++) {
        const measure = song.value.measures[measureIndex];
        if (!measure.chord) continue;
        const pattern = patternById(measure.patternId);
        const chord = measure.chord;
        for (let stepIndex = 0; stepIndex < pattern.steps.length; stepIndex++) {
            const eventTime = measureIndex * measureDuration.value + stepIndex * stepDuration.value;
            if (eventTime < offset - 0.001) continue;
            const when = transportAnchor + eventTime;
            const step = pattern.steps[stepIndex];
            if (version !== transportVersion) return;
            if (step.stroke) {
                await props.synth.strum({ frets: chord.frets, midi: chord.midi }, chord.strings, when, step.muted ? 0.22 : 0.82);
            } else {
                for (const string of step.strings) {
                    const stringIndex = 6 - string;
                    const fret = chord.frets[stringIndex];
                    if (fret === null || fret === undefined) continue;
                    await props.synth.pluck(chord.strings[stringIndex] + fret, {
                        stringIndex, when, velocity: 0.62,
                        pan: (stringIndex - 2.5) * 0.055,
                    });
                }
            }
        }
    }
}
async function play() {
    if (playbackState.value === 'playing') return;
    const offset = playbackState.value === 'paused' ? playbackOffset.value : 0;
    const version = ++transportVersion;
    playbackState.value = 'playing';
    await schedulePlayback(offset, version);
    if (playbackState.value === 'playing' && version === transportVersion) startTransportClock();
}
function pause() {
    if (playbackState.value !== 'playing') return;
    transportVersion++;
    playbackOffset.value = Math.max(0, Math.min(totalDuration.value, props.synth.now - transportAnchor));
    playbackState.value = 'paused';
    clearTransportClock();
    props.synth.stopAll();
}
function stopPlayback() {
    transportVersion++;
    playbackState.value = 'stopped';
    playbackOffset.value = 0;
    playbackProgress.value = 0;
    currentMeasure.value = -1;
    currentStep.value = -1;
    clearTransportClock();
    props.synth.stopAll();
}

async function exportPng() {
    if (!sheetPaper.value || exporting.value) return;
    exporting.value = true;
    try {
        await nextTick();
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(sheetPaper.value, { backgroundColor: '#f8f6f0', scale: 2, useCORS: true });
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 编码失败')), 'image/png');
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${song.value.name.replace(/[\\/:*?"<>|]/g, '_')}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
        exporting.value = false;
    }
}

watch(() => song.value.meter, meter => {
    song.value.measures.forEach(measure => {
        if (patternById(measure.patternId).meter !== meter) measure.patternId = defaultPattern(meter);
    });
});
watch(() => [song.value.meter, song.value.bpm, song.value.measures], () => { if (playbackState.value !== 'stopped') stopPlayback(); }, { deep: true });
watch(() => props.tuningId, tuningId => { if (ready.value) song.value.tuningId = tuningId; });
watch(() => [song.value.name, song.value.meter, song.value.bpm, song.value.tuningId, song.value.measures], queueSave, { deep: true });
onMounted(async () => {
    await refreshList();
    const previousId = localStorage.getItem(CURRENT_SONG_KEY);
    const previous = previousId ? await getArrangement(previousId) : null;
    if (previous) await replaceSong(previous);
    else if (songs.value.length) await replaceSong(songs.value[0]);
    else {
        await saveArrangement(song.value);
        await refreshList();
        localStorage.setItem(CURRENT_SONG_KEY, song.value.id);
    }
    ready.value = true;
    saveState.value = '已自动保存';
});
onBeforeUnmount(() => {
    window.clearTimeout(saveTimer);
    stopPlayback();
});
</script>

<template>
    <section class="arranger" aria-label="谱子编排">
        <header class="arranger-heading">
            <div><p class="eyebrow"><span></span> SONGBOOK · 02</p><h2>把和弦，写成一首歌。</h2><p>从上方拖入和弦，编排你的节奏与按法。</p></div>
            <div class="library-actions">
                <label><span>我的谱子</span><select v-model="selectedId" aria-label="选择以往谱子" @change="selectSong"><option v-for="item in songs" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
                <button @click="newSong">＋ 新建</button><button class="danger" @click="removeSong">删除</button>
                <button class="export" :disabled="exporting" @click="exportPng">{{ exporting ? '导出中…' : '导出图片' }}</button>
            </div>
        </header>

        <div class="song-controls">
            <input v-model="song.name" class="song-name" aria-label="谱子名称" maxlength="60">
            <label>节拍<select v-model="song.meter"><option v-for="meter in METERS" :key="meter" :value="meter">{{ meter }}</option></select></label>
            <label>BPM<input v-model.number="song.bpm" type="number" min="30" max="240" @change="normalizeBpm"></label>
            <div class="transport" aria-label="播放控制">
                <button class="play" :disabled="playbackState === 'playing'" @click="play">▶ <span>播放</span></button>
                <button :disabled="playbackState !== 'playing'" @click="pause">Ⅱ <span>暂停</span></button>
                <button :disabled="playbackState === 'stopped'" @click="stopPlayback">■ <span>停止</span></button>
                <span class="transport-position">{{ currentMeasure < 0 ? '—' : currentMeasure + 1 }} / {{ song.measures.length }}</span>
            </div>
            <span class="save-state"><i></i>{{ saveState }}</span>
            <span class="drag-reminder">拖拽和弦到谱面小节</span>
            <div class="transport-progress" :class="{ active: playbackState !== 'stopped' }"><i :style="{ width: `${playbackProgress * 100}%` }"></i></div>
        </div>

        <div ref="sheetPaper" class="sheet-paper" :class="{ exporting }">
            <div class="sheet-meta"><strong>{{ song.name }}</strong><span>{{ song.meter }} · ♩ = {{ song.bpm }} · {{ TUNINGS.find(t => t.id === song.tuningId)?.name }}</span></div>
            <div class="measure-grid">
                <article
                    v-for="(measure, index) in song.measures" :key="measure.id" class="measure"
                    :class="{ 'drag-over': dragTarget === measure.id, empty: !measure.chord, playing: currentMeasure === index && playbackState !== 'stopped' }"
                    @dragover.prevent="dragTarget = measure.id" @dragleave="dragTarget = null" @drop="dropChord($event, measure)"
                >
                    <div class="measure-number">{{ String(index + 1).padStart(2, '0') }}<button v-if="song.measures.length > 1" title="删除小节" @click="removeMeasure(measure)">×</button></div>
                    <template v-if="measure.chord">
                        <button class="fingering-button" title="编辑和弦按法" @click="editingMeasure = measure">
                            <strong>{{ measure.chord.name }}</strong><span>{{ measure.chord.frets.map(f => f === null ? '×' : f).join(' ') }}</span><i>编辑按法</i>
                        </button>
                        <select v-model="measure.patternId" class="pattern-select" aria-label="节奏型" @change="choosePattern(measure)">
                            <option v-for="pattern in availablePatterns" :key="pattern.id" :value="pattern.id">{{ pattern.name }}</option>
                        </select>
                        <div class="tab-staff" :style="{ '--steps': patternById(measure.patternId).steps.length }">
                            <div v-for="string in 6" :key="string" class="tab-row">
                                <span class="tab-string-name">{{ noteName(measure.chord.strings[6 - string]) }}</span>
                                <div class="tab-line"></div>
                                <div v-for="(step, stepIndex) in patternById(measure.patternId).steps" :key="stepIndex" class="tab-step" :class="{ current: currentMeasure === index && currentStep === stepIndex && playbackState !== 'stopped' }">
                                    <b v-if="step.strings.includes(string)" :class="{ strum: step.stroke }">{{ step.stroke ? (step.muted ? '×' : '•') : fretForStep(string, measure.chord.frets) }}</b>
                                </div>
                            </div>
                            <div class="stroke-row"><span>♪</span><i v-for="(step, stepIndex) in patternById(measure.patternId).steps" :key="stepIndex" :class="{ current: currentMeasure === index && currentStep === stepIndex && playbackState !== 'stopped' }">{{ step.stroke === 'down' ? '↓' : step.stroke === 'up' ? '↑' : '·' }}</i></div>
                        </div>
                    </template>
                    <button v-else class="empty-measure" title="拖入和弦，或先点击上方和弦再点击此处" @click="assignChord(measure, root, chordSuffix)"><span>＋</span><strong>拖入或点击放入</strong><small>DROP CHORD HERE</small></button>
                </article>
                <button class="add-measure" @click="addMeasure"><span>＋</span>添加小节</button>
            </div>
            <div class="sheet-footer"><span>ACOUSTIC SONGBOOK</span><span>{{ song.measures.length }} MEASURES</span></div>
        </div>
        <ChordEditor v-if="editingChord" :chord="editingChord" @close="editingMeasure = null" @save="saveFingering" />
    </section>
</template>

<style scoped>
.arranger { position: relative; margin-top: 46px; padding-top: 32px; border-top: 1px solid #dcd8cd; }
.arranger-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.arranger-heading .eyebrow { margin-bottom: 9px; }
.arranger-heading h2 { margin: 0; font-family: "Songti SC", Georgia, serif; font-size: 28px; font-weight: 500; color: #42463e; }
.arranger-heading > div > p:last-child { margin: 9px 0 0; color: #99998f; font-size: 11px; }
.library-actions { display: flex; align-items: flex-end; gap: 7px; }
.library-actions label span { display: block; margin: 0 0 5px 2px; color: #aaa89e; font-size: 8px; }
.library-actions select, .library-actions button, .song-controls select, .song-controls input { height: 34px; border: 1px solid #dcd8ce; border-radius: 6px; background: #fffdf9; color: #66685f; font-size: 10px; }
.library-actions select { width: 145px; padding: 0 8px; }
.library-actions button { padding: 0 12px; cursor: pointer; }
.library-actions button:hover { border-color: #b79776; }
.library-actions .danger { color: #aa8071; }
.library-actions .export { border-color: #9b704c; background: #9b704c; color: white; }
.library-actions button:disabled { opacity: .6; }
.song-controls { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 22px; padding: 13px 16px; border: 1px solid #e0ddd4; border-radius: 9px; background: #ffffffa8; }

.transport { display: flex; align-items: center; gap: 4px; padding-left: 14px; border-left: 1px solid #e2ded4; }
.transport button { height: 30px; min-width: 50px; padding: 0 9px; border: 1px solid #d8d2c6; border-radius: 5px; background: #fffdf9; color: #77776d; cursor: pointer; font-size: 10px; }
.transport button span { margin-left: 3px; font-size: 9px; }
.transport button.play { border-color: #9c704b; background: #9c704b; color: white; }
.transport button:disabled { border-color: #e4e0d7; background: #f3f1eb; color: #b9b6ad; cursor: default; }
.transport-position { min-width: 38px; margin-left: 6px; color: #9b9488; font-family: monospace; font-size: 9px; text-align: center; }
.transport-progress { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; overflow: hidden; border-radius: 2px; }
.transport-progress i { display: block; height: 100%; background: #a97850; transition: width .04s linear; }
.song-controls .song-name { width: 190px; padding: 0 10px; font-size: 12px; }
.song-controls label { display: flex; align-items: center; gap: 7px; color: #99998f; font-size: 9px; }
.song-controls select { width: 65px; padding: 0 5px; }
.song-controls input[type=number] { width: 58px; padding: 0 7px; }
.save-state { display: flex; align-items: center; gap: 5px; color: #9c9d91; font-size: 9px; }
.save-state i { width: 5px; height: 5px; border-radius: 50%; background: #86937b; }
.drag-reminder { margin-left: auto; color: #aaa89f; font-size: 9px; }
.sheet-paper { margin-top: 14px; padding: 22px; border: 1px solid #dedbd1; border-radius: 10px; background: #f8f6f0; }
.sheet-meta { display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px 17px; }
.sheet-meta strong { font-family: "Songti SC", Georgia, serif; color: #55574f; font-size: 16px; font-weight: 500; }
.sheet-meta span { color: #9a998f; font-family: Georgia, serif; font-size: 10px; }
.measure-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border-top: 1px solid #8d8272; border-left: 1px solid #8d8272; background: #fffefa; }
.measure { position: relative; min-width: 0; min-height: 226px; padding: 16px 12px 12px; border: 0; border-right: 1px solid #8d8272; border-bottom: 1px solid #b8ae9e; border-radius: 0; background: transparent; transition: background .18s; }
.measure:nth-child(4n), .measure:last-of-type { border-right: 3px double #766b5c; }
.measure.playing { background: linear-gradient(180deg, #b98b5510, #b98b5505); box-shadow: inset 0 -2px #b08252; }
.measure.drag-over { border-color: #a67549; background: #f6ecdd; box-shadow: 0 0 0 3px #a6754915; }
.measure-number { position: absolute; top: 5px; left: 7px; right: 7px; display: flex; justify-content: space-between; color: #c1bbae; font-family: Georgia, serif; font-size: 7px; }
.measure-number button { opacity: 0; border: 0; background: none; color: #bbb4a8; cursor: pointer; font-size: 13px; line-height: 10px; }
.measure:hover .measure-number button { opacity: 1; }
.fingering-button { display: flex; align-items: baseline; width: 100%; gap: 8px; margin: 7px 0 8px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.fingering-button strong { color: #91643e; font-family: Georgia, serif; font-size: 22px; font-weight: 400; }
.fingering-button span { color: #9d988b; font-family: monospace; font-size: 8px; }
.fingering-button i { margin-left: auto; color: #b1a795; font-size: 7px; font-style: normal; opacity: 0; transition: .15s; }
.fingering-button:hover i { opacity: 1; }
.pattern-select { width: 100%; height: 23px; padding: 0 2px; border: 0; border-bottom: 1px dashed #ded6c8; border-radius: 0; background: transparent; color: #948977; font-size: 8px; }
.pattern-select:hover, .pattern-select:focus { background: #f5f0e6; }
.tab-staff { margin: 13px -12px 0; }
.tab-row { position: relative; display: grid; grid-template-columns: 15px repeat(var(--steps), minmax(0,1fr)); align-items: center; height: 18px; }
.tab-string-name { color: #9f998b; font-family: Georgia, serif; font-size: 8px; }
.tab-line { position: absolute; left: 15px; right: 0; top: 50%; height: 1px; background: #d7d1c4; }
.tab-step { position: relative; z-index: 1; display: flex; justify-content: center; }
.tab-step.current b { border-radius: 2px; background: #a8794e; color: white; }
.tab-step b { min-width: 12px; padding: 0 2px; background: #fffefa; color: #686456; font-family: monospace; font-size: 9px; font-weight: 500; text-align: center; }
.tab-step b.strum { color: #a67850; font-size: 7px; }
.stroke-row { display: grid; grid-template-columns: 15px repeat(var(--steps), minmax(0,1fr)); margin-top: 5px; color: #a47750; text-align: center; }
.stroke-row > span { font-size: 8px; }
.stroke-row i.current { color: #9a683e; font-weight: 700; }
.stroke-row i { font-family: sans-serif; font-size: 12px; font-style: normal; }
.stroke-row i:empty::after { content: '·'; color: #d1cabd; }
.empty-measure { width: 100%; min-height: 194px; border: 0; background: transparent; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #b5aea0; }
.empty-measure > span { display: grid; place-items: center; width: 31px; height: 31px; margin-bottom: 9px; color: #c0b5a3; font-size: 22px; font-weight: 200; }
.empty-measure strong { font-size: 10px; font-weight: 500; }
.empty-measure small { margin-top: 5px; font-size: 6px; letter-spacing: 1.2px; }
.add-measure { grid-column: 1 / -1; min-height: 38px; border: 0; border-bottom: 1px solid #d3cabb; border-radius: 0; background: transparent; color: #a39886; cursor: pointer; font-size: 9px; text-align: right; padding-right: 12px; }
.add-measure span { margin-right: 6px; font-size: 15px; }
.add-measure:hover { color: #8f633f; background: #f7f1e7; }
.measure:not(:nth-child(4n+1)) .tab-row, .measure:not(:nth-child(4n+1)) .stroke-row { grid-template-columns: 0 repeat(var(--steps), minmax(0,1fr)); }
.measure:not(:nth-child(4n+1)) .tab-string-name { visibility: hidden; width: 0; overflow: hidden; }
.measure:not(:nth-child(4n+1)) .tab-line { left: 0; }
.measure:not(:nth-child(4n+1)) .stroke-row > span { visibility: hidden; }
.sheet-paper.exporting .add-measure, .sheet-paper.exporting .measure-number button { display: none; }
.sheet-paper.exporting .measure.playing { background: transparent; box-shadow: none; }
.sheet-footer { display: flex; justify-content: space-between; margin-top: 18px; color: #b0aa9d; font-size: 6px; letter-spacing: 1.4px; }
@media (max-width: 1100px) { .arranger-heading { align-items: flex-start; flex-direction: column; } .library-actions { width: 100%; } .library-actions label { flex: 1; } .library-actions select { width: 100%; } .measure-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 650px) { .arranger { margin-top: 30px; padding-top: 24px; } .arranger-heading h2 { font-size: 24px; } .library-actions { flex-wrap: wrap; } .library-actions label { flex-basis: 100%; } .song-controls { flex-wrap: wrap; gap: 10px; }
.transport { display: flex; align-items: center; gap: 4px; padding-left: 14px; border-left: 1px solid #e2ded4; }
.transport button { height: 30px; min-width: 50px; padding: 0 9px; border: 1px solid #d8d2c6; border-radius: 5px; background: #fffdf9; color: #77776d; cursor: pointer; font-size: 10px; }
.transport button span { margin-left: 3px; font-size: 9px; }
.transport button.play { border-color: #9c704b; background: #9c704b; color: white; }
.transport button:disabled { border-color: #e4e0d7; background: #f3f1eb; color: #b9b6ad; cursor: default; }
.transport-position { min-width: 38px; margin-left: 6px; color: #9b9488; font-family: monospace; font-size: 9px; text-align: center; }
.transport-progress { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; overflow: hidden; border-radius: 2px; }
.transport-progress i { display: block; height: 100%; background: #a97850; transition: width .04s linear; }
.song-controls .song-name { width: 100%; } .drag-reminder { display: none; } .sheet-paper { padding: 12px; } .sheet-meta { align-items: flex-start; flex-direction: column; gap: 5px; } .measure-grid { grid-template-columns: 1fr; } }
</style>
