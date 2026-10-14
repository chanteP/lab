/**
 * 和弦节奏型。每个节奏型把一小节的和弦音（midi，升序）展开成拨弦事件。
 * 事件时间单位：拍（相对小节起点）。所有节奏型都按拍号自适应填充小节。
 */
import type { FlatBar } from './types';

export interface PluckEvent {
    t: number; // 相对小节的拍位置
    midi: number;
    vel: number;
    dur: number; // 拍
}

export interface StrumPattern {
    id: string;
    name: string;
    gen: (chordNotes: number[], barBeats: number) => PluckEvent[];
}

/** 柱式：强拍 + 次强拍整和弦 */
const block: StrumPattern = {
    id: 'block',
    name: '柱式',
    gen(notes, barBeats) {
        const hits = barBeats >= 4 ? [0, barBeats / 2] : [0];
        const out: PluckEvent[] = [];
        for (const [hi, t] of hits.entries()) {
            notes.forEach((midi, i) => {
                out.push({ t: t + i * 0.008, midi, vel: hi === 0 ? 0.55 : 0.4, dur: Math.min(barBeats / 2, 3) });
            });
        }
        return out;
    },
};

/** 分解 53231323：低音 → 高音循环拨弦，每半拍一个音 */
const arp: StrumPattern = {
    id: 'arp',
    name: '分解 53231323',
    gen(notes, barBeats) {
        if (!notes.length) return [];
        // 低音 + 和弦音排序，模拟 5-3-2-3-1-3-2-3
        const bass = notes[0] - 12;
        const order = [bass, ...notes.slice().sort((a, b) => a - b)];
        const cycle = [0, 2, 1, 2, order.length - 1, 2, 1, 2]; // 低→高→中 的拨弦顺序
        const out: PluckEvent[] = [];
        const slots = barBeats * 2; // 八分音符
        for (let i = 0; i < slots; i++) {
            const midi = order[cycle[i % cycle.length] % order.length];
            out.push({ t: i * 0.5, midi, vel: i % 4 === 0 ? 0.5 : 0.38, dur: 0.45 });
        }
        return out;
    },
};

/** 扫弦：D D DU-UDU 民谣型，2 拍一循环 */
const strum: StrumPattern = {
    id: 'strum',
    name: '扫弦 D·DU-UDU',
    gen(notes, barBeats) {
        if (!notes.length) return [];
        const sorted = notes.slice().sort((a, b) => a - b);
        const out: PluckEvent[] = [];
        // 每 2 拍循环：下(0) 下(0.5拍) 下上(0.75) 上(1.25) 下(1.5) 上(1.75)
        const strokes: [number, 'D' | 'U', number][] = [
            [0, 'D', 0.5], [0.5, 'D', 0.38], [0.75, 'D', 0.32],
            [1.25, 'U', 0.34], [1.5, 'D', 0.4], [1.75, 'U', 0.3],
        ];
        for (let base = 0; base + 2 <= barBeats + 0.001; base += 2) {
            for (const [off, dir, vel] of strokes) {
                // 下扫从低到高，上扫从高到低（取高音 3 根）
                const hit = dir === 'D' ? sorted : sorted.slice(-3).reverse();
                hit.forEach((midi, i) => {
                    out.push({ t: base + off + i * 0.012, midi, vel, dur: 0.4 });
                });
            }
        }
        return out;
    },
};

export const PATTERNS: StrumPattern[] = [block, arp, strum];
