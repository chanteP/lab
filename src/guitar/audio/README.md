# 钢弦音色模块

`GuitarSynth.ts` 是唯一发声入口，不依赖 Vue。单音接收 MIDI 与实际弦序号；和弦接收完整 `Voicing` 和当前调弦。音高计算位于 `theory/chords.ts`。

## 模型与理论

核心是 **扩展 Karplus–Strong 弦振动模型**：拨弦产生宽频激励，在约一个基频周期的延迟线中循环；每轮高频损失略多，因此起音明亮、余音逐渐变暖。

实现参考 Stanford CCRMA 的物理建模资料：

- [The Karplus-Strong Algorithm](https://ccrma.stanford.edu/~jos/pasp/Karplus_Strong_Algorithm.html)
- [Extended Karplus-Strong Algorithm](https://ccrma.stanford.edu/~jos/pasp/Extended_Karplus_Strong_Algorithm.html)
- [Commuted Synthesis](https://ccrma.stanford.edu/~jos/pasp/Commuted_Synthesis.html)：弦、琴桥与琴体可拆分建模，琴体响应可独立处理。

当前包括：

- 分数延迟线性插值，避免整数延迟造成音高偏差。
- 按音高及缠绕/非缠绕弦调整的频率相关阻尼。
- 由拨片位置决定的梳状激励与短促拨片瞬态。
- 独立面板模态（96/196/410Hz）、轻量饱和与双声道卷积琴体响应。
- 与当前调弦一致、由实际声音驱动的共鸣弦二阶谐振器，而非额外播放固定正弦音。

## 为什么和弦使用一个 AudioBuffer

旧方式对每个音分别创建 source、gain、panner，再用定时器错开起音。这样会让多条音频链分别经过动态和琴体处理，容易显得硬、散，且定时器不掌握采样级时序。

现在 `renderChord()` 会：

1. 按六弦到一弦，以 27ms 采样偏移写入扫弦，不再使用 `setTimeout`。
2. 按实际弦序设置音色、力度与立体声声像，先混合为一个立体声 Buffer。
3. 用这份完整信号共同激励共鸣弦及琴体模态，最后统一轻饱和和尾音淡出。
4. 只创建一个 `AudioBufferSourceNode` 播放；缓存键包含实际音高、指法和调弦。

因此共鸣是和弦整体的一部分，而不是若干独立音符各自附带的效果。

## 调参顺序

1. **延音**：`renderString` 的 `decayTime`。
2. **明暗**：`damping`，越大高频衰减越快；建议先调它再调激励。
3. **拨片硬度/位置**：`pickDelay`、`0.62` comb 系数和 `pickTransient`。
4. **共鸣**：`applySharedResonance` 中共鸣弦的 `gain/decay`；先保持较低增益，避免浑浊。
5. **琴体**：96/196/410Hz 模态与 `createBodyImpulse`，最后调整 `bodyGain` 和 compressor。
6. **扫弦**：`renderChord` 的 `strumStep` 与 `noteGain`。

`slap()` 使用独立的短噪声触弦、弦面 click 和 92Hz 面板冲击模型，不含和弦音高，供谱面拍弦步进调用。

输出端在 compressor 后接入 `AnalyserNode`，`AudioVisualizer.vue` 用全屏 Canvas 和 `requestAnimationFrame` 以 60fps 上限读取实际时域波形；未发声时仅绘制低对比度环境细线。

所有采样均在本机生成并缓存，无网络音频资源。`resume()` 必须由用户手势触发。若继续升级，可加入双向波导、按把位改变有效弦长、按弦噪声，或以实测民谣吉他 IR 替换合成琴体响应；保持 `pluck()` / `strum()` API 即可。
