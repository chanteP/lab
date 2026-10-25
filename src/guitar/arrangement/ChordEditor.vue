<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ArrangedChord } from './types';
import { identifyChord, noteName, type ChordIdentity } from '../theory/chords';
import { noteColorStyle } from '../theory/noteColors';

const props = defineProps<{ chord: ArrangedChord }>();
const emit = defineEmits<{
    close: [];
    save: [frets: Array<number | null>, midi: number[], identity: ChordIdentity];
}>();
const draft = ref<Array<number | null>>([...props.chord.frets]);
const baseFret = computed(() => {
    const used = props.chord.frets.filter((fret): fret is number => fret !== null && fret > 0);
    if (!used.length || Math.max(...used) <= 4) return 1;
    return Math.max(1, Math.max(...used) - 3);
});
const stringNumbers = [6, 5, 4, 3, 2, 1];
const identity = computed(() => identifyChord(draft.value, props.chord.strings));
const fretNote = (string: number, fret: number) => props.chord.strings[string] + fret;

function cycleOpen(string: number) {
    draft.value[string] = draft.value[string] === null ? 0 : null;
}
function setFret(string: number, fret: number) {
    draft.value[string] = draft.value[string] === fret ? 0 : fret;
}
function save() {
    const midi = draft.value.map((fret, string) => fret === null ? null : props.chord.strings[string] + fret)
        .filter((note): note is number => note !== null);
    emit('save', [...draft.value], midi, identity.value);
}
function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', keydown));
onBeforeUnmount(() => window.removeEventListener('keydown', keydown));
</script>

<template>
    <Teleport to="body">
        <div class="editor-overlay" @click.self="emit('close')">
            <section class="chord-editor" role="dialog" aria-modal="true" :aria-label="`${chord.name} 按法编辑`">
                <header>
                    <div><small>CHORD VOICING</small><h3 :style="noteColorStyle(identity.root)">{{ identity.name }} <span>按法编辑</span></h3></div>
                    <button class="editor-close" aria-label="关闭" @click="emit('close')">×</button>
                </header>
                <p class="editor-help">点击品位设置按法；点击弦顶切换空弦 ○ / 不按 ×。再次点击已选品位可设为空弦。</p>
                <div class="editor-diagram" :style="{ '--base-fret': baseFret }">
                    <div class="editor-corner">{{ baseFret }}<small>FR</small></div>
                    <div v-for="(number, string) in stringNumbers" :key="number" class="editor-string-head">
                        <small>{{ number }}弦 · <em :style="noteColorStyle(chord.strings[string])">{{ noteName(chord.strings[string]) }}</em></small>
                        <button :class="{ muted: draft[string] === null }" @click="cycleOpen(string)">
                            {{ draft[string] === null ? '×' : '○' }}
                        </button>
                    </div>
                    <template v-for="row in 4" :key="row">
                        <div class="editor-fret-number">{{ baseFret + row - 1 }}</div>
                        <button
                            v-for="(number, string) in stringNumbers"
                            :key="number"
                            class="editor-fret"
                            :class="{ selected: draft[string] === baseFret + row - 1 }"
                            :aria-label="`${number}弦 ${baseFret + row - 1}品`"
                            @click="setFret(string, baseFret + row - 1)"
                        >
                            <i></i><span v-if="draft[string] === baseFret + row - 1" :style="noteColorStyle(fretNote(string, baseFret + row - 1))">{{ noteName(fretNote(string, baseFret + row - 1)) }}</span>
                            <small v-else class="editor-note" :class="{ 'chord-tone': identity.tones.has(fretNote(string, baseFret + row - 1) % 12) }" :style="noteColorStyle(fretNote(string, baseFret + row - 1))">{{ noteName(fretNote(string, baseFret + row - 1)) }}</small>
                        </button>
                    </template>
                </div>
                <div class="editor-result">
                    <span>六弦 → 一弦</span>
                    <strong>{{ draft.map(fret => fret === null ? '×' : fret).join(' · ') }}</strong>
                </div>
                <footer>
                    <button class="cancel" @click="emit('close')">取消</button>
                    <button class="save" @click="save">保存按法</button>
                </footer>
            </section>
        </div>
    </Teleport>
</template>

<style scoped>
.editor-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 20px; background: #201a1466; backdrop-filter: blur(4px); }
.chord-editor { width: min(480px, 100%); padding: 24px; border: 1px solid #e0d7c9; border-radius: 14px; background: #fcfaf5; box-shadow: 0 24px 80px #1c140d40; color: #41453d; }
.chord-editor header { display: flex; justify-content: space-between; align-items: flex-start; }
.chord-editor header small { color: #a47b53; font-size: 8px; letter-spacing: 1.8px; }
.chord-editor h3 { margin: 6px 0 0; color: var(--note-color); font-family: Georgia, serif; font-size: 30px; font-weight: 400; }
.chord-editor h3 span { color: #5f6259; font-family: sans-serif; font-size: 13px; }
.editor-close { width: 30px; height: 30px; border: 0; border-radius: 50%; background: #eee9df; color: #8e8b81; font-size: 20px; cursor: pointer; }
.editor-help { margin: 15px 0 20px; color: #99988f; font-size: 11px; line-height: 1.7; }
.editor-diagram { display: grid; grid-template-columns: 38px repeat(6, 1fr); grid-template-rows: 50px repeat(4, 48px); border-top: 4px solid #645648; border-bottom: 1px solid #a99c8d; background: #f4efe5; }
.editor-corner { display: flex; align-items: center; justify-content: center; gap: 2px; color: #8d7963; font-family: Georgia, serif; font-size: 14px; }
.editor-corner small { font-size: 7px; }
.editor-string-head { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border-left: 1px solid #d2c7b8; }
.editor-string-head small { color: #a09a8f; font-size: 8px; }
.editor-string-head button { border: 0; background: none; color: #686b61; font-size: 18px; cursor: pointer; }
.editor-string-head button.muted { color: #a7704c; }
.editor-fret-number { display: grid; place-items: center; color: #aaa397; font-family: Georgia, serif; font-size: 10px; }
.editor-fret { position: relative; border: 0; border-left: 1px solid #bcae9d; border-bottom: 1px solid #bcae9d; background: transparent; cursor: pointer; }
.editor-fret i { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #8f806e; }
.editor-fret span { position: absolute; z-index: 1; left: 50%; top: 50%; transform: translate(-50%,-50%); display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; background: var(--note-color); color: white; font-size: 10px; box-shadow: 0 2px 5px #52371f33; }
.editor-fret:hover { background: #e9dece; }
.editor-fret .editor-note { position: absolute; z-index: 1; left: 50%; top: 50%; transform: translate(-50%,-50%); padding: 2px 3px; border-radius: 3px; background: #f4efe5; color: #aaa397; font-family: Georgia,serif; font-size: 9px; font-weight: 400; }
.editor-fret .editor-note.chord-tone { background: #fffaf0; color: var(--note-color); font-weight: 700; box-shadow: 0 0 0 1px #d8c9b4; }
.editor-string-head em { color: var(--note-color); font-style: normal; }
.editor-result { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 12px 14px; border-radius: 7px; background: #f0ebe2; }
.editor-result span { color: #9b998f; font-size: 9px; }
.editor-result strong { color: #6e685d; font-family: monospace; font-size: 12px; letter-spacing: 1px; }
.chord-editor footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.chord-editor footer button { padding: 9px 20px; border-radius: 6px; cursor: pointer; font-size: 11px; }
.chord-editor footer .cancel { border: 1px solid #d8d2c7; background: transparent; color: #85857c; }
.chord-editor footer .save { border: 1px solid #9d6d44; background: var(--note-color); color: white; }
@media (max-width: 520px) { .chord-editor { padding: 18px; } .editor-diagram { grid-template-columns: 28px repeat(6,1fr); } }
</style>
