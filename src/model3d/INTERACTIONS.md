# Form 3D 交互与数据约定

本文档记录当前画布、实体树和视图辅助交互。新增工具时应同步更新本文和相关代码分区注释。

## 全局

- 页面内禁用浏览器右键菜单；实体树的右键事件单独处理，不被浏览器菜单覆盖。
- 禁用 Ctrl / Command + 滚轮、触控板手势和键盘快捷键造成的浏览器页面缩放。普通滚轮仍用于 Three.js 相机缩放。
- 空白新项目不自动创建任何实体。
- 所有数值输入最多展示 4 位小数。测量和比例尺是辅助显示，使用最多 2 位小数。

## 实体树

实现：`EntityTree.vue`、`App.vue` 中的 `treeNodes`、`reparentNodes` 和节点菜单方法。

- 文件夹和实体共享同一套 `id / parentId` 父节点数据。实体也可以包含子节点，文件夹不是唯一容器。
- 单击选择，Ctrl / Command / Shift + 单击多选。可见性按钮只作用于实体。
- 节点可单个或多个拖到另一个节点下；拖入空白树区域会移动到根节点。
- 拖入自身或自己的后代会被拒绝，避免循环树。
- 文件夹和实体的右键菜单均提供删除、重命名。
- 删除文件夹不会删除其中的模型；其子节点会移到根节点。删除实体会同时检查布尔引用。
- 实体始终使用 cube 图标，文件夹始终使用 folder 图标，不随模型类型变化。

## 平面与草图

实现：`SketchPlane`、`Viewport.sketchPoint / sketchWorld / updateSketch`、`geometry.ts` 的平面重建逻辑。

- 新草图必须关联显式平面。可通过工具栏添加 XZ、XY 或 YZ 坐标平面，并输入法向偏移。
- 草图点保存为平面局部 `(u, v)`，不是世界坐标，也不是渲染网格顶点。
- 视口拾取时将射线与平面的世界交点转换成 `(u, v)`；预览和拉伸重建时再转换回世界坐标。
- 单击添加点，拖动顶点调整位置，选中顶点后输入局部坐标可精准编辑，厚度可随时输入。
- 选中已有拉伸实体后进入草图工具，可继续编辑原轮廓。
- 没有 `planeId` 的旧项目草图保留原始 XZ 映射，确保历史项目兼容。

## 选择与相机

实现：`Viewport.onPointerDown`、 `OrientationGizmo.ts`。

- 选择工具下，无论从空白还是模型表面开始拖动，都可以旋转视角；单击仍用于选择。
- 空格 + 拖动平移，普通滚轮缩放。
- 坐标球点击轴端点切换对应方向视图，拖动坐标球旋转相机。
- 拖动坐标球接近主轴时，以点积阈值 `0.975` 磁吸到该轴，保持当前轨道半径。
- 坐标球渲染 viewport 比画布底部抬高 42px，与比例尺共享基线。

## 测量

实现：`Viewport.setMeasureMode` 及 `Measurement mode` 分区。

1. 点击尺子进入 measure 模式，图标保持选中状态。
2. hover 第一个面时使用绿色三角形面高亮；点击后记录世界坐标点。
3. hover 第二个面时使用橙色高亮；点击后生成尺寸标注。
4. 两个点之间绘制总距离双箭头，并显示毫米距离。
5. 非零 X / Y / Z 分量分别使用红 / 绿 / 蓝双箭头和距离标签；零分量不创建标注。
6. 第三次点击清除全部测量标记，退出 measure 模式并取消图标选中状态。切换其他工具也会退出测量。

测量标记只存在于渲染辅助层，不写入项目模型数据。

## 比例尺与适配视图

实现：`Viewport.updateScaleBar`、`fitBox / fit`。

- 比例尺按相机到 orbit target 的距离、垂直 FOV 和画布像素高度，实时估算视图中心的 `mm / pixel`。
- 标尺目标长度约 76px，数值采用 `1 / 2 / 5 × 10ⁿ` 的易读序列，最多两位小数，单位为 mm。
- 点击 scale 图标时保持当前相机方向，仅沿该方向调整距离并居中模型。
- 适配动画时长 420ms，使用三次 ease-out；用户开始新的画布操作会取消动画。

## 投影

- 地面阴影默认关闭，不随项目保存。
- 右上角“投影”开关只控制阴影接收平面、方向光投影和 shadow map，不改变网格或相机投影方式。

## 选择驱动的 UI 状态机

实现：`App.vue` 的 `uiState`、`operation`、`startExtrude / applyBoolean / editHistory`。

- `Default`：无选择，显示完整 Sketch、Construct、Transform、Tools 和布尔入口。
- `Sketch`：平面草图上下文，显示 Line、Rectangle、Circle、Arc，另一侧保留视图和约束扩展位置。
- `SelectionAdaptive`：Items 或画布选择变化后的推荐状态。
- `ToolActive`：Extrude、Offset Face、Chamfer/Fillet 或 Boolean 正在预览；显示参数、Done、Cancel。
- `HistoryEdit`：从 History 重新打开已有 Extrude/Boolean，引用和参数在提交后写回同一实体。

Tool-first 与 Selection-first 均可进入核心工具。闭合 Profile、实体面、实体边、Body 分别触发 Extrude、Offset Face、Chamfer/Fillet、Move/Rotate。双击画布中的面选择完整 Body。

## Profile 与草图工具

实现：`profiles.ts`。草图与 Body 是不同的 Items。

- Line/Polygon：逐点放置，闭合后可用于 Extrude。
- Rectangle：两个对角点生成四个源顶点。
- Circle：源数据始终是圆心和圆周点，预览/导出时才细分。
- Arc：源数据始终是起点、经过点和终点；开放圆弧只生成线，不形成可拉伸 Profile。
- Exit Sketching 只退出草图并生成 Profile；它不是 Extrude 的 Done。
- 选中已有 Profile 可重新进入草图或 History；修改 Profile 后，引用它的 Extrude 自动重建。
- Normal to Sketch 使用当前平面法向恢复正视；进入 Extrude 后返回三维透视方向。

## Extrude

- 选择闭合 Profile 后出现方向 ArrowHelper、距离标签和实时实体预览。
- 拖动 Profile/箭头方向或输入距离都会更新同一 `depth` 参数。
- 支持正向/反向、One-Sided/Symmetric、Draft Angle。
- Result 支持 New Body、Union、Subtract、Intersect；相交 Body 会作为自动布尔建议，用户可覆盖目标和结果。
- 点击画布尺寸标签聚焦距离输入；空白提交和 Done 等价，Esc/Cancel 恢复执行前文档。
- 导出只包含 Body，不把辅助 Profile 面写入 STL/GLB。

## Offset Face 与 Chamfer/Fillet

- Offset Face 修改既有实体的尺寸/位置，不从 Profile 创建实体。
- Chamfer/Fillet 有明确类型入口和尺寸输入，拖动时持续重建预览；与 Extrude 的方向、距离和布尔参数不共享。

## Boolean 执行态与 History

- 两个 Body 进入 Union/Subtract/Intersect 后，首先生成可取消的预览结果。
- 紫色表示 Target，蓝色表示 Tool；Subtract 默认第一个为 Target，Union 默认最后选择的 Body 为 Target。
- “交换 Target / Tool”会真正交换 `operands`，不是只改变标签。
- 保留 Target、保留 Tool 在 Done 时分别应用；Cancel 恢复执行前文档。
- History 可重新打开 Boolean，切换类型、交换角色和修改保留策略。

## 默认工具栏与绘制工具栏

- 默认菜单只保留选择/变换、添加绘制平面、绘制形状和项目节点操作；Extrude、Offset Face、Chamfer/Fillet 不在这里重复出现。
- 添加平面不显示确认弹窗：无面选择时直接创建 XZ 平面；选中模型面后创建同法向平面，示意中心对齐该面的中心。
- 平面是 Items 中的独立对象，支持点击选择、眼睛显隐、Move/Rotate Gizmo；Scale 对平面禁用。
- 平面变换写回 `origin / normal / u / v`，附着草图按局部坐标随动。绘制射线使用无限 Plane，80mm 网格仅是示意。
- 只有当前选中的绘制平面才启用铅笔。进入后相机正对平面并以平面原点为中心。
- 默认工具栏向左收起，带文字的画图工具栏向右进入；Close 保存有效闭合形状或退出未完成绘制。

## 绘制形状与贝塞尔编辑

实现：`profiles.ts`、`Viewport.updateSketch` 和 App 的 sketch drag/handle 回调。

- Line/Arc：逐点连接或直接拖出一条线。点击线段生成两个三次贝塞尔控制点，拖动控制点将线段改为曲线；虚线显示控制链。
- 矩形：中心/角定义的实际实现对角两击或拖拽生成四个轴对齐顶点。
- 圆：圆心 + 圆周点；两点或拖拽创建，圆心到圆周使用虚线辅助半径。
- 椭圆：圆心 + X 半径点 + Y 半径点；拖拽时以起止点两个分量生成三个源点。
- 正多边形：中心 + 外顶点 + 边数，支持正三角形、正方形、正五至正八边形。
- 所有闭合形状显示半透明填充。源点、曲线控制点、边数与 `planeId` 一并保存，选中平面可继续编辑。
- 双击不再隐式提交草图，Close、完成当前图形和后续实体操作保持不同语义。

## 显隐与底部辅助图标

- 所有 Items（实体、文件夹、平面）都有眼睛。文件夹显隐递归应用到整个子树。
- 测量使用带刻度的 ruler 图形。测量和适配按钮不显示底板，激活状态仅通过图标颜色表达。
