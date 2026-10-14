import * as Tone from 'tone';
import { PATTERNS, type StrumPattern } from './patterns';
import { chordToMidi } from './theory';
import type { FlatBar, FlatNote } from './types';

export interface PlayerEvents {
    /** 播放状态变化 */
    onStateChange?: (playing: boolean) => void;
}

/**
 * 基于 Tone.js 的谱面播放器。
 * 时间基准：Transport.seconds，外部用 rAF 读取驱动光标与滚动。
 */
export class ScorePlayer {
    private melody = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.015, decay: 0.12, sustain: 0.35, release: 0.5 },
    }).toDestination();
    // 和弦用 Karplus-Strong 拨弦合成，接近木吉他音色。
    // PluckSynth 不是 Monophonic 子类，PolySynth 包不了，用手动 round-robin 池
    private chordVoices: Tone.PluckSynth[] = [];
    private chordVoiceIdx = 0;

    private eventIds: number[] = [];
    private spb = 0.5; // 秒/拍（按当前 rate）
    private rate = 1;
    private baseBpm = 120;

    melodyOn = true;
    chordOn = true;
    pattern: StrumPattern = PATTERNS[0];
    events: PlayerEvents = {};

    constructor() {
        this.melody.volume.value = -7;
        const lp = new Tone.Filter(3200, 'lowpass').toDestination();
        for (let i = 0; i < 8; i++) {
            const v = new Tone.PluckSynth({ attackNoise: 2.2, dampening: 3600, resonance: 0.93 });
            v.volume.value = -9;
            v.connect(lp);
            this.chordVoices.push(v);
        }
    }

    get playing() {
        return Tone.Transport.state === 'started';
    }

    get seconds() {
        return Tone.Transport.seconds;
    }

    setRate(r: number, bars: FlatBar[], notes: FlatNote[], currentBeat: number) {
        this.rate = r;
        this.rebuild(bars, notes, currentBeat);
    }

    /** 重建全部调度（加载谱子 / 变速 / 移调后调用），并定位到 beat */
    rebuild(bars: FlatBar[], notes: FlatNote[], beat: number) {
        const wasPlaying = this.playing;
        Tone.Transport.pause();
        Tone.Transport.cancel(0);
        this.eventIds = [];
        const bpm = this.baseBpm * this.rate;
        Tone.Transport.bpm.value = bpm;
        this.spb = 60 / bpm;

        for (const n of notes) {
            if (n.midi === null) continue;
            const t = n.startBeat * this.spb;
            const id = Tone.Transport.schedule((time) => {
                if (this.melodyOn) {
                    this.melody.triggerAttackRelease(Tone.Frequency(n.midi!, 'midi').toFrequency(), Math.max(n.len * this.spb * 0.9, 0.08), time, 0.85);
                }
            }, t);
            this.eventIds.push(id);
        }
        for (const b of bars) {
            if (!b.chord) continue;
            const midis = chordToMidi(b.chord);
            if (!midis.length) continue;
            // 按当前节奏型展开整小节拨弦事件（跟随拍号）
            for (const ev of this.pattern.gen(midis, b.beats)) {
                const t = (b.startBeat + ev.t) * this.spb;
                const durSec = Math.max(ev.dur * this.spb, 0.15);
                const id = Tone.Transport.schedule((time) => {
                    if (!this.chordOn) return;
                    const v = this.chordVoices[this.chordVoiceIdx++ % this.chordVoices.length];
                    v.triggerAttackRelease(
                        Tone.Frequency(ev.midi, 'midi').toFrequency(), durSec, time, ev.vel,
                    );
                }, t);
                this.eventIds.push(id);
            }
        }

        Tone.Transport.seconds = beat * this.spb;
        if (wasPlaying) Tone.Transport.start();
    }

    setBaseBpm(bpm: number) {
        this.baseBpm = bpm;
    }

    async play(bars: FlatBar[], notes: FlatNote[], fromBeat?: number) {
        await Tone.start();
        if (this.eventIds.length === 0 || fromBeat !== undefined) {
            this.rebuild(bars, notes, fromBeat ?? this.seconds / this.spb);
        }
        Tone.Transport.start();
        this.events.onStateChange?.(true);
    }

    pause() {
        Tone.Transport.pause();
        this.events.onStateChange?.(false);
    }

    stop() {
        Tone.Transport.stop();
        this.events.onStateChange?.(false);
    }

    /** 定位到拍 */
    seek(beat: number) {
        Tone.Transport.seconds = beat * this.spb;
    }

    beatsToSeconds(beats: number) {
        return beats * this.spb;
    }

    secondsToBeats(sec: number) {
        return sec / this.spb;
    }

    dispose() {
        Tone.Transport.cancel(0);
        Tone.Transport.stop();
        this.melody.dispose();
        for (const v of this.chordVoices) v.dispose();
    }
}
