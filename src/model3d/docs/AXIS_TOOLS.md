# 绕轴旋转、车削与批量拉伸

## 绕轴旋转

- 选中一个或多个实体 Body、草图或形状后，高级工具区显示“绕轴”。入口与普通 Transform 旋转分离。
- 操作条提供全局 X/Y/Z 轴、角度和可选 Elevation。选中 Body 时默认使用最大平面作为轮廓，选中面时使用该面，选中封闭草图时使用草图；结果是生成新实体，不是旋转原模型。
- 角度和 Elevation 只更新视口预览，点击完成才生成新实体并写入一步撤销；原模型保留，取消不写 document。

## 车削

- 单个封闭草图或 Body 平面被选中时，高级工具区显示“车削”。草图必须位于显式平面，支持已有语义曲线和复合封闭轮廓；平面面片会转换为单一边界轮廓，原 Body 保留。
- 操作条提供草图内 X/Y 轴、角度和 Elevation。角度可超过 360°，Elevation 表示沿轴总升高并生成螺旋，与 Shapr3D Revolve 一致。整周轮廓允许跨轴，部分角度跨轴会提示调整。
- 轮廓不得跨过旋转轴，否则操作失败并保留原草图，避免几何内核静默裁掉负侧区域。
- `engine/modeling/Revolve.ts` 使用 Manifold CrossSection.revolve 和分段螺旋变换生成闭合实体，再映射回草图平面。完成后生成独立烘焙实体；草图来源会隐藏，Body 平面来源会保留。

## 多形状粗箭头批量拉伸

- 3D 模式选择多个封闭草图后，每个轮廓都显示自己的粗箭头和带符号距离输入。
- 拖动或输入任意一个箭头都会进入同一批量拉伸事务，所有选中封闭轮廓共享深度、方向、侧面和拔模参数。
- 批量拉伸继续沿用已有组合实体逻辑，不为每个箭头生成重复历史。开放轮廓的封闭区域检测保持单箭头行为。

## 选择提示

- 3D 提示统一显示 Command/Ctrl + 拖动框选多选；框选与 Command/Ctrl + 单击加选是不同操作。
- 绕轴和车削激活时，提示区显示对应轴向、预览和完成说明。

## 参考依据

- [Transform menu: Rotate Around Axis tool](https://support.shapr3d.com/hc/en-us/articles/7874421304092-Transform-menu-Rotate-Around-Axis-tool)：用于对照“变换”与“轮廓生成”的区别；本项目的绕轴入口明确采用生成流程。
- [Tools menu: Revolve tool](https://support.shapr3d.com/hc/en-us/articles/7874456570268-Tools-menu-Revolve-tool)：封闭草图或平面、轴、角度、Elevation、多圈螺旋。
