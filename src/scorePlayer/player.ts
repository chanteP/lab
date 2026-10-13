import * as Tone from 'tone';
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
    private chordSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.03, decay: 0.2, sustain: 0.25, release: 0.6 },
    }).toDestination();

    private eventIds: number[] = [];
    private spb = 0.5; // 秒/拍（按当前 rate）
    private rate = 1;
    private baseBpm = 120;

    melodyOn = true;
    chordOn = true;
    events: PlayerEvents = {};

    constructor() {
        this.melody.volume.value = -7;
        this.chordSynth.volume.value = -16;
        const lp = new Tone.Filter(1800, 'lowpass').toDestination();
        this.chordSynth.disconnect();
        this.chordSynth.connect(lp);
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
            const hits = b.beats >= 4 ? [0, 2] : [0]; // 4 拍打 1、3 拍，其余只打第 1 拍
            for (const h of hits) {
                const t = (b.startBeat + h) * this.spb;
                const id = Tone.Transport.schedule((time) => {
                    if (!this.chordOn) return;
                    const freqs = midis.map((m) => Tone.Frequency(m, 'midi').toFrequency());
                    const dur = Math.min(b.beats * this.spb * (b.beats >= 4 ? 0.5 : 0.9), 3);
                    // 轻微分解，模拟扫弦
                    freqs.forEach((f, i) => {
                        this.chordSynth.triggerAttackRelease(f, dur, time + i * 0.025, 0.5);
                    });
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
        this.chordSynth.dispose();
    }
}
