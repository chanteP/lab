export interface ArrangedChord {
    root: number;
    suffix: string;
    name: string;
    frets: Array<number | null>;
    midi: number[];
    strings: number[];
}

export interface Measure {
    id: string;
    chord: ArrangedChord | null;
    patternId: string;
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
}

export interface RhythmPattern {
    id: string;
    name: string;
    meter: string;
    steps: RhythmStep[];
}
