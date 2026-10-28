# model3d 重构方案

## 目标与边界

本次重构只调整职责归属、组件复用和可维护性，不改变项目数据格式与既有建模语义。几何引擎继续使用 Three.js，Vue 组件不直接承担几何算法。

## 分层方案

1. **数据与引擎层**：`types/` 定义文档契约，`stores/` 负责持久化，`engine/` 负责几何、草图边框、相机与导出。
2. **状态层**：`composables/` 管理跨组件状态。当前已拆出全局单位和撤销历史，后续按业务边界迁移，不为每个小函数额外建文件。
3. **组件层**：
   - `layout` 处理顶栏和项目侧栏；
   - `modeling` 处理建模工具容器；
   - `sketch` 处理草图具体工具；
   - `entity` 处理实体树；
   - `ui` 提供无业务状态的通用按钮、菜单和图标。
4. **配置层**：`const.ts` 保存规范常量，`configs.ts` 保存可配置选项，`colors.ts` 统一颜色。配置必须有用途注释并由实际代码引用。
5. **文档层**：`AGENTS.md` 是目录依据，`DEV.md` 是交互约定，本文件记录结构与变更历史。

## App 编排原则

App 可以保留跨组件的建模操作状态，但顶栏、实体侧栏、建模工具条、草图工具条和约束区不再重复维护模板。通用 UI 不直接访问 document 或 Viewport，统一通过 props/emits 通信。

## 可访问性与样式

新增组件使用 scoped SCSS、原生 button、可见焦点样式和 aria-label。既有全局样式逐步收敛，不在一次重构中做无关视觉重排。

## Changelog

- 2026-10-28：建立 engine/types/stores/config/utils 分层；抽出 useUnits、useUndoHistory；新增 ToolButton、MenuCommand、AppTopBar、EntitySidebar、ModelingToolbar、SketchToolbar、SketchConstraints；拉伸完成后隐藏原草图平面；退出草图仅图标使用红色背景。
