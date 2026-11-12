# Builder 3D WebMCP / 本地 Agent API

页面初始化项目库后注册 6 个工具域。支持 WebMCP 的浏览器通过 `navigator.modelContext` 调用；其他本地 agent 使用等价的 `window.model3dMCP`：

```js
const tools = window.model3dMCP.listTools();
const response = await window.model3dMCP.callTool('model3d_entity', { action: 'list' });
console.log(response.structuredContent);
```

所有工具返回 MCP 风格 `content` 和 `structuredContent`。业务失败返回 `isError: true`，不会把异常抛给 agent。页面还会派发 `model3d-mcp-ready`，`detail.mode` 为 `webmcp` 或 `local`。

## 工具域

| 工具 | action | 用途 |
| --- | --- | --- |
| `model3d_project` | `list/get/create/open/duplicate/rename/delete/save` | 项目列表、读取完整 document、创建、切换、副本、重命名、删除和保存 |
| `model3d_entity` | `list/inspect/select/update/delete` | 实体查询、选择、参数修改和删除；`inspect` 返回 `faceId`、法线、相邻面和边 |
| `model3d_sketch` | `create/update/delete/constrain` | 创建语义草图、更新轮廓、删除和应用约束 |
| `model3d_generate` | `primitive/extrude` | 直接参数化生成立方体/圆柱/球/圆锥/圆环，或将封闭草图拉伸为实体 |
| `model3d_tool` | `shell/boolean/offsetFace/rotateAxis/revolve` | 封闭或开口抽壳、布尔运算、完整平面推拉、全局轴旋转偏移和草图车削 |
| `model3d_history` | `undo/redo` | 撤销和重做 |

所有长度使用当前项目 `lengthUnit`。默认草图平面为 **XZ、Y-top（+Y 向上）**，局部 `u=+X`、`v=-Z`；草图 `profile.points` 使用所属平面的二维局部坐标，不是世界三维坐标。修改会进入与手工操作相同的场景同步、自动保存和撤销流程。

## 示例：草图拉伸、检查面并抽壳

```js
const sketch = await model3dMCP.callTool('model3d_sketch', {
  action: 'create',
  profile: {
    type: 'rectangle',
    points: [[0, 0], [40, 0], [40, 20], [0, 20]],
  },
});
const profileId = sketch.structuredContent.id;

await model3dMCP.callTool('model3d_generate', {
  action: 'extrude', profileId, depth: 10,
});

const body = (await model3dMCP.callTool('model3d_entity', { action: 'list' }))
  .structuredContent.entities.find((entity) => entity.kind === 'extrude');
const inspection = await model3dMCP.callTool('model3d_entity', {
  action: 'inspect', id: body.id,
});
const top = inspection.structuredContent.faces.find((face) => face.normal[1] > 0.99);

await model3dMCP.callTool('model3d_tool', {
  action: 'shell',
  faceIds: [{ entityId: body.id, faceId: top.id }],
  thickness: 2,
});
```

## 示例：直接生成封闭空心实体

```js
const created = await model3dMCP.callTool('model3d_generate', {
  action: 'primitive', kind: 'box', width: 40, height: 30, depth: 20,
});
await model3dMCP.callTool('model3d_tool', {
  action: 'shell', entityId: created.structuredContent.id, thickness: 2,
});
```

不传 `faceIds` 时保留全部外面；传入后只在这些面开口。相邻面的连接规则与界面手工操作一致。

## 示例：面推拉与布尔

```js
await model3dMCP.callTool('model3d_tool', {
  action: 'offsetFace', entityId: body.id, faceId: top.id, distance: 5,
});
await model3dMCP.callTool('model3d_tool', {
  action: 'boolean', operation: 'union', operandIds: [bodyA.id, bodyB.id],
});
```

`offsetFace.distance` 以选中面的外法线为正方向，作用于完整逻辑平面区域。

## 草图参数

- `planeId` 复用已有平面；省略时通过 `plane: { kind, origin, normal, u, v }` 创建，默认 XZ 原点平面、Y-top（+Y 向上），`u=+X`、`v=-Z`。
- `profile.type` 支持 `polygon/rectangle/circle/ellipse/regular/line/arc`。
- 圆使用 `[center, circumference]`；椭圆使用 `[center, majorAxis, minorAxis]`；正多边形使用 `[center, vertex]` 并传 `sides`。
- `constrain` 接收 `constraint`、`edges: [{ entityId, index }]` 和可选 `shapeIds`，支持现有方向、平行、正交、等长、固定长度、相切和同心规则。

## 拓扑与事务约定

- 拓扑编辑后面 ID 可能变化；每次后续操作前重新调用 `model3d_entity.inspect`，不要长期缓存旧 `faceId`。
- 一个建模工具调用对应一个用户可见事务；Shell 内部预览不会逐次写入历史。
- 项目和模型数据只保存在当前浏览器 IndexedDB，不上传服务器。
- 当前 API 不包含文件导入/导出、网格文件传输、圆角/倒角和视口鼠标手势；这些可继续通过界面操作。

## 示例：绕轴与车削

```js
await model3dMCP.callTool('model3d_tool', {
  action: 'rotateAxis', operandIds: [bodyA.id], axis: 'y', angle: 360,
});
await model3dMCP.callTool('model3d_tool', {
  action: 'revolve', profileId, axis: 'x', angle: 720, offset: 20,
});
```

绕轴和车削都通过轮廓生成新实体并保留原模型；`offset` 对应 Elevation 总升高，角度可超过 360°，整周允许跨轴。Body 默认使用最大平面，平面面片可传 `faceIds`。
