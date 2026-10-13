import type { Score } from './types';

/** 内置示例：小星星（用于无谱文件时演示） */
export const SAMPLE_SCORE: Score = {
    version: 1,
    meta: { title: '小星星（示例）', artist: '示例曲目', key: '1=C', bpm: 96, timeSig: '4/4', capo: 0 },
    sections: [
        { name: 'A 段', bar: 0 },
        { name: 'B 段', bar: 4 },
        { name: 'A 段再现', bar: 8 },
    ],
    bars: [
        {
            chord: 'C',
            notes: [
                { d: '1', len: 1, ly: '一' },
                { d: '1', len: 1, ly: '闪' },
                { d: '5', len: 1, ly: '一' },
                { d: '5', len: 1, ly: '闪' },
            ],
        },
        {
            chord: 'F',
            notes: [
                { d: '6', len: 1, ly: '亮' },
                { d: '6', len: 1, ly: '晶' },
                { d: '5', len: 2, ly: '晶' },
            ],
        },
        {
            chord: 'C',
            notes: [
                { d: '4', len: 1, ly: '满' },
                { d: '4', len: 1, ly: '天' },
                { d: '3', len: 1, ly: '都' },
                { d: '3', len: 1, ly: '是' },
            ],
        },
        {
            chord: 'G',
            notes: [
                { d: '2', len: 1, ly: '小' },
                { d: '2', len: 1, ly: '星' },
                { d: '1', len: 2, ly: '星' },
            ],
        },
        {
            chord: 'F',
            notes: [
                { d: '4', len: 1, ly: '挂' },
                { d: '4', len: 1, ly: '在' },
                { d: '3', len: 1, ly: '天' },
                { d: '3', len: 1, ly: '上' },
            ],
        },
        {
            chord: 'C',
            notes: [
                { d: '2', len: 1, ly: '放' },
                { d: '2', len: 1, ly: '光' },
                { d: '1', len: 2, ly: '明' },
            ],
        },
        {
            chord: 'F',
            notes: [
                { d: '4', len: 1, ly: '好' },
                { d: '4', len: 1, ly: '像' },
                { d: '3', len: 1, ly: '许' },
                { d: '3', len: 1, ly: '多' },
            ],
        },
        {
            chord: 'G',
            notes: [
                { d: '2', len: 1, ly: '小' },
                { d: '2', len: 1, ly: '眼' },
                { d: '1', len: 2, ly: '睛' },
            ],
        },
        {
            chord: 'C',
            notes: [
                { d: '1', len: 1, ly: '一' },
                { d: '1', len: 1, ly: '闪' },
                { d: '5', len: 1, ly: '一' },
                { d: '5', len: 1, ly: '闪' },
            ],
        },
        {
            chord: 'F',
            notes: [
                { d: '6', len: 1, ly: '亮' },
                { d: '6', len: 1, ly: '晶' },
                { d: '5', len: 2, ly: '晶' },
            ],
        },
        {
            chord: 'C',
            notes: [
                { d: '4', len: 1, ly: '满' },
                { d: '4', len: 1, ly: '天' },
                { d: '3', len: 1, ly: '都' },
                { d: '3', len: 1, ly: '是' },
            ],
        },
        {
            chord: 'G',
            notes: [
                { d: '2', len: 1, ly: '小' },
                { d: '2', len: 1, ly: '星' },
                { d: '1', len: 2, ly: '星' },
            ],
        },
        // 演示八分音与高低八度
        {
            chord: 'C',
            notes: [
                { d: '1', len: 0.5, ly: '闪' },
                { d: '2', len: 0.5, ly: '亮' },
                { d: '3', len: 0.5, ly: '的' },
                { d: '4', len: 0.5, ly: '星' },
                { d: '5', len: 1, ly: '空' },
                { d: '5', oct: 1, len: 1, ly: '里' },
            ],
        },
        {
            chord: 'Am',
            notes: [
                { d: '6', oct: -1, len: 0.5, ly: '一' },
                { d: '5', oct: -1, len: 0.5, ly: '颗' },
                { d: '6', oct: -1, len: 0.5, ly: '一' },
                { d: '7', oct: -1, len: 0.5, ly: '颗' },
                { d: '1', len: 1, ly: '连' },
                { d: '0', len: 0.5 },
                { d: '1', len: 0.5, ly: '着' },
            ],
        },
        {
            chord: 'F',
            notes: [
                { d: '4', len: 1.5, ly: '心' },
                { d: '3', len: 0.5, ly: '灵' },
                { d: '2', len: 1, ly: '的' },
                { d: '1', len: 1, ly: '光' },
            ],
        },
        {
            chord: 'C',
            notes: [{ d: '1', len: 4, ly: '芒' }],
        },
    ],
};
