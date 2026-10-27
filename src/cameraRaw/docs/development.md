# Camera Raw Lab：功能调研与实现计划

## 基线与约束

界面以 Photoshop Camera Raw 的暗色工作台为基线：顶部工具栏、中央画布、右侧直方图与编辑面板、底部横向胶片栏。所有解析、调整和导出均在浏览器本地完成，不上传照片。

- RAW：LibRaw WASM，Worker 内解码；JPEG/PNG 使用浏览器解码。
- 调色：WebGL2，线性光空间处理；CPU 参考实现和 GLSL 共用参数定义。
- 非破坏编辑：每张图片持有独立参数，多选可同步参数。
- 保存：导出已调整的 16-bit RGB Linear DNG，并写入 XMP 参数与可映射 EXIF；不修改原始传感器文件。
- 导出：全分辨率 JPEG，JPEG 原图的 APP1 EXIF 字节原样保留；其他来源写入可映射 EXIF。
- 自动镜头 profile 需要镜头数据库。首版提供畸变、色差、暗角的手动校正，不将手动校正标为 profile 校正。

## 功能与开发顺序

1. 参数 schema、曲线 LUT、白平衡、校准矩阵、HSL/分离色调 CPU 参考实现与 spec。
2. LibRaw Worker、普通图片导入、元数据读取、胶片栏及多选状态。
3. WebGL2 渲染器、直方图、原图/调整后/分屏比较、全分辨率导出。
4. Camera Raw 布局、基本/曲线/混色/颜色分级/校准/光学面板。
5. XMP 预设导入导出、DNG/JPEG 写出、批量同步与键盘操作。
6. 浏览器端真实交互检查、独立页面构建、部署产物检查。

## 输入 / 输出测试

| 模块 | 输入 | 必须成立的输出 |
| --- | --- | --- |
| 默认值 | 任意合法图片 | 与原图一致，曲线端点固定，直方图有效 |
| 白平衡 | 色温/色调非零 | 对应通道增益改变，灰阶仍有限且不归一化丢失 |
| 明暗 | 曝光、对比、高光、阴影、黑白场 | 输出在 0..1；曝光单调；默认为零变化 |
| 曲线 | RGB/R/G/B 多点、拖动、删点 | 端点固定、输出单调、通道独立、越界点被规范化 |
| HSL | 8 色相的 hue/saturation/luminance | 目标色变化，远离色相如期不变，无 NaN |
| 颜色分级 | 阴影/中间调/高光色轮 | 对应亮度区间响应，零饱和时色轮不改变颜色 |
| 校准 | 阴影色调、RGB 原色 hue/saturation | 各原色独立响应，默认矩阵为单位矩阵 |
| 光学 | 畸变、色差、暗角 | 坐标有限，中心不漂移，默认采样原坐标 |
| 预设 | Camera Raw `.xmp` / 本工具 `.xmp` | 已知 crs 字段映射，未知字段忽略，可往返导出 |
| 元数据 | JPEG EXIF APP1、EXIF 对象 | JPEG 原 APP1 完整复制；DNG/JPEG 保留常用拍摄/GPS 字段 |
| 导出 | 当前图片与当前参数 | 全分辨率 JPEG；16-bit 三通道 DNG；正确扩展名和 MIME |

构建脚本发现 `src/<page>/**/*.spec.ts` 时，先 bundle 并执行 Node 测试，再执行 Vite 构建。

## 实现记录

- `engine/`：参数默认值、单调三次曲线、CPU 色彩参考实现、WebGL2 shader 和全分辨率渲染器。
- `io/raw.ts` + `raw.worker.ts`：LibRaw 元数据、内嵌预览、按需全尺寸解码。WASM 地址由 Vite 显式生成，开发和生产均使用同一相对产物。
- `io/preset.ts`：映射基本调整、四点曲线通道、8 色 HSL、现代/旧版颜色分级和校准字段。
- `io/dng.ts`：little-endian TIFF/DNG 容器，16-bit 三通道 LinearRaw、sRGB 对应的色彩矩阵、EXIF/GPS IFD 和 XMP。测试中使用真正的 LibRaw 再解码，而非只检查文件头。
- `io/metadata.ts` / `export.ts`：JPEG APP1 原字节保留；RAW/PNG 来源导出 JPEG 时映射常用拍摄和 GPS 字段。
- `store.ts`：当前图、选区、批量同步、按需解码与对象 URL 生命周期。Ctrl/Cmd 多选保留同步源。
- `io/webmcp.ts`：注册 WebMCP 工具，并暴露相同的 `window.cameraRawMCP` 本地 agent 调用入口。详见 `docs/webmcp.md`。
- 桌面为一屏工作台；窄屏右栏作为可开关抽屉，胶片栏保持横向滚动。

## Changelog

- 2026-10-27：建立功能矩阵、渲染/文件格式方案和模块级测试约定。
- 2026-10-27：完成 RAW Worker、WebGL2 调色、直方图/对比视图、XMP、DNG/JPEG 导出、多选胶片栏与响应式界面；加入 LibRaw 回读及批量同步测试。
- 2026-10-27：修正普通图片纹理方向；预览区加入指针中心滚轮/触控板缩放、空格/触摸拖动，禁用浏览器缩放和右键；原图/对比移入胶片工具横条。
- 2026-10-27：分离图片与曲线 LUT 的纹理翻转状态，修复曲线通道错位；加入逐图撤销/恢复、混色 HSL Tab、颜色渐变滑杆和 WebMCP/本地 Agent 工具。
