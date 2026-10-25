# 谱子编排模块

## 组件与文件

- `Arrangement.vue`：谱子库、节拍/BPM、小节拖放、节奏型、自动保存和 PNG 导出。
- `ChordEditor.vue`：四品六弦按法浮窗。每根弦可设置一个品位、空弦 `0` 或不按 `null`。
- `patterns.ts`：按节拍划分的拨弦/扫弦节奏型。每一步记录弦号、扫弦方向与闷音状态。
- `store.ts`：IndexedDB 封装，数据库 `acoustic-guitar-lab`，对象仓库 `arrangements`。
- `types.ts`：谱子、和弦、小节与节奏型的持久化类型。

## 数据与交互

默认四个空小节，网格每行四个，可继续追加。和弦按钮使用 `application/x-guitar-chord` MIME 拖入；触屏也可先点击和弦，再点击空小节。每个小节保存独立的和弦、实际调弦、按法 MIDI 与节奏型，不依赖之后切换的指板调弦。

`guitar:last-rhythm-pattern` 记录最近节奏型，默认 `53231323`。切换节拍时，不匹配的小节会切换到该拍号的默认型；匹配当前拍号的最近选择优先。

编辑采用 350ms 防抖自动保存，`guitar:current-arrangement` 记录最近打开的谱子 ID。写入前通过 JSON 深拷贝去除 Vue Proxy。删除有二次确认。

PNG 使用按需加载的 `html2canvas`，以 2 倍像素导出 `.sheet-paper`，导出时隐藏添加/删除按钮。采用 Blob URL 并挂载临时下载链接，兼容浏览器下载行为。

## 扩展节奏型

在 `RHYTHM_PATTERNS` 中使用 `pluck()` 或 `strum()` 添加即可。弦号遵循演奏习惯：1 弦为高音 E，6 弦为低音 E。`steps.length` 决定六线谱列数，应匹配拍号所需八分音符网格。
