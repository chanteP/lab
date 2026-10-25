export interface ArrangedChord {
    root: number;
    suffix: string;
    name: string;
    frets: Array<number | null>;
    midi: number[];
    strings: number[];
}

export interface MeasureChord {
    id: string;
    beat: number;
    chord: ArrangedChord;
}

export interface Measure {
    id: string;
    chords: MeasureChord[];
    lyrics: string[];
    patternId: string;
    note?: string;
    /** IndexedDB 旧版本迁移字段。 */
    chord?: ArrangedChord | null;
    lyric?: string;
}

export interface Arrangement {
    id: string;
    name: string;
    meter: string;
    bpm: number;
    tuningId: string;
    measures: Measure[];
    updatedAt: number;
}

export interface RhythmStep {
    strings: number[];
    stroke?: 'down' | 'up';
    muted?: boolean;
    slap?: boolean;
}

export interface RhythmPattern {
    id: string;
    name: string;
    meter: string;
    steps: RhythmStep[];
}
