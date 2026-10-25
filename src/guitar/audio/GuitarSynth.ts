import { midiToFrequency, OPEN_STRINGS, pitchClass, type Voicing } from '../theory/chords';

interface PluckOptions {
    velocity?: number;
    stringIndex?: number;
    pan?: number;
    when?: number;
}

interface Resonator {
    frequency: number;
    decay: number;
    gain: number;
    y1: number;
    y2: number;
}

/**
 * 扩展 Karplus–Strong 弦模型 + 共鸣弦/琴体滤波器 + 卷积琴体响应。
 * 和弦先在采样层合成为一个立体声 Buffer，再统一激励共鸣和琴体，避免多条
 * 独立音频链的相位、包络与动态互相打架。详见 audio/README.md。
 */
export class GuitarSynth {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private dry: GainNode | null = null;
    private body: ConvolverNode | null = null;
    private analyserNode: AnalyserNode | null = null;
    private buffers = new Map<string, AudioBuffer>();
    private active = new Set<AudioBufferSourceNode>();
    volume = 0.8;

    private ensureContext() {
        if (this.context) return this.context;
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const context = new AudioContextClass({ latencyHint: 'interactive' });
        const master = context.createGain();
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 18;
        compressor.ratio.value = 2.5;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.24;
        master.gain.value = this.volume;
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.72;
        master.connect(compressor).connect(analyser).connect(context.destination);

        const dry = context.createGain();
        dry.gain.value = 0.94;
        dry.connect(master);
        const body = context.createConvolver();
        body.buffer = this.createBodyImpulse(context);
        const bodyGain = context.createGain();
        bodyGain.gain.value = 0.2;
        body.connect(bodyGain).connect(master);

        this.context = context;
        this.master = master;
        this.dry = dry;
        this.body = body;
        this.analyserNode = analyser;
        return context;
    }

    get analyser() {
        return this.analyserNode;
    }

    get now() {
        return this.context?.currentTime ?? 0;
    }

    async resume() {
        const context = this.ensureContext();
        if (context.state === 'suspended') await context.resume();
    }

    setVolume(value: number) {
        this.volume = value;
        if (this.context && this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
    }

    async pluck(midi: number, options: PluckOptions = {}) {
        await this.resume();
        const velocity = options.velocity ?? 0.85;
        const stringIndex = options.stringIndex ?? 3;
        const key = `note:${midi}:${stringIndex}:${Math.round(velocity * 4)}`;
        let buffer = this.buffers.get(key);
        if (!buffer) {
            buffer = this.renderString(this.context!, midiToFrequency(midi), midi, velocity, stringIndex);
            this.buffers.set(key, buffer);
        }
        this.playBuffer(buffer, 0.62, options.pan ?? (stringIndex - 2.5) * 0.065, options.when);
    }

    /** 一次生成、一次起音：扫弦时差写在采样偏移里，不依赖 setTimeout。 */
    async strum(voicing: Voicing, tuning: readonly number[] = OPEN_STRINGS, when?: number, level = 0.9) {
        await this.resume();
        const key = `chord:${tuning.join('-')}:${voicing.midi.join('-')}:${voicing.frets.map(fret => fret ?? 'x').join('')}`;
        let buffer = this.buffers.get(key);
        if (!buffer) {
            buffer = this.renderChord(this.context!, voicing, tuning);
            this.buffers.set(key, buffer);
        }
        this.playBuffer(buffer, level, 0, when);
    }

    stopAll() {
        this.active.forEach(source => source.stop());
        this.active.clear();
    }

    private playBuffer(buffer: AudioBuffer, level: number, pan = 0, when?: number) {
        const source = this.context!.createBufferSource();
        source.buffer = buffer;
        const gain = this.context!.createGain();
        gain.gain.value = level;
        const panner = this.context!.createStereoPanner();
        panner.pan.value = pan;
        source.connect(gain).connect(panner);
        panner.connect(this.dry!);
        panner.connect(this.body!);
        source.start(when);
        this.active.add(source);
        source.onended = () => {
            this.active.delete(source);
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
        };
    }

    private renderString(context: AudioContext, frequency: number, midi: number, velocity: number, stringIndex: number) {
        const sampleRate = context.sampleRate;
        const duration = midi < 48 ? 4.2 : midi < 64 ? 3.4 : 2.7;
        const length = Math.floor(sampleRate * duration);
        const buffer = context.createBuffer(1, length, sampleRate);
        const output = buffer.getChannelData(0);
        const period = sampleRate / frequency;
        const ringSize = Math.ceil(period) + 3;
        const ring = new Float32Array(ringSize);
        const noise = new Float32Array(ringSize);
        const pickDelay = Math.max(1, Math.round(period * 0.18));

        // 拨片位置形成梳状频谱；不是简单滤波白噪声，也不使用固定谐波振荡器。
        for (let i = 0; i < ringSize; i++) noise[i] = Math.random() * 2 - 1;
        for (let i = 0; i < ringSize; i++) {
            const comb = noise[i] - 0.62 * noise[(i - pickDelay + ringSize) % ringSize];
            ring[i] = comb * Math.sin(Math.PI * i / ringSize) ** 0.7;
        }

        const decayTime = midi < 48 ? 3.25 : midi < 64 ? 2.5 : 1.85;
        const loss = Math.exp(-1 / (frequency * decayTime));
        // 缠绕低音弦保留更多金属泛音；高音钢弦稍柔和，减少刺耳感。
        const damping = Math.min(0.5, Math.max(0.16,
            0.25 + frequency / 4800 - (stringIndex < 3 ? 0.045 : 0)));
        let readPrevious = 0;
        let write = 0;
        for (let i = 0; i < length; i++) {
            const read = write - period + ringSize;
            const index = Math.floor(read);
            const fraction = read - index;
            const a = ring[index % ringSize];
            const b = ring[(index + 1) % ringSize];
            const sample = a + (b - a) * fraction;
            const filtered = (sample * (1 - damping) + readPrevious * damping) * loss;
            ring[write] = filtered;
            readPrevious = sample;
            write = (write + 1) % ringSize;
            const pickTransient = i < sampleRate * 0.004
                ? (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.001)) * 0.055
                : 0;
            output[i] = (sample * 0.72 + pickTransient) * velocity;
        }
        this.fadeTail(output, sampleRate, 0.08);
        return buffer;
    }

    private renderChord(context: AudioContext, voicing: Voicing, tuning: readonly number[]) {
        const sampleRate = context.sampleRate;
        // 使用 voicing.midi 中的实际音高，避免非标准调弦被误算。
        let noteCursor = 0;
        const entries = voicing.frets.map((fret, stringIndex) => fret === null ? null : {
            midi: voicing.midi[noteCursor++], stringIndex,
        }).filter((entry): entry is { midi: number; stringIndex: number } => entry !== null);
        const strumStep = Math.floor(sampleRate * 0.027);
        const rendered = entries.map((entry, index) => ({
            ...entry,
            offset: index * strumStep,
            buffer: this.renderString(context, midiToFrequency(entry.midi), entry.midi,
                0.72 + Math.sin(index * 1.7) * 0.035, entry.stringIndex),
        }));
        const tail = Math.floor(sampleRate * 0.32);
        const length = Math.max(...rendered.map(entry => entry.offset + entry.buffer.length)) + tail;
        const chord = context.createBuffer(2, length, sampleRate);
        const left = chord.getChannelData(0);
        const right = chord.getChannelData(1);
        const noteGain = 0.3 / Math.sqrt(Math.max(1, entries.length) / 4);

        rendered.forEach(entry => {
            const input = entry.buffer.getChannelData(0);
            const pan = (entry.stringIndex - 2.5) * 0.075;
            const angle = (pan + 1) * Math.PI / 4;
            const gains = [Math.cos(angle) * noteGain, Math.sin(angle) * noteGain];
            [left, right].forEach((output, channel) => {
                const gain = gains[channel];
                for (let i = 0; i < input.length; i++) output[entry.offset + i] += input[i] * gain;
            });
        });

        this.applySharedResonance(chord, entries.map(entry => entry.midi), tuning);
        return chord;
    }

    /** 共鸣弦与面板模态由完整和弦共同驱动，而非给每根弦各加一份混响。 */
    private applySharedResonance(buffer: AudioBuffer, chordMidi: number[], tuning: readonly number[]) {
        const sampleRate = buffer.sampleRate;
        const tones = new Set(chordMidi.map(pitchClass));
        const resonators: Resonator[] = [
            { frequency: 96, decay: 0.22, gain: 0.34, y1: 0, y2: 0 },
            { frequency: 196, decay: 0.18, gain: 0.22, y1: 0, y2: 0 },
            { frequency: 410, decay: 0.1, gain: 0.1, y1: 0, y2: 0 },
            ...tuning.filter(midi => tones.has(pitchClass(midi))).map(midi => ({
                frequency: midiToFrequency(midi), decay: 1.25, gain: 0.12, y1: 0, y2: 0,
            })),
        ];
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            const states = resonators.map(resonator => ({ ...resonator, y1: 0, y2: 0 }));
            const coefficients = states.map(resonator => {
                const radius = Math.exp(-1 / (sampleRate * resonator.decay));
                return { radius, a1: 2 * radius * Math.cos(2 * Math.PI * resonator.frequency / sampleRate) };
            });
            for (let i = 0; i < data.length; i++) {
                const input = data[i];
                let resonance = 0;
                states.forEach((state, index) => {
                    const { radius, a1 } = coefficients[index];
                    const output = input * (1 - radius) + a1 * state.y1 - radius * radius * state.y2;
                    state.y2 = state.y1;
                    state.y1 = output;
                    resonance += output * state.gain;
                });
                // 极轻饱和模拟面板与空气负载，同时控制多音叠加的尖峰。
                data[i] = Math.tanh((input * 0.9 + resonance) * 1.08) / 1.08;
            }
            this.fadeTail(data, sampleRate, 0.12);
        }
    }

    private fadeTail(data: Float32Array, sampleRate: number, seconds: number) {
        const fade = Math.min(Math.floor(sampleRate * seconds), data.length);
        for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade;
    }

    private createBodyImpulse(context: AudioContext) {
        const length = Math.floor(context.sampleRate * 0.3);
        const impulse = context.createBuffer(2, length, context.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            let low = 0;
            for (let i = 0; i < length; i++) {
                const t = i / context.sampleRate;
                const noise = Math.random() * 2 - 1;
                low = low * 0.82 + noise * 0.18;
                const modes = Math.sin(2 * Math.PI * (196 + channel * 3) * t) * 0.25
                    + Math.sin(2 * Math.PI * 410 * t) * 0.09;
                data[i] = (low * 0.72 + modes) * Math.exp(-t * 21) * 0.24;
            }
        }
        return impulse;
    }
}
