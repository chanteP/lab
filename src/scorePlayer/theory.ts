import type { Score, FlatBar, FlatNote } from './types';

const NOTE_PC: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};
const PC_NAME = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export interface KeyInfo {
    /** 主音 pitch class（0-11） */
    tonicPc: number;
    minor: boolean;
    /** 展示用 "1=C" / "1=Am" */
    label: string;
}

export function parseKey(key?: string): KeyInfo {
    const raw = (key || '1=C').trim();
    const m = raw.match(/=\s*([A-Ga-g])([#b])?(m)?/);
    if (!m) return { tonicPc: 0, minor: false, label: '1=C' };
    const name = m[1].toUpperCase() + (m[2] || '');
    const pc = NOTE_PC[name] ?? 0;
    const minor = !!m[3];
    return { tonicPc: pc, minor, label: `1=${PC_NAME[pc]}${minor ? 'm' : ''}` };
}

export function transposeKey(key: KeyInfo, semis: number): KeyInfo {
    const pc = (((key.tonicPc + semis) % 12) + 12) % 12;
    return { tonicPc: pc, minor: key.minor, label: `1=${PC_NAME[pc]}${key.minor ? 'm' : ''}` };
}

/** 唱名 → midi。baseOctave 决定 1 的实际高度（默认中音 1 = 60 附近） */
export function degreeToMidi(d: string, acc: '' | '#' | 'b', oct: number, key: KeyInfo): number | null {
    const n = parseInt(d, 10);
    if (!n || n < 1 || n > 7) return null;
    const scale = key.minor ? MINOR : MAJOR;
    let semi = scale[n - 1] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
    // 中音 1 放在 C4 附近（tonic 在 60-71）
    const base = 60 + key.tonicPc;
    return base + semi + oct * 12;
}

/* ---------------- 和弦 ---------------- */

const CHORD_INTERVALS: [RegExp, number[]][] = [
    [/^$/, [0, 4, 7]],
    [/^m(?!aj)/, [0, 3, 7]],
    [/^maj7/, [0, 4, 7, 11]],
    [/^m7b5|^ø/, [0, 3, 6, 10]],
    [/^m7/, [0, 3, 7, 10]],
    [/^m6/, [0, 3, 7, 9]],
    [/^7sus4/, [0, 5, 7, 10]],
    [/^sus2/, [0, 2, 7]],
    [/^sus4/, [0, 5, 7]],
    [/^add9/, [0, 4, 7, 14]],
    [/^madd9/, [0, 3, 7, 14]],
    [/^9/, [0, 4, 7, 10, 14]],
    [/^6/, [0, 4, 7, 9]],
    [/^7/, [0, 4, 7, 10]],
    [/^dim7?/, [0, 3, 6]],
    [/^aug|^\+/, [0, 4, 8]],
    [/^5/, [0, 7]],
];

export interface ParsedChord {
    rootPc: number;
    bassPc: number | null;
    intervals: number[];
    /** 规格化名称（移调后重新生成用） */
    quality: string; // 原字符串中 root 之后的部分（不含 /bass）
    slash: string | null; // bass 音名部分
}

export function parseChord(name: string): ParsedChord | null {
    const m = name.trim().match(/^([A-Ga-g])([#b])?([^/]*)(\/([A-Ga-g])([#b])?)?$/);
    if (!m) return null;
    const rootName = m[1].toUpperCase() + (m[2] || '');
    const rootPc = NOTE_PC[rootName];
    if (rootPc === undefined) return null;
    const quality = m[3] || '';
    let bassPc: number | null = null;
    let slash: string | null = null;
    if (m[4]) {
        const bn = m[5].toUpperCase() + (m[6] || '');
        bassPc = NOTE_PC[bn] ?? null;
        slash = bn;
    }
    let intervals: number[] = [0, 4, 7];
    for (const [re, iv] of CHORD_INTERVALS) {
        if (re.test(quality)) {
            intervals = iv;
            break;
        }
    }
    return { rootPc, bassPc, intervals, quality, slash };
}

/** 和弦移调，保持 quality 与 slash 结构 */
export function transposeChord(name: string, semis: number): string {
    const p = parseChord(name);
    if (!p) return name;
    const root = PC_NAME[(((p.rootPc + semis) % 12) + 12) % 12];
    const bass = p.bassPc === null ? '' : '/' + PC_NAME[(((p.bassPc + semis) % 12) + 12) % 12];
    return root + p.quality + bass;
}

/** 和弦 → 实际 midi 音（柱式），root 放在 48-59 区间 */
export function chordToMidi(name: string): number[] {
    const p = parseChord(name);
    if (!p) return [];
    const rootMidi = 48 + p.rootPc;
    const notes = p.intervals.map((i) => rootMidi + i);
    if (p.bassPc !== null && p.bassPc !== p.rootPc) {
        // 转位：bass 音放低八度
        let bass = 36 + p.bassPc;
        while (bass > rootMidi - 6) bass -= 12;
        notes.unshift(bass);
    }
    return notes;
}

/* ---------------- 展平 ---------------- */

export function flattenScore(score: Score, key: KeyInfo): { bars: FlatBar[]; notes: FlatNote[]; totalBeats: number } {
    const [beatsPerBar] = (score.meta.timeSig || '4/4').split('/').map(Number);
    const bars: FlatBar[] = [];
    const notes: FlatNote[] = [];
    let beat = 0;
    let idx = 0;
    let lastChord = '';
    score.bars.forEach((b, barIndex) => {
        const barBeats = b.beats ?? beatsPerBar ?? 4;
        if (b.chord) lastChord = b.chord;
        const fb: FlatBar = { index: barIndex, startBeat: beat, beats: barBeats, chord: lastChord, notes: [] };
        let nb = 0;
        for (const n of b.notes) {
            const fn: FlatNote = {
                idx: idx++,
                bar: barIndex,
                startBeat: beat + nb,
                len: n.len,
                d: n.d,
                acc: n.acc || '',
                oct: n.oct || 0,
                ly: n.ly || '',
                midi: degreeToMidi(n.d, n.acc || '', n.oct || 0, key),
            };
            nb += n.len;
            fb.notes.push(fn);
            notes.push(fn);
        }
        bars.push(fb);
        beat += Math.max(nb, barBeats);
    });
    return { bars, notes, totalBeats: beat };
}
