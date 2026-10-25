/** 十二平均律与和弦 voicing；不依赖 UI / Web Audio，便于独立测试。 */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4，从六弦到一弦
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];

export interface TuningDefinition {
    id: string;
    name: string;
    description: string;
    strings: number[];
}

export const TUNINGS: TuningDefinition[] = [
    { id: 'standard', name: '标准调弦', description: 'E A D G B E', strings: OPEN_STRINGS },
    { id: 'dropD', name: 'Drop D', description: 'D A D G B E', strings: [38, 45, 50, 55, 59, 64] },
    { id: 'openD', name: 'Open D', description: 'D A D F# A D', strings: [38, 45, 50, 54, 57, 62] },
    { id: 'openG', name: 'Open G', description: 'D G D G B D', strings: [38, 43, 50, 55, 59, 62] },
];
export const MAX_FRET = 20;

export interface ChordDefinition {
    suffix: string;
    name: string;
    intervals: number[];
}

export const CHORDS: ChordDefinition[] = [
    { suffix: '', name: '大三和弦', intervals: [0, 4, 7] },
    { suffix: 'm', name: '小三和弦', intervals: [0, 3, 7] },
    { suffix: 'm7', name: '小七和弦', intervals: [0, 3, 7, 10] },
    { suffix: '7', name: '属七和弦', intervals: [0, 4, 7, 10] },
    { suffix: 'add9', name: '加九和弦', intervals: [0, 4, 7, 14] },
    // 按本工具的简化九和弦定义：1 3 5 9，不叠加七音。
    { suffix: '9', name: '九和弦', intervals: [0, 4, 7, 14] },
    { suffix: 'maj7', name: '大七和弦', intervals: [0, 4, 7, 11] },
    { suffix: 'sus4', name: '挂四和弦', intervals: [0, 5, 7] },
];

export interface Voicing {
    midi: number[];
    frets: Array<number | null>;
}

export const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
export const noteName = (midi: number) => NOTE_NAMES[pitchClass(midi)];
export const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function scalePitchClasses(tonic: number) {
    return new Set([0, 2, 4, 5, 7, 9, 11].map(step => (tonic + step) % 12));
}

/**
 * 在 0–7 品内搜索低把位开放和弦。根音固定为最低音，优先完整 chord tones、
 * 较少闷音和较小指板跨度。结果包含实际 MIDI 音高，音频层无需理解和弦理论。
 */
export function findVoicing(root: number, definition: ChordDefinition, tuning: readonly number[] = OPEN_STRINGS): Voicing {
    const tones = new Set(definition.intervals.map(interval => (root + interval) % 12));
    let bassString = -1;
    let bassMidi = -1;
    let lowestBassFret = Infinity;
    for (let string = 0; string < 3; string++) {
        for (let fret = 0; fret <= 7; fret++) {
            const midi = tuning[string] + fret;
            if (pitchClass(midi) === root && fret < lowestBassFret) {
                bassString = string;
                bassMidi = midi;
                lowestBassFret = fret;
            }
        }
    }

    const candidates: Array<Array<number | null>> = tuning.map(() => [null]);
    for (let string = bassString; string < 6; string++) {
        candidates[string] = [];
        for (let fret = 0; fret <= 7; fret++) {
            const midi = tuning[string] + fret;
            if (tones.has(pitchClass(midi)) && midi >= bassMidi && midi <= bassMidi + 24) {
                candidates[string].push(fret);
            }
        }
        if (string !== bassString) candidates[string].push(null);
    }

    let best: { score: number; frets: Array<number | null> } | null = null;
    const current: Array<number | null> = [null, null, null, null, null, null];
    function visit(string: number) {
        if (string < 6) {
            for (const fret of candidates[string]) {
                current[string] = fret;
                visit(string + 1);
            }
            return;
        }
        const fretted = current.map((fret, index) => fret === null ? null : tuning[index] + fret);
        const notes = fretted.filter((note): note is number => note !== null);
        const present = new Set(notes.map(pitchClass));
        if (notes.length < 4 || [...tones].some(tone => !present.has(tone))) return;
        const usedFrets = current.filter((fret): fret is number => fret !== null && fret > 0);
        const spread = usedFrets.length ? Math.max(...usedFrets) - Math.min(...usedFrets) : 0;
        if (spread > 4) return;
        let mutedInside = 0;
        for (let i = bassString + 1; i < 6; i++) {
            if (current[i] === null && current.slice(i + 1).some(fret => fret !== null)) mutedInside++;
        }
        const fretSum = usedFrets.reduce((sum, fret) => sum + fret, 0);
        const openStrings = current.filter(fret => fret === 0).length;
        const score = notes.length * 7 - (6 - notes.length) * 7 - spread * 1.4 - mutedInside * 4
            - fretSum * 0.8 - Math.max(0, ...usedFrets) * 0.12 + openStrings * 0.8;
        if (!best || score > best.score) best = { score, frets: [...current] };
    }
    if (bassString >= 0) {
        current[bassString] = bassMidi - tuning[bassString];
        visit(bassString + 1);
    }
    const winning = best as { score: number; frets: Array<number | null> } | null;
    if (winning) return {
        frets: winning.frets,
        midi: winning.frets.map((fret, i) => fret === null ? null : tuning[i] + fret).filter((note): note is number => note !== null),
    };

    // 理论上不会触发；保留安全的闭和弦回退，避免新增和弦类型时静默失败。
    const midi = definition.intervals.map((interval, i) => bassMidi + interval + (i > 1 && bassMidi + interval < bassMidi + 7 ? 12 : 0));
    return { midi, frets: [null, null, null, null, null, null] };
}

export function voicingLabel(frets: Array<number | null>) {
    return frets.map(fret => fret === null ? '×' : fret).join(' · ');
}
