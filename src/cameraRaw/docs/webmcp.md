# Camera Raw WebMCP / 本地 Agent API

页面加载后注册 7 个工具。支持 WebMCP 的浏览器通过 `navigator.modelContext` 获取；其他本地 agent 可执行 `window.cameraRawMCP.callTool(name, args)`。所有工具返回 MCP 风格的 `content` 和 `structuredContent`，失败时 `isError=true`。

| 工具 | 用途 |
| --- | --- |
| `camera_raw_load` | 从 base64 文件或 URL 批量加载 RAW/JPEG/PNG |
| `camera_raw_list` | 列出图片、当前图片和选区 |
| `camera_raw_select` | 按 id/文件名切换，设置多选 |
| `camera_raw_adjust` | 执行全部调色参数，可合并或替换，并同步多选 |
| `camera_raw_history` | undo / redo / reset |
| `camera_raw_preset` | 应用或导出 Camera Raw XMP/JSON 预设 |
| `camera_raw_export` | 导出 JPEG、DNG、XMP，返回 base64/文本，可选浏览器下载 |

```js
const agent = window.cameraRawMCP;

await agent.callTool('camera_raw_load', {
  files: [{ name: 'photo.arw', mimeType: 'image/x-sony-arw', data: base64 }],
});

await agent.callTool('camera_raw_adjust', {
  adjustments: {
    exposure: 0.8,
    temperature: 12,
    curves: { rgb: [{ x: 0, y: 0 }, { x: 0.5, y: 0.58 }, { x: 1, y: 1 }] },
    mixer: { blue: { hue: -15, saturation: 20, luminance: -5 } },
    calibration: { redHue: 5, blueSaturation: 15 },
  },
});

const preset = await agent.callTool('camera_raw_preset', { action: 'export' });
await agent.callTool('camera_raw_preset', { action: 'apply', xmp: preset.structuredContent.xmp });

const jpg = await agent.callTool('camera_raw_export', {
  format: 'jpeg', quality: 0.94, download: false,
});
// jpg.structuredContent.data 为 base64，name/mimeType/size 描述导出文件。
```

URL 加载受浏览器 CORS 限制。任意本地路径需要先由 agent 读取并转成 base64，浏览器页面不能直接读取用户未授权的本地路径。

Agent 通过 `camera_raw_preset` 应用的预设也会以 `Agent` 来源写入 IndexedDB，与界面导入和手动保存的预设显示在同一个预设面板中。
