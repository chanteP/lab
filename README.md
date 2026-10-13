# lab

chanteP 的前端实验室 / 工具集，托管在 GitHub Pages（`docs/` 目录），线上地址 <https://lab.neetproject.com/>。

每个页面是一个**独立构建、独立部署**的前端小工具（转换工具、查询工具、可视化实验等），技术栈 **Vue 3 + Vite + TypeScript**。

## 目录结构

```
src/
  <page>/        # 一个页面 = 一个目录
    index.html   # vite 入口 html（模板固定，head 由构建插件统一注入）
    index.ts     # 页面入口，通常 mountVue(App)
    App.vue      # 页面组件（可选，canvas 类页面可没有）
    meta.json    # 可选，SEO meta（title/description/og:*/canonical...）
  common/        # 页面间共享的组件与工具（mountVue、FileDrop、gl 工具等）
  wasm/          # legacy：Vue2 时代遗留，未迁移，不参与构建
scripts/
  lab.mjs        # 站点 CLI（dev/build/index/sitemap/copy-public/serve）
  vite.mjs       # vite 配置工厂与插件（glsl raw、head 注入、/public 中间件）
  page-html.mjs  # 页面 <head> 统一生成
public/          # 不经构建的静态资源，copy-public 同步到 docs/public/
docs/            # 构建产物 + 站点根（GitHub Pages 源），已提交进仓库
```

## 常用命令

包管理用 yarn（corepack 自动提供）：

```bash
yarn install

# 开发单个页面（带热更新）
yarn dev <page>

# 构建单个页面：只生成/覆盖 docs/<page>/，不碰其他任何产物
yarn build <page>

# 构建到自定义目录（验证用，不污染 docs/）
yarn build <page> --out .temp/test/<page>

# 列出所有页面
yarn list

# 全站索引 / SEO（按需手动执行，会修改 docs/ 根目录文件）
yarn index       # 重新生成 docs/index.html（扫描 docs 下已有页面）
yarn sitemap     # 重新生成 docs/sitemap.xml（取各页面 meta.json 的 canonical）
yarn copy-public # 同步 public/* 到 docs/public/

# 本地预览整个 docs/ 站点
yarn serve
```

## 新增一个页面

1. 建目录 `src/<page>/`，写 `index.html`（从现有页面复制即可，全站统一模板）、`index.ts`、`App.vue`。
2. 需要 SEO 时加 `meta.json`（`title`、`description`、`canonical` 等，`canonical` 形如 `https://lab.neetproject.com/<page>/index.html`）。
3. `yarn dev <page>` 开发，`yarn build <page>` 构建。
4. 确认 `docs/<page>/` 产物正确后，连同源码一起 commit & push，GitHub Pages 自动上线。
5. 可选：`yarn index && yarn sitemap` 更新全站索引，再次提交。

## 部署

GitHub Pages 直接发布 `docs/` 目录。页面产物为**纯静态**（`base: './'`，资源相对路径），挂载在子路径下也可访问。
注意：部分页面运行时依赖 `/public/...`（如 ffmpeg 核心）或外链 CDN，这类资源由站点根绝对路径提供。
