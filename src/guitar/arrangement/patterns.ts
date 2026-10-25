import type { RhythmPattern, RhythmStep } from './types';

const pluck = (id: string, name: string, meter: string, sequence: number[]): RhythmPattern => ({
    id, name, meter, steps: sequence.map(string => ({ strings: [string] })),
});
const STRUM_STRINGS = {
    down: [1, 2, 3, 4, 5, 6], up: [1, 2, 3, 4, 5, 6],
    low: [4, 5, 6], highUp: [1, 2, 3], highDown: [1, 2, 3],
    muted: [1, 2, 3, 4, 5, 6], slap: [1, 2, 3, 4, 5, 6],
};
type Stroke = keyof typeof STRUM_STRINGS | null;
const strum = (id: string, name: string, meter: string, sequence: Stroke[]): RhythmPattern => ({
    id, name, meter,
    steps: sequence.map(stroke => {
        if (!stroke) return { strings: [] };
        const slap = stroke === 'slap';
        return {
            strings: STRUM_STRINGS[stroke],
            stroke: slap ? undefined : stroke === 'highUp' ? 'up' : 'down',
            muted: stroke === 'muted', slap,
        };
    }),
});

export const RHYTHM_PATTERNS: RhythmPattern[] = [
    pluck('53231323', '分解 53231323', '4/4', [5, 3, 2, 3, 1, 3, 2, 3]),
    pluck('63231323', '分解 63231323', '4/4', [6, 3, 2, 3, 1, 3, 2, 3]),
    pluck('53123212', '流动分解', '4/4', [5, 3, 1, 2, 3, 2, 1, 2]),
    strum('folk-strum', '民谣 · 低 下上 上下上', '4/4', ['low', null, 'down', 'highUp', null, 'highUp', 'low', 'highUp']),
    strum('pop-strum', '流行 · 低上 低上 上低上', '4/4', ['low', 'highUp', 'low', 'highUp', null, 'highUp', 'low', 'highUp']),
    strum('muted-strum', '闷音切分', '4/4', ['low', 'muted', null, 'highUp', 'down', null, 'muted', 'highUp']),
    strum('slap-strum', '拍弦 · 低拍 上低拍上', '4/4', ['low', 'slap', null, 'highUp', 'low', null, 'slap', 'highUp']),
    pluck('532123', '分解 532123', '3/4', [5, 3, 2, 1, 2, 3]),
    pluck('632123', '分解 632123', '3/4', [6, 3, 2, 1, 2, 3]),
    strum('waltz', '华尔兹 · 低高高', '3/4', ['low', null, 'highUp', null, 'highUp', null]),
    pluck('5323', '分解 5323', '2/4', [5, 3, 2, 3]),
    strum('two-four-strum', '进行曲 · 低下上', '2/4', ['low', null, 'down', 'highUp']),
    pluck('531231', '六八分解', '6/8', [5, 3, 1, 2, 3, 1]),
    pluck('632132', '六八流动分解', '6/8', [6, 3, 2, 1, 3, 2]),
    strum('six-eight-strum', '六八 · 低高 下高', '6/8', ['low', null, 'highUp', 'down', null, 'highUp']),
];

export const METERS = ['4/4', '3/4', '2/4', '6/8'];
export const DEFAULT_PATTERN = '53231323';
export const patternsForMeter = (meter: string) => RHYTHM_PATTERNS.filter(pattern => pattern.meter === meter);
export const patternById = (id: string) => RHYTHM_PATTERNS.find(pattern => pattern.id === id) ?? RHYTHM_PATTERNS[0];
export function fretForStep(string: number, frets: Array<number | null>) {
    const fret = frets[6 - string];
    return fret === null || fret === undefined ? '×' : String(fret);
}
