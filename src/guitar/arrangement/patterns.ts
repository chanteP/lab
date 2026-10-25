import type { RhythmPattern, RhythmStep } from './types';

const pluck = (id: string, name: string, meter: string, sequence: number[]): RhythmPattern => ({
    id, name, meter, steps: sequence.map(string => ({ strings: [string] })),
});
const strum = (id: string, name: string, meter: string, sequence: Array<'down' | 'up' | 'muted' | null>): RhythmPattern => ({
    id, name, meter,
    steps: sequence.map(stroke => stroke
        ? { strings: [1, 2, 3, 4, 5, 6], stroke: stroke === 'muted' ? 'down' : stroke, muted: stroke === 'muted' }
        : { strings: [] }),
});

export const RHYTHM_PATTERNS: RhythmPattern[] = [
    pluck('53231323', '分解 53231323', '4/4', [5, 3, 2, 3, 1, 3, 2, 3]),
    pluck('63231323', '分解 63231323', '4/4', [6, 3, 2, 3, 1, 3, 2, 3]),
    pluck('53123212', '流动分解', '4/4', [5, 3, 1, 2, 3, 2, 1, 2]),
    strum('folk-strum', '民谣扫弦', '4/4', ['down', null, 'down', 'up', null, 'up', 'down', 'up']),
    strum('muted-strum', '闷音切分', '4/4', ['down', 'muted', null, 'up', 'down', null, 'muted', 'up']),
    pluck('532123', '分解 532123', '3/4', [5, 3, 2, 1, 2, 3]),
    pluck('632123', '分解 632123', '3/4', [6, 3, 2, 1, 2, 3]),
    strum('waltz', '华尔兹', '3/4', ['down', null, 'up', null, 'up', null]),
    pluck('5323', '分解 5323', '2/4', [5, 3, 2, 3]),
    strum('two-four-strum', '进行曲扫弦', '2/4', ['down', null, 'down', 'up']),
    pluck('531231', '六八分解', '6/8', [5, 3, 1, 2, 3, 1]),
    pluck('632132', '六八流动分解', '6/8', [6, 3, 2, 1, 3, 2]),
    strum('six-eight-strum', '六八扫弦', '6/8', ['down', null, 'up', 'down', null, 'up']),
];

export const METERS = ['4/4', '3/4', '2/4', '6/8'];
export const DEFAULT_PATTERN = '53231323';
export const patternsForMeter = (meter: string) => RHYTHM_PATTERNS.filter(pattern => pattern.meter === meter);
export const patternById = (id: string) => RHYTHM_PATTERNS.find(pattern => pattern.id === id) ?? RHYTHM_PATTERNS[0];
export function fretForStep(string: number, frets: Array<number | null>) {
    const fret = frets[6 - string];
    return fret === null || fret === undefined ? '×' : String(fret);
}
