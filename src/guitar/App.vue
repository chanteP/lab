<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { GuitarSynth } from './audio/GuitarSynth';
import AudioVisualizer from './audio/AudioVisualizer.vue';
import Arrangement from './arrangement/Arrangement.vue';
import ChordEditor from './arrangement/ChordEditor.vue';
import type { ArrangedChord } from './arrangement/types';
import {
    CHORDS, MAX_FRET, NOTE_NAMES, TUNINGS,
    findVoicing, noteName, pitchClass, scalePitchClasses, voicingLabel,
    type ChordDefinition, type ChordIdentity, type Voicing,
} from './theory/chords';
import { noteColorStyle } from './theory/noteColors';

const synth = new GuitarSynth();
const keys = [0, 2, 4, 5, 7, 9, 11];
const tonic = ref(0);
const tuningId = ref('standard');
const showScale = ref(true);
const selectedRoot = ref(0);
const activeChord = ref<ChordDefinition | null>(null);
const manualVoicing = ref<Voicing | null>(null);
const manualChordName = ref('');
const manualChordTones = ref<Set<number> | null>(null);
const editingChord = ref<ArrangedChord | null>(null);
const volume = ref(0.8);
const playing = ref<number | null>(null);
let playingTimer = 0;

const tuning = computed(() => TUNINGS.find(item => item.id === tuningId.value) ?? TUNINGS[0]);
const displayStrings = computed(() => tuning.value.strings.map((midi, stringIndex) => ({
    midi, stringIndex, number: 6 - stringIndex,
})).reverse());
const scaleNotes = computed(() => scalePitchClasses(tonic.value));
const chordTones = computed(() => manualChordTones.value ?? (activeChord.value
    ? new Set(activeChord.value.intervals.map(interval => (selectedRoot.value + interval) % 12))
    : null));
const selectedChordName = computed(() => manualChordName.value || `${NOTE_NAMES[selectedRoot.value]}${activeChord.value?.suffix ?? ''}`);
const chordShape = computed(() => activeChord.value
    ? voicingLabel((manualVoicing.value ?? findVoicing(selectedRoot.value, activeChord.value, tuning.value.strings)).frets)
    : '');
const intervalNames: Record<number, string> = { 0: '1', 3: '♭3', 4: '3', 5: '4', 7: '5', 10: '♭7', 11: '7', 14: '9' };
const chordFormula = computed(() => activeChord.value?.intervals.map(interval => intervalNames[interval]).join(' · ') ?? '');
const chordNotePitchClasses = computed(() => activeChord.value?.intervals.map(interval => (selectedRoot.value + interval) % 12) ?? []);
const frets = Array.from({ length: MAX_FRET + 1 }, (_, i) => i);
const markers = [3, 5, 7, 9, 15, 17, 19];

const currentVoicing = computed(() => manualVoicing.value ?? (activeChord.value
    ? findVoicing(selectedRoot.value, activeChord.value, tuning.value.strings) : null));
function clearManualChord() {
    manualVoicing.value = null;
    manualChordName.value = '';
    manualChordTones.value = null;
}
function openChordFinder() {
    if (!activeChord.value || !currentVoicing.value) return;
    editingChord.value = {
        root: selectedRoot.value, suffix: activeChord.value.suffix, name: selectedChordName.value,
        frets: [...currentVoicing.value.frets], midi: [...currentVoicing.value.midi], strings: [...tuning.value.strings],
    };
}
async function saveChordFinder(frets: Array<number | null>, midi: number[], identity: ChordIdentity) {
    const baseSuffix = identity.suffix.split('/')[0];
    selectedRoot.value = identity.root;
    activeChord.value = CHORDS.find(chord => chord.suffix === baseSuffix) ?? activeChord.value;
    manualVoicing.value = { frets, midi };
    manualChordName.value = identity.name;
    manualChordTones.value = identity.tones;
    editingChord.value = null;
    await synth.strum(manualVoicing.value, tuning.value.strings);
}
function replayActiveChord() {
    if (manualVoicing.value) void synth.strum(manualVoicing.value, tuning.value.strings);
    else if (activeChord.value) void playChord(activeChord.value);
}

function isVisible(midi: number) {
    // 和弦播放期间临时展示完整指板，组成音高亮，其余音名半透明。
    if (chordTones.value) return true;
    return showScale.value && scaleNotes.value.has(pitchClass(midi));
}
function isDimmed(midi: number) {
    return !!chordTones.value && !chordTones.value.has(pitchClass(midi));
}
function flash(midi: number) {
    window.clearTimeout(playingTimer);
    playing.value = midi;
    playingTimer = window.setTimeout(() => playing.value = null, 180);
}
async function playNote(midi: number, stringIndex: number) {
    selectedRoot.value = pitchClass(midi);
    activeChord.value = null;
    clearManualChord();
    flash(midi);
    await synth.pluck(midi, { stringIndex });
}
async function playChord(chord: ChordDefinition) {
    clearManualChord();
    activeChord.value = chord;
    const voicing = findVoicing(selectedRoot.value, chord, tuning.value.strings);
    await synth.strum(voicing, tuning.value.strings);
}
function selectKey(key: number) {
    tonic.value = key;
    selectedRoot.value = key;
    activeChord.value = null;
    clearManualChord();
}
function changeVolume() {
    synth.setVolume(volume.value);
}
function dragChord(event: DragEvent, chord: ChordDefinition) {
    event.dataTransfer!.effectAllowed = 'copy';
    const payload = manualVoicing.value && chord.suffix === activeChord.value?.suffix
        ? { chord: { root: selectedRoot.value, suffix: chord.suffix, name: selectedChordName.value, frets: [...manualVoicing.value.frets], midi: [...manualVoicing.value.midi], strings: [...tuning.value.strings] } }
        : { root: selectedRoot.value, suffix: chord.suffix };
    event.dataTransfer!.setData('application/x-guitar-chord', JSON.stringify(payload));
}
const whiteKeys: Record<string, number> = { a: 55, s: 57, d: 59, f: 60, g: 62, h: 64, j: 65, k: 67, l: 69, ';': 71, "'": 72 };
const blackKeys: Record<string, number> = { w: 56, e: 58, t: 61, y: 63, o: 66, p: 68, '[': 70, ']': 73 };
function handleKeyboard(event: KeyboardEvent) {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, [contenteditable="true"]') || document.querySelector('.chord-editor')) return;
    if (/^[1-7]$/.test(event.key)) {
        event.preventDefault();
        const degree = Number(event.key) - 1;
        const root = (tonic.value + [0, 2, 4, 5, 7, 9, 11][degree]) % 12;
        const suffix = ['', 'm', 'm', '', '', 'm', 'dim'][degree];
        selectedRoot.value = root;
        const chord = CHORDS.find(item => item.suffix === suffix) ?? { suffix: 'dim', name: '减三和弦', intervals: [0, 3, 6] };
        void playChord(chord);
        return;
    }
    const key = event.key.toLowerCase();
    const midi = whiteKeys[key] ?? blackKeys[key];
    if (midi === undefined) return;
    event.preventDefault();
    flash(midi);
    void synth.pluck(midi, { stringIndex: midi % 6, velocity: 0.78 });
}
onMounted(() => window.addEventListener('keydown', handleKeyboard));
onBeforeUnmount(() => {
    synth.stopAll();
    window.clearTimeout(playingTimer);
    window.removeEventListener('keydown', handleKeyboard);
});
</script>

<template>
    <main class="studio">
        <AudioVisualizer :synth="synth" />
        <header class="hero">
            <div>
                <p class="eyebrow"><span></span> ACOUSTIC LAB · 01</p>
                <h1>钢弦之上<span>，</span><em>自由发声。</em></h1>
                <p class="subtitle">一块可以弹奏的指板。找到音，听见和弦。</p>
            </div>
            <div class="standard-tuning" :aria-label="tuning.name">
                <span>{{ tuning.name.toUpperCase() }} · 6 → 1</span>
                <strong><i v-for="(open, index) in tuning.strings" :key="index" :style="noteColorStyle(open)">{{ noteName(open) }}<span v-if="index < tuning.strings.length - 1"> · </span></i></strong>
            </div>
        </header>

        <section class="control-bar" aria-label="音阶控制">
            <button class="scale-toggle" :class="{ on: showScale }" :aria-pressed="showScale" @click="showScale = !showScale">
                <span class="toggle-track"><i></i></span>
                <span>显示音阶<small>SHOW NOTES</small></span>
            </button>
            <div class="control-divider"></div>
            <div class="key-control">
                <span class="control-label">调式 <small>KEY</small></span>
                <div class="key-buttons">
                    <button v-for="key in keys" :key="key" :style="noteColorStyle(key)" :class="{ selected: tonic === key }" @click="selectKey(key)">
                        {{ NOTE_NAMES[key] }}
                    </button>
                </div>
            </div>
            <div class="key-description" :style="noteColorStyle(tonic)"><i></i>{{ NOTE_NAMES[tonic] }} Major<span>自然大调</span></div>
            <label class="volume-control">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 4a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/></svg>
                <input v-model.number="volume" type="range" min="0" max="1" step="0.05" aria-label="音量" @input="changeVolume">
            </label>
        </section>
        <section class="tuning-bar" aria-label="调弦设置">
            <span class="tuning-label">调弦 <small>TUNING</small></span>
            <div class="tuning-options">
                <button v-for="item in TUNINGS" :key="item.id" :class="{ selected: tuningId === item.id }" @click="tuningId = item.id">
                    {{ item.name }}<small>{{ item.description }}</small>
                </button>
            </div>
            <span class="tuning-note">切换后，音名与和弦指法会自动适配</span>
        </section>

        <section class="instrument-panel">
            <div class="panel-heading">
                <div><span class="live-dot"></span>民谣吉他 <small>ACOUSTIC GUITAR</small></div>
                <p>点击任意品位发声 <span>·</span> 20 FRETS</p>
            </div>
            <div class="fret-scroll">
                <div class="fretboard-wrap">
                    <div class="fret-numbers" aria-hidden="true">
                        <span class="string-spacer"></span>
                        <span v-for="fret in frets" :key="fret" :class="{ marked: markers.includes(fret) || fret === 12 }">{{ fret || '' }}</span>
                    </div>
                    <div class="neck">
                        <div class="string-labels" aria-hidden="true">
                            <span v-for="string in displayStrings" :key="string.stringIndex"><b :style="noteColorStyle(string.midi)">{{ noteName(string.midi) }}</b><small>{{ string.number }}</small></span>
                        </div>
                        <div class="fret-grid">
                            <template v-for="(string, rowIndex) in displayStrings" :key="string.stringIndex">
                                <div v-for="fret in frets" :key="fret" class="fret-cell" :class="[`string-${rowIndex}`, { open: fret === 0 }]">
                                    <i v-if="fret === 1" class="fret-marker" :class="{
                                        'double-top': fret === 12,
                                        'double-bottom': fret === 12,
                                    }"></i>
                                    <button
                                        class="note-hit"
                                        :class="{ 'is-playing': playing === string.midi + fret }"
                                        :aria-label="`${string.number}弦 ${fret}品 ${noteName(string.midi + fret)}`"
                                        @click="playNote(string.midi + fret, string.stringIndex)"
                                    >
                                        <span v-if="isVisible(string.midi + fret)" :style="noteColorStyle(string.midi + fret)" class="note" :class="{
                                            tonic: pitchClass(string.midi + fret) === tonic,
                                            dimmed: isDimmed(string.midi + fret),
                                            'chord-tone': chordTones?.has(pitchClass(string.midi + fret)),
                                        }">{{ noteName(string.midi + fret) }}</span>
                                    </button>
                                    <span class="guitar-string" :class="`gauge-${rowIndex}`"></span>
                                </div>
                            </template>
                        </div>
                        <div class="position-marks" aria-hidden="true">
                            <i v-for="fret in markers" :key="fret" :style="{ left: `${((fret - 0.5) / 20) * 100}%` }"></i>
                            <i class="double double-one" :style="{ left: `${((12 - 0.5) / 20) * 100}%` }"></i>
                            <i class="double double-two" :style="{ left: `${((12 - 0.5) / 20) * 100}%` }"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="panel-footer">
                <p><span class="mouse-icon">↖</span> 点击音符选择根音，探索和声色彩</p>
                <div class="legend"><span><i class="legend-tonic"></i>主音</span><span><i></i>调内音</span></div>
            </div>
        </section>

        <transition name="chord-rise">
            <section v-if="!activeChord && selectedRoot !== null" class="chord-panel" aria-label="和弦选择">
                <div class="chord-root">
                    <span>以</span><strong :style="noteColorStyle(selectedRoot)">{{ NOTE_NAMES[selectedRoot] }}</strong><span>为根音</span>
                    <small>CHOOSE A CHORD</small>
                </div>
                <div class="chord-list">
                    <button v-for="chord in CHORDS" :key="chord.suffix" :style="noteColorStyle(selectedRoot)" draggable="true" @dragstart="dragChord($event, chord)" @click="playChord(chord)">
                        <span>{{ NOTE_NAMES[selectedRoot] }}<sup>{{ chord.suffix }}</sup></span>
                        <small>{{ chord.name }}</small>
                    </button>
                </div>
                <div class="chord-tip"><span>♪</span> 点击和弦<br><small>试听并查看组成音</small></div>
            </section>
        </transition>

        <transition name="chord-rise">
            <section v-if="activeChord" class="chord-panel active-chord" aria-label="当前和弦">
                <div class="now-playing"><span>NOW PLAYING</span><i></i><i></i><i></i><i></i></div>
                <div class="current-chord"><strong :style="noteColorStyle(selectedRoot)">{{ selectedChordName }}</strong><span>{{ activeChord.name }}</span></div>
                <div class="harmony">
                    <div><small>音程构成</small><strong>{{ chordFormula }}</strong></div>
                    <div><small>组成音</small><span class="chord-note-list"><i v-for="note in chordNotePitchClasses" :key="note" :style="noteColorStyle(note)">{{ NOTE_NAMES[note] }}</i></span></div>
                </div>
                <button class="shape" title="点击编辑按法并识别和弦" @click="openChordFinder"><small>指法 · 点击编辑识别</small><span>{{ chordShape }}</span></button>
                <div class="chord-list compact">
                    <button v-for="chord in CHORDS" :key="chord.suffix" :style="noteColorStyle(selectedRoot)" :class="{ current: chord.suffix === activeChord.suffix }" draggable="true" @dragstart="dragChord($event, chord)" @click="playChord(chord)">
                        {{ NOTE_NAMES[selectedRoot] }}<sup>{{ chord.suffix }}</sup>
                    </button>
                </div>
                <button class="replay" title="再次播放" aria-label="再次播放当前和弦" @click="replayActiveChord">↻</button>
            </section>
        </transition>

        <div class="keyboard-guide"><span><b>1–7</b> 调内和弦</span><span><b>A–'</b> 白键 · F = C4</span><span><b>Q–]</b> 黑键</span><small>编辑按法或输入文字时自动停用</small></div>

        <Arrangement :synth="synth" :tuning-id="tuningId" :root="selectedRoot" :chord-suffix="activeChord?.suffix ?? ''" />

        <ChordEditor v-if="editingChord" :chord="editingChord" @close="editingChord = null" @save="saveChordFinder" />

        <footer>
            <span>EXTENDED KARPLUS–STRONG SYNTHESIS</span>
            <p>物理建模钢弦音色 · 建议佩戴耳机</p>
            <span class="footer-mark">♬</span>
        </footer>
    </main>
</template>

<style>
:root {
    font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #282b28;
    background: #f4f2ec;
    font-synthesis: none;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 360px; background: radial-gradient(circle at 80% 0, #fffdf6 0, transparent 35%), #f4f2ec; }
button, input { font: inherit; }
button { -webkit-tap-highlight-color: transparent; }
.studio { position: relative; z-index: 1; width: min(1480px, calc(100% - 72px)); margin: 0 auto; padding: 46px 0 26px; }
.hero { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 30px; }
.eyebrow { display: flex; align-items: center; gap: 9px; margin: 0 0 12px; color: #9b6941; font-size: 10px; letter-spacing: 2.6px; font-weight: 700; }
.eyebrow span { width: 22px; height: 1px; background: #b27a4c; }
h1 { margin: 0; font-family: "Songti SC", "Noto Serif SC", Georgia, serif; font-weight: 600; font-size: clamp(32px, 3.2vw, 48px); letter-spacing: 1px; line-height: 1.3; }
h1 > span { color: #b07a4e; }
h1 em { color: #77796e; font-style: normal; }
.subtitle { margin: 12px 0 0; color: #8b8c83; font-size: 13px; letter-spacing: 1px; }
.standard-tuning { text-align: right; padding-bottom: 5px; }
.standard-tuning span { display: block; font-size: 9px; letter-spacing: 1.8px; color: #9a9b92; margin-bottom: 8px; }
.standard-tuning strong i { color: var(--note-color); font-style: normal; }
.standard-tuning strong i span { color: #aaa79d; }
.standard-tuning strong { font-family: Georgia, serif; color: #686c63; font-size: 15px; letter-spacing: 3px; font-weight: 400; }
.control-bar { display: flex; align-items: center; min-height: 86px; padding: 16px 24px; background: rgba(255,255,255,.8); border: 1px solid #e4e2da; border-radius: 12px; box-shadow: 0 5px 22px #393a2d05; gap: 25px; }
.scale-toggle { display: flex; align-items: center; gap: 12px; border: 0; background: none; padding: 0; color: #43473f; cursor: pointer; white-space: nowrap; font-size: 13px; font-weight: 600; text-align: left; }
.scale-toggle small, .control-label small { display: block; color: #a0a198; font-size: 8px; font-weight: 500; letter-spacing: 1.4px; margin-top: 5px; }
.toggle-track { width: 36px; height: 21px; border-radius: 20px; background: #c7c9c2; padding: 3px; transition: .2s; }
.toggle-track i { display: block; width: 15px; height: 15px; border-radius: 50%; background: white; box-shadow: 0 1px 3px #0002; transition: .2s; }
.scale-toggle.on .toggle-track { background: #a47146; }
.scale-toggle.on .toggle-track i { transform: translateX(15px); }
.control-divider { height: 36px; width: 1px; background: #e7e5dd; }
.key-control { display: flex; align-items: center; gap: 20px; }
.control-label { color: #565a51; font-size: 12px; font-weight: 600; }
.key-buttons { display: flex; gap: 5px; }
.key-buttons button { width: 38px; height: 38px; border: 1px solid transparent; background: transparent; border-radius: 7px; cursor: pointer; color: #62665c; font-family: Georgia, serif; font-size: 15px; transition: .18s; }
.key-buttons button:hover { background: #f2eee6; }
.key-buttons button { color: var(--note-color); }
.key-buttons button.selected { color: white; background: var(--note-color); box-shadow: 0 3px 9px #8c603633; }
.key-description { display: flex; align-items: center; gap: 6px; color: var(--note-color); font-family: Georgia, serif; font-size: 12px; white-space: nowrap; }
.key-description i { width: 5px; height: 5px; border-radius: 50%; background: var(--note-color); }
.key-description span { color: #a2a299; font-family: sans-serif; font-size: 10px; margin-left: 2px; }
.volume-control { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.volume-control svg { width: 17px; height: 17px; stroke: #96988f; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.volume-control input { appearance: none; width: 65px; height: 3px; background: #d8d6cd; border-radius: 4px; accent-color: #a47146; }
.volume-control input::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; background: #a47146; border-radius: 50%; }

.tuning-bar { display: flex; align-items: center; gap: 18px; margin-top: 12px; padding: 11px 18px; border: 1px solid #e4e2da; border-radius: 10px; background: rgba(255,255,255,.55); }
.tuning-label { color: #565a51; font-size: 11px; font-weight: 600; white-space: nowrap; }
.tuning-label small { display: block; margin-top: 4px; color: #a0a198; font-size: 7px; letter-spacing: 1.3px; font-weight: 500; }
.tuning-options { display: flex; gap: 6px; }
.tuning-options button { display: flex; align-items: baseline; gap: 8px; padding: 8px 12px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #66695f; cursor: pointer; font-size: 11px; transition: .18s; }
.tuning-options button small { color: #a3a298; font-family: Georgia, serif; font-size: 8px; letter-spacing: .5px; }
.tuning-options button:hover { background: #f2eee6; }
.tuning-options button.selected { border-color: #d5c1a8; background: #f1e9dd; color: #8e603b; }
.tuning-options button.selected small { color: #a47c55; }
.tuning-note { margin-left: auto; color: #aaa99f; font-size: 9px; white-space: nowrap; }
.instrument-panel { margin-top: 14px; border-radius: 13px; background: #fff; border: 1px solid #deddd5; overflow: hidden; box-shadow: 0 12px 34px #3d342a0a; }
.panel-heading { height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid #e6e3db; background: #faf9f6; }
.panel-heading > div { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #4c5048; }
.panel-heading small { font-size: 8px; letter-spacing: 1.5px; color: #a09f96; font-weight: 500; margin-left: 4px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #a9784c; box-shadow: 0 0 0 3px #a9784c13; }
.panel-heading p { color: #999a91; font-size: 10px; }
.panel-heading p span { padding: 0 8px; color: #b5b4aa; }
.fret-scroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #b4977c #e9e4db; }
.fretboard-wrap { min-width: 1100px; padding: 15px 22px 17px 12px; background: #f7f4ed; }
.fret-numbers { display: grid; grid-template-columns: 52px 42px repeat(20, minmax(0, 1fr)); height: 20px; padding-left: 4px; color: #aaa79e; font-size: 8px; text-align: center; }
.fret-numbers span { display: flex; align-items: center; justify-content: center; }
.fret-numbers .marked { color: #6e6a5f; font-weight: 700; }
.neck { display: flex; position: relative; filter: drop-shadow(0 7px 6px #2c1a1030); }
.string-labels { width: 52px; flex: 0 0 52px; display: grid; grid-template-rows: repeat(6, 43px); background: #35382f; border-radius: 5px 0 0 5px; position: relative; z-index: 4; }
.string-labels span { display: flex; align-items: center; justify-content: center; position: relative; }
.string-labels b { color: var(--note-color); font-family: Georgia, serif; font-weight: 400; font-size: 12px; }
.string-labels small { position: absolute; left: 7px; color: #797e71; font-size: 7px; }
.fret-grid { display: grid; grid-template-columns: 42px repeat(20, minmax(0, 1fr)); grid-template-rows: repeat(6, 43px); flex: 1; border-radius: 0 4px 4px 0; background:
    linear-gradient(90deg, #3724190c, transparent 10%, #e9ba7910 53%, transparent 88%),
    repeating-linear-gradient(2deg, transparent 0, #3a1e1014 1px, transparent 2px, transparent 6px, #e9b67808 7px, transparent 9px),
    repeating-linear-gradient(91deg, #6e412b 0, #815136 5px, #75452f 12px, #86583b 18px, #75462f 24px);
    border-top: 2px solid #4d3021;
    border-bottom: 3px solid #42291d;
}
.fret-cell { position: relative; border-right: 2px solid #b5b0a0; box-shadow: 1px 0 1px #1b100b88, inset -1px 0 #e5d6b966; min-width: 0; }
.fret-cell.open { border-right: 4px solid #e0d9c2; background: #241a1226; box-shadow: 2px 0 2px #24160c77; }
.note-hit { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: pointer; z-index: 3; display: flex; align-items: center; justify-content: center; }
.note { position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; width: 27px; height: 27px; background: #f2eee1; color: #625d50; border: 1px solid #fff9; border-radius: 50%; box-shadow: 0 1px 4px #21160c50; font-family: Georgia, serif; font-size: 11px; font-weight: 600; transition: opacity .25s, transform .15s, background .25s; }
.note:hover { transform: scale(1.16); background: white; }
.note { color: var(--note-color); }
.note.tonic { background: var(--note-color); color: #fff9ed; border-color: #c89c6c; }
.note.dimmed { opacity: .24; }
.note.chord-tone { opacity: 1; background: #f7e8c9; color: var(--note-color); box-shadow: 0 0 0 2px #d5ae7880, 0 2px 4px #21160c60; }
.note.tonic.chord-tone { background: var(--note-color); color: white; }
.is-playing .note { transform: scale(.88); filter: brightness(1.12); }
.guitar-string { position: absolute; z-index: 1; left: 0; right: -2px; top: 50%; transform: translateY(-50%); pointer-events: none; background: linear-gradient(to bottom, #5d574c 0%, #e8e2cf 25%, #a7a08d 48%, #f4ead1 62%, #5c5347 100%); box-shadow: 0 1px 1px #1b100a99; }
.gauge-0 { height: 1px; }
.gauge-1 { height: 1.5px; }
.gauge-2 { height: 2px; }
.gauge-3 { height: 3px; background: repeating-linear-gradient(90deg, #8d816b 0, #ddd2b7 1px, #9e927a 2px); }
.gauge-4 { height: 3.5px; background: repeating-linear-gradient(90deg, #81745f 0, #d2c6a8 1px, #978970 2px, #ded2b3 3px); }
.gauge-5 { height: 4px; background: repeating-linear-gradient(90deg, #7e725d 0, #d0c4a5 1px, #8f826a 2px, #d5c9aa 3px); }
.position-marks { position: absolute; pointer-events: none; left: 94px; right: 0; top: 0; bottom: 0; z-index: 2; }
.position-marks > i { position: absolute; top: 46%; transform: translate(-50%, -50%); width: 11px; height: 11px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #f0e8d2, #c9bda2 70%, #8c8068); box-shadow: inset 0 1px 2px #fff8, 0 1px 2px #2a1b1099; opacity: .8; }
.position-marks > i.double-one { top: 25%; }
.position-marks > i.double-two { top: 67%; }
.panel-
.chord-note-list { display: flex; gap: 7px; }
.chord-note-list i { color: var(--note-color); font-style: normal; font-weight: 700; }
.keyboard-guide { display: flex; align-items: center; gap: 18px; margin: 13px 3px 0; color: #99978e; font-size: 8px; }
.keyboard-guide b { margin-right: 4px; color: #8e6e50; font-family: monospace; font-size: 9px; }
.keyboard-guide small { margin-left: auto; color: #b0ada4; font-size: 7px; }
@media(max-width:760px){.keyboard-guide{flex-wrap:wrap;gap:8px 14px}.keyboard-guide small{display:none}}
footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 23px; background: #faf9f6; border-top: 1px solid #e4e0d8; color: #9b9a91; font-size: 10px; }
.panel-footer p { margin: 0; }
.mouse-icon { color: #a47b55; padding-right: 6px; }
.legend { display: flex; gap: 16px; }
.legend span { display: flex; align-items: center; gap: 5px; }
.legend i { width: 8px; height: 8px; border-radius: 50%; background: #eee9da; border: 1px solid #d3cdbd; }
.legend i.legend-tonic { background: #a16e43; border-color: #a16e43; }
.chord-panel { min-height: 98px; display: flex; align-items: center; gap: 25px; margin-top: 18px; padding: 15px 22px; background: #fff; border: 1px solid #e1dfd6; border-radius: 12px; box-shadow: 0 5px 20px #393a2d05; }
.chord-root { display: grid; grid-template-columns: auto auto auto; align-items: baseline; column-gap: 5px; min-width: 135px; color: #85877e; font-size: 11px; }
.chord-root strong { color: var(--note-color); font-family: Georgia, serif; font-size: 29px; font-weight: 400; }
.chord-root small { grid-column: 1 / -1; color: #aaa99f; font-size: 7px; letter-spacing: 1.3px; margin-top: 3px; }
.chord-list { display: grid; grid-template-columns: repeat(8, minmax(68px, 1fr)); gap: 8px; flex: 1; }
.chord-list button { min-height: 56px; padding: 7px 9px; border: 1px solid #e1ded4; border-radius: 7px; background: #faf9f6; color: #4c5048; cursor: pointer; transition: .18s; }
.chord-list button:hover, .chord-list button.current { border-color: #b28a62; background: #f3ebdf; transform: translateY(-1px); }
.chord-list button > span { color: var(--note-color); font-family: Georgia, serif; font-size: 17px; }
.chord-list sup { font-size: .57em; margin-left: 1px; }
.chord-list button small { display: block; font-size: 8px; color: #a2a198; margin-top: 4px; }
.chord-tip { border-left: 1px solid #e5e2d9; padding-left: 19px; color: #919289; font-size: 10px; line-height: 1.7; white-space: nowrap; }
.chord-tip > span { color: #ac8059; margin-right: 5px; }
.chord-tip small { font-size: 8px; color: #b0afa6; }
.active-chord { gap: 16px 20px; flex-wrap: wrap; background: #fdfbf6; border-color: #d7c4ab; }
.now-playing { display: flex; align-items: flex-end; gap: 2px; height: 28px; color: #a47b53; }
.now-playing span { font-size: 7px; letter-spacing: 1px; align-self: center; margin-right: 5px; writing-mode: vertical-rl; }
.now-playing i { width: 2px; height: 12px; background: #b18a62; animation: equalize .6s ease-in-out infinite alternate; }
.now-playing i:nth-child(3) { animation-delay: -.2s; height: 20px; }
.now-playing i:nth-child(4) { animation-delay: -.4s; height: 16px; }
.now-playing i:nth-child(5) { animation-delay: -.1s; height: 8px; }
.current-chord { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; }
.current-chord strong { color: var(--note-color); font-family: Georgia, serif; font-size: 32px; font-weight: 400; }
.current-chord span { font-size: 10px; color: #96958b; }

.harmony { display: flex; align-items: center; gap: 22px; padding-left: 18px; border-left: 1px solid #e3ded4; }
.harmony > div { white-space: nowrap; }
.harmony small { display: block; margin-bottom: 6px; color: #a7a499; font-size: 8px; }
.harmony strong, .harmony span { color: #8e603b; font-family: Georgia, serif; font-size: 13px; font-weight: 400; letter-spacing: 1px; }
.harmony span { color: #55594f; font-size: 15px; }
.shape { padding: 5px 0 5px 18px; border: 0; border-left: 1px solid #e3ded4; background: transparent; white-space: nowrap; text-align: left; cursor: pointer; }
.shape:hover span { color: #9b6c43; }
.shape small { display: block; font-size: 8px; color: #a7a499; margin-bottom: 7px; }
.shape span { font-family: monospace; color: #69695f; font-size: 11px; letter-spacing: 1px; }
.active-chord .chord-list.compact { order: 20; flex-basis: 100%; }
.chord-list.compact button { color: var(--note-color); min-height: 38px; font-family: Georgia, serif; font-size: 14px; }
.replay { flex: 0 0 35px; height: 35px; border: 1px solid #d8c6b0; border-radius: 50%; background: transparent; color: #9e7149; font-size: 20px; cursor: pointer; }

.chord-note-list { display: flex; gap: 7px; }
.chord-note-list i { color: var(--note-color); font-style: normal; font-weight: 700; }
.keyboard-guide { display: flex; align-items: center; gap: 18px; margin: 13px 3px 0; color: #99978e; font-size: 8px; }
.keyboard-guide b { margin-right: 4px; color: #8e6e50; font-family: monospace; font-size: 9px; }
.keyboard-guide small { margin-left: auto; color: #b0ada4; font-size: 7px; }
@media(max-width:760px){.keyboard-guide{flex-wrap:wrap;gap:8px 14px}.keyboard-guide small{display:none}}
footer { display: flex; align-items: center; gap: 18px; padding: 24px 3px 0; color: #a7a69d; font-size: 9px; }
footer > span:first-child { letter-spacing: 1.1px; font-size: 7px; }
footer p { margin: 0; }
.footer-mark { margin-left: auto; color: #a58b6e; font-size: 17px; }
.chord-rise-enter-active, .chord-rise-leave-active { transition: .2s ease; }
.chord-rise-enter-from, .chord-rise-leave-to { opacity: 0; transform: translateY(6px); }
@keyframes equalize { to { height: 5px; opacity: .5; } }
@media (max-width: 1100px) {
    .studio { position: relative; z-index: 1; width: calc(100% - 40px); padding-top: 30px; }
    .key-description { display: none; }
    .control-bar { gap: 18px; }
    .chord-tip { display: none; }
    .shape { display: none; }
    .tuning-note { display: none; }
    .tuning-options button small { display: none; }
}
@media (max-width: 760px) {
    .studio { position: relative; z-index: 1; width: calc(100% - 24px); padding-top: 24px; }
    .hero { align-items: flex-start; }
    .standard-tuning { display: none; }
    h1 { font-size: 30px; }
    .control-bar { flex-wrap: wrap; padding: 15px; gap: 14px; }
    .control-divider { display: none; }
    .key-control { order: 3; width: 100%; justify-content: space-between; gap: 10px; }
    .key-buttons { flex: 1; justify-content: space-between; }
    .volume-control { margin-left: auto; }
    .panel-heading small, .panel-heading p { display: none; }
    .tuning-bar { align-items: flex-start; gap: 12px; padding: 12px; overflow-x: auto; }
    .tuning-options { flex: 1; justify-content: space-between; }
    .tuning-options button { padding: 7px 9px; white-space: nowrap; }
    .harmony { order: 5; flex-basis: 100%; border-left: 0; border-top: 1px solid #e8e2d8; padding: 12px 0 0; justify-content: flex-start; gap: 35px; }
    .active-chord .chord-list.compact { order: 20; }
    .chord-panel { align-items: flex-start; flex-wrap: wrap; gap: 12px; padding: 15px; }
    .chord-root { min-width: 115px; }
    .chord-list { order: 3; flex-basis: 100%; grid-template-columns: repeat(4, 1fr); }
    .active-chord .chord-list { grid-template-columns: repeat(8, 1fr); overflow-x: auto; }
    .active-chord .chord-list button { min-width: 50px; }
    .replay { margin-left: auto; }
    footer > span:first-child { display: none; }
}
</style>
