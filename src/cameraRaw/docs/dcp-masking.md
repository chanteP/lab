# DCP 与蒙版实现

## DCP

- `profiles/` 内置 21 个索尼 DCP，全部直接来自 RawTherapee；来源和许可见 `THIRD_PARTY_NOTICES.txt`。
- 下拉分为“无 / 当前相机 / 所有 DCP”。当前相机按规范化机型匹配，Sony 带 A 后缀的改款机身回退到基础机型；其他组不会重复展示当前相机组中的项目。
- 用户导入的 DCP 保存到 IndexedDB `lab:cameraRaw` 的 `profiles` store。预设也迁移到同一数据库，旧 `camera-raw-lab` 仅在空库时读取并复制，不删除旧数据。
- `engine/dcp/parser.ts` 校验 TIFF/DCP 目录、偏移、表维度和数据长度，解析双矩阵、双光源、ToneCurve、HueSatMap、LookTable 与 BaselineExposureOffset。
- 当前渲染以 LibRaw 已转换的显示空间输出为输入，因此不再重复应用相机空间矩阵。GPU 使用 1D tone LUT 和 3D HSV 色彩表，色相循环，饱和度/明度钳制；这不是 ACR 的逐像素复刻。
- DNG 导出通过 tag 50933 (`ExtraCameraProfiles`, IFD type 13) 保留原始 profile entries。普通 Linear DNG 使用 LibRaw 回读测试；带 ExtraCameraProfiles 的文件验证 IFD、profile name 和 EXIF。当前 LibRaw 不支持回读带此扩展的 Linear DNG。
- 不写回 ARW 等原始文件。DCP 旁的黄色警告说明这一限制；DCP 不可用时，DNG 导出需要选择“放弃 DCP 并导出”或取消。

## 蒙版

首版实现 Camera Raw 蒙版的基础非 AI 工作流：

- 画笔、线性渐变、径向渐变；添加/减去组件、反相、显隐、复制、删除、重命名。
- 画笔大小、羽化、流量、密度；渐变羽化；径向中心与两轴尺寸、线性端点编辑。
- 蒙版强度和红色叠加。画布支持指针绘制，也支持聚焦后 Enter/Space 创建默认形状。
- 每个蒙版具有独立基本、曲线、效果、颜色分级、混色和校准参数，与全局调整复用 `AdjustmentControls`；蒙版不提供预设和光学。局部参数作为中性值增量合成，曲线按 base→local 顺序复合，多个蒙版依次应用。
- 预览与 JPEG/DNG 导出共用 `RawRenderer`，不是只画 UI 覆盖层。
- 线性/径向渐变使用浮点 `smoothstep` 计算覆盖率，通过单通道 `R16F` 纹理采样，避免透明 RGB 插值和 8-bit 蒙版纹理造成接缝与色带；画笔仍使用 Canvas 羽化。
- 红色叠加和画笔/渐变参考线只在蒙版主面板且对应蒙版可见时显示。拖动蒙版滑杆、曲线或色轮时暂时隐藏，指针释放后恢复；导出始终不绘制叠加。
- 全局和蒙版均按当前调整子面板复位。全局标题栏眼睛临时隐藏当前子面板效果，蒙版标题栏眼睛临时隐藏全部蒙版；单个蒙版行上的眼睛控制该蒙版及其参考线。原始参数不变；存在隐藏项时，JPEG/DNG 导出需确认，并按隐藏后的参数渲染。

Adobe 的主体、天空、背景、人物、物体等 AI 选择，以及颜色/亮度/深度范围和组件交集不在首版中。
