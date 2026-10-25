import { midiToFrequency } from '../theory/chords';

interface PluckOptions {
    velocity?: number;
    stringIndex?: number;
    pan?: number;
}

/**
 * 扩展 Karplus–Strong：分数延迟 + 频率相关阻尼 + 拨片激励 + 琴体脉冲响应。
 * 全部离线生成短 buffer，无外部采样；参数与调音方法见 audio/README.md。
 */
export class GuitarSynth {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private dry: GainNode | null = null;
    private body: ConvolverNode | null = null;
    private buffers = new Map<string, AudioBuffer>();
    private active = new Set<AudioBufferSourceNode>();
    volume = 0.8;

    private ensureContext() {
        if (this.context) return this.context;
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const context = new AudioContextClass({ latencyHint: 'interactive' });
        const master = context.createGain();
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 14;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.2;
        master.gain.value = this.volume;
        master.connect(compressor).connect(context.destination);

        const dry = context.createGain();
        dry.gain.value = 0.9;
        dry.connect(master);
        const body = context.createConvolver();
        body.buffer = this.createBodyImpulse(context);
        const bodyGain = context.createGain();
        bodyGain.gain.value = 0.28;
        body.connect(bodyGain).connect(master);

        this.context = context;
        this.master = master;
        this.dry = dry;
        this.body = body;
        return context;
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
        const context = this.context!;
        const velocity = options.velocity ?? 0.85;
        const stringIndex = options.stringIndex ?? 3;
        const key = `${midi}:${Math.round(velocity * 4)}`;
        let buffer = this.buffers.get(key);
        if (!buffer) {
            buffer = this.renderString(context, midiToFrequency(midi), midi, velocity);
            this.buffers.set(key, buffer);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = 0.58;
        const panner = context.createStereoPanner();
        panner.pan.value = options.pan ?? (stringIndex - 2.5) * 0.075;
        source.connect(gain).connect(panner);
        panner.connect(this.dry!);
        panner.connect(this.body!);
        source.start();
        this.active.add(source);
        source.onended = () => {
            this.active.delete(source);
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
        };
    }

    async strum(midiNotes: number[]) {
        await this.resume();
        const base = this.context!.currentTime;
        // 由低音向高音的快速下扫；setTimeout 仅安排起音，音高始终由音频时钟采样。
        midiNotes.forEach((midi, index) => {
            window.setTimeout(() => this.pluck(midi, {
                stringIndex: index,
                velocity: 0.7 + Math.sin(index * 1.7) * 0.06,
                pan: (index - (midiNotes.length - 1) / 2) * 0.08,
            }), Math.max(0, base - this.context!.currentTime) * 1000 + index * 24);
        });
    }

    stopAll() {
        this.active.forEach(source => source.stop());
        this.active.clear();
    }

    private renderString(context: AudioContext, frequency: number, midi: number, velocity: number) {
        const sampleRate = context.sampleRate;
        const duration = midi < 48 ? 4.2 : midi < 64 ? 3.4 : 2.7;
        const length = Math.floor(sampleRate * duration);
        const buffer = context.createBuffer(1, length, sampleRate);
        const output = buffer.getChannelData(0);
        const period = sampleRate / frequency;
        const ringSize = Math.ceil(period) + 3;
        const ring = new Float32Array(ringSize);

        // 拨片激励：有限宽带噪声经梳状着色，比纯白噪声更接近指甲/拨片触弦。
        let previousNoise = 0;
        for (let i = 0; i < ringSize; i++) {
            const noise = Math.random() * 2 - 1;
            const pickPosition = 0.18;
            const comb = noise - 0.55 * previousNoise;
            previousNoise = noise;
            const envelope = Math.sin(Math.PI * i / ringSize) ** 0.7;
            ring[i] = comb * envelope * (0.75 + pickPosition * 0.25);
        }

        const decayTime = midi < 48 ? 3.1 : midi < 64 ? 2.35 : 1.7;
        const loss = Math.exp(-1 / (frequency * decayTime));
        // 高次谐波衰减更快；低弦保留略多明亮度以模拟铜缠绕弦。
        const damping = Math.min(0.58, 0.28 + frequency / 4200 - (midi < 48 ? 0.08 : 0));
        let readPrevious = 0;
        let write = 0;
        let pickTransient = 0;
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
            if (i < sampleRate * 0.006) pickTransient = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.0012));
            // 很轻的琴体低频冲击，避免合成音只有“线性感”的弦振动。
            const thump = Math.sin(2 * Math.PI * 105 * i / sampleRate) * Math.exp(-i / (sampleRate * 0.025));
            output[i] = (sample * 0.78 + pickTransient * 0.12 + thump * 0.018) * velocity;
        }
        // 防止缓存复用时尾音产生 click。
        const fade = Math.min(Math.floor(sampleRate * 0.08), length);
        for (let i = 0; i < fade; i++) output[length - 1 - i] *= i / fade;
        return buffer;
    }

    private createBodyImpulse(context: AudioContext) {
        const length = Math.floor(context.sampleRate * 0.34);
        const impulse = context.createBuffer(2, length, context.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            let low = 0;
            for (let i = 0; i < length; i++) {
                const t = i / context.sampleRate;
                const noise = Math.random() * 2 - 1;
                low = low * 0.82 + noise * 0.18;
                const modes = Math.sin(2 * Math.PI * (196 + channel * 3) * t) * 0.35
                    + Math.sin(2 * Math.PI * 410 * t) * 0.13;
                data[i] = (low * 0.8 + modes) * Math.exp(-t * 19) * 0.28;
            }
        }
        return impulse;
    }
}
