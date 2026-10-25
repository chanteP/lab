<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CHORDS, NOTE_NAMES, TUNINGS, findVoicing, noteName, type ChordIdentity } from '../theory/chords';
import { noteColorStyle } from '../theory/noteColors';
import type { GuitarSynth } from '../audio/GuitarSynth';
import ChordEditor from './ChordEditor.vue';
import { METERS, DEFAULT_PATTERN, patternById, patternsForMeter } from './patterns';
import { CURRENT_SONG_KEY, deleteArrangement, getArrangement, listArrangements, saveArrangement } from './store';
import type { ArrangedChord, Arrangement, Measure, MeasureChord, RhythmStep } from './types';

const props = defineProps<{ tuningId: string; root: number; chordSuffix: string; synth: GuitarSynth }>();
const LAST_PATTERN_KEY = 'guitar:last-rhythm-pattern';
const uid = () => crypto.randomUUID();
const lastPattern = ref(localStorage.getItem(LAST_PATTERN_KEY) || DEFAULT_PATTERN);
const defaultPattern = (meter: string) => {
    const remembered = patternById(lastPattern.value);
    return remembered.meter === meter ? remembered.id : patternsForMeter(meter)[0].id;
};
const meterBeats = (meter: string) => Number(meter.split('/')[0]);
const emptyMeasure = (meter: string): Measure => ({
    id: uid(), chords: [], lyrics: Array(meterBeats(meter)).fill(''), patternId: defaultPattern(meter), note: '',
});
const emptyMeasures = (meter: string) => Array.from({ length: 4 }, () => emptyMeasure(meter));
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
const dropBeat = ref(0);
const editingMeasure = ref<Measure | null>(null);
const editingBeat = ref(-1);
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
const beatCount = computed(() => meterBeats(song.value.meter));
const totalSteps = computed(() => availablePatterns.value[0].steps.length);
const stepsPerBeat = computed(() => totalSteps.value / beatCount.value);
const editingSlot = computed(() => editingMeasure.value?.chords.find(slot => slot.beat === editingBeat.value) ?? null);
const editingChord = computed(() => editingSlot.value?.chord ?? null);
const usedChords = computed(() => {
    const unique = new Map<string, ArrangedChord>();
    song.value.measures.forEach(measure => measure.chords.forEach(slot => {
        unique.set(`${slot.chord.name}:${slot.chord.frets.join(',')}`, slot.chord);
    }));
    return [...unique.values()];
});

function normalizeSong(input: Arrangement): Arrangement {
    const next: Arrangement = JSON.parse(JSON.stringify(input));
    const beats = meterBeats(next.meter);
    next.measures = next.measures.map(measure => {
        if (!Array.isArray(measure.chords)) {
            measure.chords = measure.chord ? [{ id: uid(), beat: 0, chord: measure.chord }] : [];
        }
        const oldLyrics = Array.isArray(measure.lyrics) ? measure.lyrics : [measure.lyric ?? ''];
        measure.lyrics = Array.from({ length: beats }, (_, index) => oldLyrics[index] ?? '');
        measure.chords = measure.chords.filter(slot => slot.beat >= 0 && slot.beat < beats).sort((a, b) => a.beat - b.beat);
        delete measure.chord;
        delete measure.lyric;
        return measure;
    });
    return next;
}
async function replaceSong(input: Arrangement) {
    stopPlayback();
    loading.value = true;
    window.clearTimeout(saveTimer);
    const next = normalizeSong(input);
    song.value = next;
    selectedId.value = next.id;
    localStorage.setItem(CURRENT_SONG_KEY, next.id);
    await nextTick();
    loading.value = false;
    saveState.value = '已保存';
}
async function refreshList() { songs.value = await listArrangements(); }
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
    const measure = emptyMeasure(song.value.meter);
    song.value.measures.push(measure);
    return measure;
}
function removeMeasure(measure: Measure) {
    song.value.measures = song.value.measures.filter(item => item.id !== measure.id);
}
function makeChord(root: number, suffix: string) {
    const definition = CHORDS.find(chord => chord.suffix === suffix);
    if (!definition) return null;
    const tuning = TUNINGS.find(item => item.id === props.tuningId) ?? TUNINGS[0];
    const voicing = findVoicing(root, definition, tuning.strings);
    return { root, suffix, name: `${NOTE_NAMES[root]}${suffix}`, frets: voicing.frets, midi: voicing.midi, strings: [...tuning.strings] } as ArrangedChord;
}
function putChord(measure: Measure, chord: ArrangedChord, beat: number) {
    const existing = measure.chords.find(slot => slot.beat === beat);
    if (existing) existing.chord = JSON.parse(JSON.stringify(chord));
    else measure.chords.push({ id: uid(), beat, chord: JSON.parse(JSON.stringify(chord)) });
    measure.chords.sort((a, b) => a.beat - b.beat);
    song.value.tuningId = props.tuningId;
}
function assignChord(measure: Measure, root: number, suffix: string, beat = 0) {
    const chord = makeChord(root, suffix);
    if (chord) putChord(measure, chord, beat);
}
function firstOpenBeat(measure: Measure) {
    const open = Array.from({ length: beatCount.value }, (_, beat) => beat).find(beat => !measure.chords.some(slot => slot.beat === beat));
    return open ?? 0;
}
function readDrag(event: DragEvent) {
    try {
        return JSON.parse(event.dataTransfer?.getData('application/x-guitar-chord') || '') as { root?: number; suffix?: string; chord?: ArrangedChord };
    } catch { return null; }
}
function applyDrop(event: DragEvent, measure: Measure, beat: number) {
    const data = readDrag(event);
    if (!data) return;
    if (data.chord) putChord(measure, data.chord, beat);
    else if (data.root !== undefined && data.suffix !== undefined) assignChord(measure, data.root, data.suffix, beat);
}
function hoverDrop(event: DragEvent, measure: Measure) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropBeat.value = Math.max(0, Math.min(beatCount.value - 1, Math.floor((event.clientX - rect.left) / rect.width * beatCount.value)));
    dragTarget.value = measure.id;
    event.dataTransfer!.dropEffect = 'copy';
}
function dropChord(event: DragEvent, measure: Measure) {
    event.preventDefault();
    hoverDrop(event, measure);
    applyDrop(event, measure, dropBeat.value);
    dragTarget.value = null;
}
function dropNewMeasure(event: DragEvent) {
    event.preventDefault();
    const measure = addMeasure();
    applyDrop(event, measure, 0);
    dragTarget.value = null;
}
function dragUsedChord(event: DragEvent, chord: ArrangedChord) {
    event.dataTransfer!.effectAllowed = 'copy';
    event.dataTransfer!.setData('application/x-guitar-chord', JSON.stringify({ chord }));
}
function choosePattern(measure: Measure) {
    lastPattern.value = measure.patternId;
    localStorage.setItem(LAST_PATTERN_KEY, lastPattern.value);
}
function editChord(measure: Measure, slot: MeasureChord) {
    editingMeasure.value = measure;
    editingBeat.value = slot.beat;
}
function saveFingering(frets: Array<number | null>, midi: number[], identity: ChordIdentity) {
    const slot = editingSlot.value;
    if (!slot) return;
    slot.chord.frets = frets;
    slot.chord.midi = midi;
    slot.chord.root = identity.root;
    slot.chord.suffix = identity.suffix;
    slot.chord.name = identity.name;
    editingMeasure.value = null;
    editingBeat.value = -1;
}
function slotDuration(measure: Measure, slot: MeasureChord) {
    const next = measure.chords.find(candidate => candidate.beat > slot.beat);
    return (next?.beat ?? beatCount.value) - slot.beat;
}
function slotAtStep(measure: Measure, stepIndex: number) {
    const beat = Math.floor(stepIndex / stepsPerBeat.value);
    return [...measure.chords].reverse().find(slot => slot.beat <= beat) ?? null;
}
function stepAt(measure: Measure, stepIndex: number): RhythmStep | null {
    const slot = slotAtStep(measure, stepIndex);
    if (!slot) return null;
    const localStep = stepIndex - slot.beat * stepsPerBeat.value;
    return patternById(measure.patternId).steps[localStep] ?? null;
}
function tabMark(measure: Measure, stepIndex: number, string: number) {
    const slot = slotAtStep(measure, stepIndex);
    const step = stepAt(measure, stepIndex);
    if (!slot || !step?.strings.includes(string)) return '';
    if (step.slap || step.muted) return '×';
    if (step.stroke) return '•';
    const fret = slot.chord.frets[6 - string];
    return fret === null || fret === undefined ? '×' : String(fret);
}
function strokeMark(measure: Measure, stepIndex: number) {
    const step = stepAt(measure, stepIndex);
    if (!step) return '·';
    return step.slap ? '✕' : step.stroke === 'down' ? '↓' : step.stroke === 'up' ? '↑' : '·';
}
function openString(measure: Measure, string: number) {
    const chord = measure.chords[0]?.chord;
    return chord ? chord.strings[6 - string] : (TUNINGS.find(item => item.id === song.value.tuningId) ?? TUNINGS[0]).strings[6 - string];
}
function normalizeBpm() { song.value.bpm = Math.max(30, Math.min(240, Math.round(song.value.bpm || 80))); }

const stepDuration = computed(() => 60 / song.value.bpm / 2);
const measureDuration = computed(() => totalSteps.value * stepDuration.value);
const totalDuration = computed(() => song.value.measures.length * measureDuration.value);
function clearTransportClock() { window.clearInterval(transportTimer); transportTimer = 0; }
function updateTransport() {
    const position = Math.max(0, props.synth.now - transportAnchor);
    playbackProgress.value = Math.min(1, position / Math.max(0.01, totalDuration.value));
    currentMeasure.value = Math.min(song.value.measures.length - 1, Math.floor(position / measureDuration.value));
    currentStep.value = Math.floor((position % measureDuration.value) / stepDuration.value);
    if (position >= totalDuration.value) stopPlayback();
}
function startTransportClock() { clearTransportClock(); transportTimer = window.setInterval(updateTransport, 40); updateTransport(); }
async function schedulePlayback(offset: number, version: number) {
    await props.synth.resume();
    transportAnchor = props.synth.now + 0.2 - offset;
    for (let measureIndex = 0; measureIndex < song.value.measures.length; measureIndex++) {
        const measure = song.value.measures[measureIndex];
        for (const slot of measure.chords) {
            const chord = slot.chord;
            const length = slotDuration(measure, slot) * stepsPerBeat.value;
            const pattern = patternById(measure.patternId);
            for (let localStep = 0; localStep < length; localStep++) {
                const eventTime = measureIndex * measureDuration.value + (slot.beat * stepsPerBeat.value + localStep) * stepDuration.value;
                if (eventTime < offset - 0.001) continue;
                const when = transportAnchor + eventTime;
                const step = pattern.steps[localStep];
                if (!step || version !== transportVersion) return;
                if (step.slap) await props.synth.slap(when);
                else if (step.stroke) await props.synth.strum({ frets: chord.frets, midi: chord.midi }, chord.strings, when, step.muted ? 0.22 : 0.82);
                else for (const string of step.strings) {
                    const stringIndex = 6 - string;
                    const fret = chord.frets[stringIndex];
                    if (fret === null || fret === undefined) continue;
                    await props.synth.pluck(chord.strings[stringIndex] + fret, { stringIndex, when, velocity: 0.62, pan: (stringIndex - 2.5) * 0.055 });
                }
            }
        }
    }
}
async function play() {
    if (playbackState.value === 'playing' || !song.value.measures.length) return;
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
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 编码失败')), 'image/png'));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${song.value.name.replace(/[\\/:*?"<>|]/g, '_')}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { exporting.value = false; }
}

watch(() => song.value.meter, meter => {
    const beats = meterBeats(meter);
    song.value.measures.forEach(measure => {
        if (patternById(measure.patternId).meter !== meter) measure.patternId = defaultPattern(meter);
        measure.chords = measure.chords.filter(slot => slot.beat < beats);
        measure.lyrics = Array.from({ length: beats }, (_, index) => measure.lyrics[index] ?? '');
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
onBeforeUnmount(() => { window.clearTimeout(saveTimer); stopPlayback(); });
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
            <span class="save-state"><i></i>{{ saveState }}</span><span class="drag-reminder">拖到拍点，或拖到末尾新增小节</span>
            <div class="transport-progress"><i :style="{ width: `${playbackProgress * 100}%` }"></i></div>
        </div>
        <div ref="sheetPaper" class="sheet-paper" :class="{ exporting }">
            <div class="sheet-meta"><strong>{{ song.name }}</strong><div v-if="usedChords.length" class="used-chords"><small>本谱和弦</small><div><button v-for="chord in usedChords" :key="`${chord.name}:${chord.frets.join(',')}`" draggable="true" :style="noteColorStyle(chord.root)" title="拖动此按法到小节" @dragstart="dragUsedChord($event, chord)">{{ chord.name }}</button></div></div><span>{{ song.meter }} · ♩ = {{ song.bpm }} · {{ TUNINGS.find(t => t.id === song.tuningId)?.name }}</span></div>
            <div class="measure-grid" :class="{ 'no-measures': !song.measures.length }">
                <article v-for="(measure, index) in song.measures" :key="measure.id" class="measure"
                    :class="{ 'drag-over': dragTarget === measure.id, empty: !measure.chords.length, playing: currentMeasure === index && playbackState !== 'stopped' }"
                    @dragover.prevent="hoverDrop($event, measure)" @dragleave="dragTarget = null" @drop="dropChord($event, measure)">
                    <div class="measure-number">{{ String(index + 1).padStart(2, '0') }}<button title="删除小节" @click="removeMeasure(measure)">×</button></div>
                    <div class="chord-lane">
                        <button v-if="!measure.chords.length" class="empty-chord" @click="assignChord(measure, root, chordSuffix, firstOpenBeat(measure))">＋ 和弦</button>
                        <button v-for="slot in measure.chords" :key="slot.id" class="fingering-button" :style="{ left: `${slot.beat / beatCount * 100}%`, width: `${slotDuration(measure, slot) / beatCount * 100}%` }" title="编辑和弦按法" @click="editChord(measure, slot)">
                            <strong :style="noteColorStyle(slot.chord.root)">{{ slot.chord.name }}</strong><i>编辑</i>
                        </button>
                        <button v-if="measure.chords.length && measure.chords.length < beatCount" class="add-beat-chord" title="在空闲拍添加当前和弦" @click="assignChord(measure, root, chordSuffix, firstOpenBeat(measure))">＋</button>
                    </div>
                    <select v-model="measure.patternId" class="pattern-select" aria-label="节奏型" @change="choosePattern(measure)"><option v-for="pattern in availablePatterns" :key="pattern.id" :value="pattern.id">{{ pattern.name }}</option></select>
                    <div class="tab-staff" :style="{ '--steps': totalSteps }">
                        <div v-for="string in 6" :key="string" class="tab-row">
                            <span class="tab-string-name" :style="noteColorStyle(openString(measure, string))">{{ noteName(openString(measure, string)) }}</span><div class="tab-line"></div>
                            <div v-for="stepIndex in totalSteps" :key="stepIndex" class="tab-step" :class="{ current: currentMeasure === index && currentStep === stepIndex - 1 && playbackState !== 'stopped' }"><b v-if="tabMark(measure, stepIndex - 1, string)" :class="{ strum: stepAt(measure, stepIndex - 1)?.stroke }">{{ tabMark(measure, stepIndex - 1, string) }}</b></div>
                        </div>
                        <div class="stroke-row"><span>♪</span><i v-for="stepIndex in totalSteps" :key="stepIndex" :class="{ current: currentMeasure === index && currentStep === stepIndex - 1 && playbackState !== 'stopped' }">{{ strokeMark(measure, stepIndex - 1) }}</i></div>
                    </div>
                    <div class="lyric-grid" :style="{ gridTemplateColumns: `repeat(${beatCount}, minmax(0, 1fr))` }"><input v-for="beat in beatCount" :key="beat" v-model="measure.lyrics[beat - 1]" class="measure-lyric" :placeholder="`第${beat}拍歌词`" :aria-label="`第${index + 1}小节第${beat}拍歌词`"></div>
                    <input v-model="measure.note" class="measure-note" placeholder="备注" aria-label="小节备注">
                    <div v-if="dragTarget === measure.id" class="drop-preview" :style="{ left: `${dropBeat / beatCount * 100}%`, width: `${100 / beatCount}%` }"><span>第 {{ dropBeat + 1 }} 拍</span></div>
                </article>
                <button class="add-measure" :class="{ 'drag-over': dragTarget === 'new' }" @click="addMeasure" @dragover.prevent="dragTarget = 'new'" @dragleave="dragTarget = null" @drop="dropNewMeasure"><span>＋</span>{{ song.measures.length ? '添加小节 / 拖入和弦自动新增' : '没有小节，拖入和弦自动创建' }}</button>
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
.sheet-meta { display: flex; align-items: flex-start; gap: 18px; padding: 0 2px 17px; }
.sheet-meta strong { font-family: "Songti SC", Georgia, serif; color: #55574f; font-size: 16px; font-weight: 500; }
.sheet-meta > span { margin-left: auto; padding-top: 4px; white-space: nowrap; color: #9a998f; font-family: Georgia, serif; font-size: 10px; }
.measure-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 0; background: #fffefa; }
.measure { position: relative; min-width: 0; min-height: 190px; padding: 12px 9px 8px; border: 0; border-radius: 0; background: transparent; transition: background .18s; }
.measure::after { content: ""; position: absolute; top: 66px; bottom: 8px; right: 0; width: 1px; background: #a79d8e; pointer-events: none; }
.measure:nth-child(8n)::after, .measure:last-of-type::after { width: 3px; border-left: 1px solid #a79d8e; background: transparent; }
.measure:hover { box-shadow: inset 0 0 0 1px #ded4c3; }
.measure.playing { background: linear-gradient(180deg, #b98b5510, #b98b5505); }
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
.tab-staff { margin: 9px -9px 0; }
.tab-row { position: relative; display: grid; grid-template-columns: 15px repeat(var(--steps), minmax(0,1fr)); align-items: center; height: 15px; }
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
.empty-measure { width: 100%; min-height: 158px; border: 0; background: transparent; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #b5aea0; }
.empty-measure > span { display: grid; place-items: center; width: 31px; height: 31px; margin-bottom: 9px; color: #c0b5a3; font-size: 22px; font-weight: 200; }
.empty-measure strong { font-size: 10px; font-weight: 500; }
.empty-measure small { margin-top: 5px; font-size: 6px; letter-spacing: 1.2px; }
.add-measure { grid-column: 1 / -1; min-height: 38px; border: 0; border-bottom: 1px solid #d3cabb; border-radius: 0; background: transparent; color: #a39886; cursor: pointer; font-size: 9px; text-align: right; padding-right: 12px; }
.add-measure span { margin-right: 6px; font-size: 15px; }
.add-measure:hover { color: #8f633f; background: #f7f1e7; }
.measure:not(:nth-child(8n+1)) .tab-row, .measure:not(:nth-child(8n+1)) .stroke-row { grid-template-columns: 0 repeat(var(--steps), minmax(0,1fr)); }
.measure:not(:nth-child(8n+1)) .tab-string-name { visibility: hidden; width: 0; overflow: hidden; }
.measure:not(:nth-child(8n+1)) .tab-line { left: 0; }
.measure:not(:nth-child(8n+1)) .stroke-row > span { visibility: hidden; }
.sheet-paper.exporting .add-measure, .sheet-paper.exporting .measure-number button { display: none; }
.sheet-paper.exporting .measure.playing { background: transparent; box-shadow: none; }

.used-chords { display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0; }
.used-chords > small { padding-top: 5px; color: #b0a99b; font-size: 7px; white-space: nowrap; }
.used-chords > div { display: flex; flex-wrap: wrap; gap: 4px; }
.used-chords button { padding: 3px 8px; border: 1px solid #ded6c9; border-radius: 4px; background: #fffdf8; color: var(--note-color); font-family: Georgia,serif; font-size: 11px; cursor: grab; }
.used-chords button:active { cursor: grabbing; }
.fingering-button strong { color: var(--note-color); }
.tab-string-name { color: var(--note-color); }
.measure-lyric, .measure-note { display: block; width: 100%; padding: 2px 3px; border: 0; border-bottom: 1px solid transparent; outline: 0; background: transparent; color: #686256; font-size: 9px; }
.measure-lyric { margin-top: 5px; border-bottom-color: #e4ddd0; }
.measure-note { margin-top: 2px; color: #a39b8d; font-size: 8px; }
.measure-lyric:focus, .measure-note:focus { border-bottom-color: #b7926d; background: #faf6ed; }
.measure-lyric::placeholder, .measure-note::placeholder { color: #c2baab; }
.sheet-footer { display: flex; justify-content: space-between; margin-top: 18px; color: #b0aa9d; font-size: 6px; letter-spacing: 1.4px; }

.chord-lane { position: relative; height: 30px; margin: 4px 0 5px; }
.chord-lane .fingering-button { position: absolute; top: 0; height: 28px; margin: 0; padding: 0 4px; overflow: hidden; white-space: nowrap; }
.chord-lane .fingering-button strong { overflow: hidden; font-size: 16px; text-overflow: ellipsis; }
.chord-lane .fingering-button i { position: absolute; right: 3px; bottom: 0; font-size: 6px; }
.empty-chord { height: 27px; padding: 0; border: 0; background: transparent; color: #b4aa99; font-size: 9px; cursor: pointer; }
.add-beat-chord { position: absolute; right: 0; top: 1px; width: 20px; height: 24px; border: 0; background: transparent; color: #b4a893; cursor: pointer; opacity: 0; }
.chord-lane:hover .add-beat-chord { opacity: 1; }
.lyric-grid { display: grid; margin-top: 5px; }
.lyric-grid .measure-lyric { min-width: 0; margin: 0; padding: 3px 2px; border-right: 1px dotted #e1d8c9; font-size: 8px; }
.lyric-grid .measure-lyric:last-child { border-right: 0; }
.drop-preview { position: absolute; z-index: 6; top: 0; bottom: 0; border-left: 2px solid #a8764c; background: #b8895612; pointer-events: none; }
.drop-preview span { position: absolute; top: 34px; left: 3px; padding: 2px 4px; border-radius: 3px; background: #a8764c; color: white; font-size: 7px; white-space: nowrap; }
.add-measure.drag-over { background: #f1e5d4; color: #93633d; box-shadow: inset 0 0 0 1px #b38b60; }
.no-measures .add-measure { min-height: 160px; border: 1px dashed #cbbca7; text-align: center; }
.measure.empty .tab-staff { opacity: .58; }
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
