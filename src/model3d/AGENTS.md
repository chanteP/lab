# model3d 目录与协作约定

本目录遵循仓库根 `AGENTS.md`、用户级 `DEV.md` 和本目录 `DEV.md`。重构目标是按职责拆分，不把几何、状态、配置和全部模板继续堆入 `App.vue`。

## 目录依据

| 目录 | 职责 | 放置规则 |
| --- | --- | --- |
| `components/layout/` | 整体框架组件 | 顶栏、项目/实体侧栏等页面框架，不含几何算法 |
| `components/modeling/` | 业务功能容器 | 建模工具栏、工具面板等组合多个通用控件的业务容器 |
| `components/sketch/` | 具体草图业务组件 | 草图工具、约束、形状编辑等独立功能组件 |
| `components/entity/` | 实体业务组件 | 实体树及其节点交互 |
| `components/ui/` | 通用 UI 组件 | ToolButton、MenuCommand、SvgIcon 等无项目状态的可复用控件 |
| `composables/` | 可复用状态与事件逻辑 | 单位、撤销历史、项目状态等 Vue 组合式逻辑 |
| `engine/` | 几何与渲染引擎 | Viewport、几何构建、轮廓、裁剪、坐标系和导出，不放 Vue 模板 |
| `stores/` | 持久化数据访问 | IndexedDB/localStorage 读写，保持既有数据兼容 |
| `types/` | 类型工具与数据契约 | ModelDocument、实体、单位、共享接口 |
| `config/const.ts` | 写死的规范常量 | 存储 key、阈值、固定像素值；注释说明用途 |
| `config/configs.ts` | 可配置参数与列表 | 单位、边数、导出质量、显示模式等选项；注释说明用途 |
| `config/colors.ts` | 统一色表 | 几何和草图颜色，不在各模块重复定义 |
| `utils/` | 无状态工具函数 | ID 等独立小工具，不放 Vue 状态 |
| `styles/` | 页面遗留全局样式 | 新组件样式不得继续添加到这里 |
| `docs/` | 架构方案和 changelog | 重构依据、集成方案及每次变更记录 |

## 组件与状态

- `App.vue` 只编排框架、业务组件和 composables，以及跨组件的建模流程；新 UI 区块优先拆组件。
- 通用 UI 通过 props 接收显示状态、通过 emits 通知事件，不直接读写项目 document 或 Viewport。
- 新/修改 Vue 组件样式统一 `<style lang="scss" scoped>`；按钮使用原生 `button`，纯图标按钮补 `aria-label`，保留焦点样式。
- 共享状态优先 composable；优先 VueUse，避免重复手写 DOM/生命周期逻辑。
- 常量与配置必须带注释并集中引用，不为“集中化”而增加无意义的抽象。

## 验证与交付

- 默认不启动本地 serve，执行 `yarn build model3d` 后 commit、push。
- 只提交 `src/model3d/` 与 `docs/model3d/`，不构建或修改其他页面。
- 关键流程和目录变化同步更新 `docs/REFACTOR.md` 文末 changelog。
