# AGENTS.md — lab 项目协作指南

本文件面向在本仓库中工作的 AI agent / 开发者，说明项目目的、硬性要求和迭代方式。README.md 有命令细节，先读它。

## 项目目的

`lab` 是一个**纯静态前端工具集**（转换工具、查询工具、可视化实验等），部署在 GitHub Pages（`docs/` 目录），线上 <https://lab.neetproject.com/>。
技术栈：Vue 3 + Vite 7 + TypeScript，UI 库 naive-ui，包管理 yarn 1（corepack）。

## 硬性要求（违反即返工）

1. **单页独立构建**：`yarn build <page>` 只允许生成/覆盖 `docs/<page>/`，绝不允许改动其他页面的产物、`docs/index.html`、`docs/sitemap.xml`、`docs/public/`。构建脚本已保证这一点，不要改成全量构建。
2. **产物纯静态可访问**：页面挂载在站点子路径下，JS/CSS/图片必须走相对路径（vite `base: './'` 已配置）。不要在代码里写死 `/src/...`、`/assets/...` 这类指向构建产物的绝对路径。
3. **docs/ 是产物目录**：只通过构建命令更新，不手改。未执行对应构建命令前，保持 docs/ 不变。
4. **无后端依赖**：不要引入需要服务端的能力。运行时允许依赖站点根的 `/public/...` 静态资源（已随仓库发布）和公共 CDN。
5. **head 不手改**：页面的 `<head>`（title/meta/基础样式）由 `scripts/page-html.mjs` 统一注入。SEO 信息写 `src/<page>/meta.json`，不要编辑 `index.html` 的 head。

## 页面结构约定

- 一个页面 = `src/<page>/` 一个目录：`index.html`（统一模板，从现有页面复制）+ `index.ts`（入口）+ 可选 `App.vue`、可选 `meta.json`。
- 入口惯例：Vue 页面用 `mountVue(App, withUI)`（`src/common/vue.ts`）；纯 canvas/WebGL 页面直接操作 DOM（参考 `src/cloud`、`src/rain`）。
- 共享代码放 `src/common/`（组件、gl 工具、loader 等），优先复用，不在页面间复制。
- `.glsl` 直接 `import frag from './frag.glsl'`（构建插件已按 raw 字符串处理）。
- 图片/字体等静态资源直接 import，vite 会自动产出到 `assets/`。
- `src/wasm/` 是 Vue2 遗留页面，未迁移，不要构建它；如需该功能，先按 Vue3 重写。
- 页面命名 camelCase，与线上路径一致（`https://lab.neetproject.com/<page>/`）。

## 迭代方式（新增/修改一个工具）

1. `yarn install`（首次）。
2. 开发：`yarn dev <page>`，浏览器打开终端提示的地址。
3. 验证构建：`yarn build <page> --out .temp/test/<page>`，确认产物 html 中资源为相对路径、功能依赖齐全。
4. 需要 SEO/被搜索引擎收录：补 `src/<page>/meta.json`（参考 `src/gradient/meta.json`），`canonical` 必须是 `https://lab.neetproject.com/<page>/index.html`。
5. 正式上线：`yarn build <page>`（覆盖 `docs/<page>/`），检查 `git status` 只包含该页面产物与源码改动。
6. commit 并 push（源码 + `docs/<page>/` 一起）。**不要顺手构建/提交无关页面**。
7. 新页面需要出现在全站索引时，额外执行 `yarn index && yarn sitemap` 并单独 commit 说明。

## 排障提示

- 构建报 `X is not exported`：多为依赖的 ESM/CJS 导出差异（参考 `src/font/Cell.vue` 对 opentype.js 的 `import * as` 写法）。
- dev 下访问 `/public/...` 由 `scripts/vite.mjs` 的中间件提供；线上由 `yarn copy-public` 同步，二者路径结构一致。
- 构建行为本身需要调整时，只改 `scripts/` 下的三个文件，保持各页面零感知。
