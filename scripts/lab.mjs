#!/usr/bin/env node
// lab 站点 CLI
//   node scripts/lab.mjs dev <page> [--port 5173]     开发单个页面
//   node scripts/lab.mjs build <page> [--out <dir>]   构建单个页面到 docs/<page>（--out 可改输出目录，用于验证）
//   node scripts/lab.mjs list                         列出所有页面
//   node scripts/lab.mjs index                        重新生成 docs/index.html（页面导航）
//   node scripts/lab.mjs sitemap                      重新生成 docs/sitemap.xml
//   node scripts/lab.mjs copy-public                  同步 public/* 到 docs/public/
//   node scripts/lab.mjs serve [--port 8501]          本地静态预览 docs/
import { createServer as createHttpServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, join } from 'node:path';
import { build, createServer } from 'vite';
import { build as bundle } from 'esbuild';
import { pageConfig, rootDir } from './vite.mjs';
import { fullHTML, readPageMeta } from './page-html.mjs';

// Vue2 时代遗留、未迁移的页面（不参与构建）
const LEGACY_PAGES = ['wasm'];

const [, , cmd, ...rest] = process.argv;

const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
        flags[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    } else {
        positional.push(rest[i]);
    }
}

export function listPages() {
    return readdirSync(join(rootDir, 'src'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => !['common', ...LEGACY_PAGES].includes(name))
        .filter((name) => existsSync(join(rootDir, 'src', name, 'index.ts')) || existsSync(join(rootDir, 'src', name, 'index.js')))
        .sort();
}

function requirePage() {
    const page = positional[0];
    if (!page) {
        console.error('用法: lab ' + cmd + ' <page>\n可用页面: ' + listPages().join(', '));
        process.exit(1);
    }
    if (!listPages().includes(page)) {
        console.error(`页面不存在: ${page}\n可用页面: ${listPages().join(', ')}`);
        process.exit(1);
    }
    return page;
}

function findSpecs(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? findSpecs(path) : entry.name.endsWith('.spec.ts') ? [path] : [];
    });
}

// Page-local specs are lab infrastructure: a failed processing test must never publish stale output.
async function runPageSpecs(page) {
    const specs = findSpecs(join(rootDir, 'src', page));
    for (const spec of specs) {
        const name = spec.slice(join(rootDir, 'src', page).length + 1).replaceAll(/[\\/]/g, '-').replace(/\.ts$/, '.mjs');
        const outfile = join(rootDir, '.temp', 'spec', page, name);
        mkdirSync(join(outfile, '..'), { recursive: true });
        await bundle({ entryPoints: [spec], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node20', external: ['@wasmedia/wlibraw'], logLevel: 'silent' });
        console.log(`[lab] spec ${page}: ${name}`);
        const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
        if (result.status !== 0) throw new Error(`Page spec failed: ${spec}`);
    }
}

const commands = {
    list() {
        for (const page of listPages()) {
            const meta = readPageMeta(page);
            console.log(`${page}${meta?.title ? `\t${meta.title}` : ''}`);
        }
        if (LEGACY_PAGES.length) {
            console.log(`\n(legacy 未迁移: ${LEGACY_PAGES.join(', ')})`);
        }
    },

    async dev() {
        const page = requirePage();
        const config = pageConfig(page);
        const server = await createServer({
            ...config,
            server: { ...config.server, port: Number(flags.port ?? 5173), strictPort: false },
        });
        await server.listen();
        server.printUrls();
        server.bindCLIShortcuts({ print: true });
    },

    async build() {
        const page = requirePage();
        await runPageSpecs(page);
        const outDir = flags.out ? join(rootDir, flags.out) : undefined;
        const target = outDir ?? join(rootDir, 'docs', page);
        console.log(`[lab] build ${page} -> ${target}`);
        await build(pageConfig(page, { outDir }));
        console.log(`[lab] done: ${page}`);
    },

    index() {
        const docsDir = join(rootDir, 'docs');
        // public/assets 是共享静态资源目录，不是页面
        const NON_PAGE_DIRS = ['public', 'assets'];
        const routes = readdirSync(docsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !NON_PAGE_DIRS.includes(d.name))
            .filter((d) => existsSync(join(docsDir, d.name, 'index.html')))
            .map((d) => d.name)
            .sort();

        const esc = (s) =>
            String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const latestFileTime = (dir) => {
            if (!existsSync(dir)) return 0;
            return readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
                const path = join(dir, entry.name);
                const mtime = entry.isDirectory() ? latestFileTime(path) : statSync(path).mtimeMs;
                return Math.max(latest, mtime);
            }, statSync(dir).mtimeMs);
        };

        const pageDates = (page) => {
            const history = spawnSync('git', ['log', '--format=%aI', '--', `src/${page}`, `docs/${page}`], {
                cwd: rootDir,
                encoding: 'utf8',
            });
            const commits = history.status === 0 ? history.stdout.trim().split('\n').filter(Boolean) : [];
            const fallbackTime = Math.max(latestFileTime(join(rootDir, 'src', page)), latestFileTime(join(docsDir, page)));
            const fallback = fallbackTime ? new Date(fallbackTime).toISOString() : null;
            return {
                createdAt: commits.at(-1) ?? fallback,
                modifiedAt: commits[0] ?? fallback,
            };
        };

        const dateText = (date) => date?.slice(0, 10) ?? '—';
        const timeTag = (date) =>
            date ? `<time datetime="${date}">${dateText(date)}</time>` : `<span>${dateText(date)}</span>`;

        // 备注来自 src/<page>/meta.json 的 title/description，面向访客，不含个人信息
        const pages = routes.map((page) => {
            const meta = readPageMeta(page);
            return {
                page,
                title: meta?.title ?? page,
                description: meta?.description ?? '',
                seo: Boolean(meta?.canonical),
                ...pageDates(page),
            };
        }).sort(
            (a, b) =>
                (b.modifiedAt ? Date.parse(b.modifiedAt) : 0) - (a.modifiedAt ? Date.parse(a.modifiedAt) : 0) ||
                a.page.localeCompare(b.page),
        );
        const tools = pages.filter((p) => p.seo);
        const experiments = pages.filter((p) => !p.seo);

        const card = ({ page, title, description, createdAt, modifiedAt }) => `        <a class="card" href="${page}/">
            <div class="card-content">
                <h3>${esc(title)}</h3>
                ${description ? `<p>${esc(description)}</p>` : ''}
            </div>
            <div class="card-footer">
                <span class="path">/${page}/</span>
                <div class="dates">
                    <span class="date"><span class="date-label">Created</span>${timeTag(createdAt)}</span>
                    <span class="date"><span class="date-label">Updated</span>${timeTag(modifiedAt)}</span>
                </div>
            </div>
        </a>`;

        const section = (name, list) =>
            list.length
                ? `    <section>
        <h2>${name}</h2>
        <div class="grid">
${list.map(card).join('\n')}
        </div>
    </section>`
                : '';

        const content = `<div class="site-index">
    <header>
        <h1>lab</h1>
        <p class="subtitle">前端工具集 · Front-end tools &amp; experiments</p>
    </header>
${section('Tools', tools)}
${section('Experiments', experiments)}
</div>`;

        const extraHead = `<style>
.site-index {
    box-sizing: border-box;
    max-width: 960px;
    margin: 0 auto;
    padding: 48px 20px 64px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}
.site-index header {
    margin-bottom: 40px;
}
.site-index h1 {
    font-size: 40px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #1a1a1a;
}
.site-index .subtitle {
    margin-top: 8px;
    font-size: 15px;
    color: #888;
}
.site-index h2 {
    margin: 32px 0 16px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #999;
}
.site-index .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
}
.site-index .card {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-height: 176px;
    padding: 18px 20px 14px;
    background: #fff;
    border: 1px solid #ececec;
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.site-index .card:hover {
    transform: translateY(-2px);
    border-color: #d8e0f5;
    box-shadow: 0 6px 20px rgba(60, 90, 180, 0.1);
}
.site-index .card h3 {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.4;
    color: #222;
}
.site-index .card p {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.6;
    color: #777;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.site-index .card-content {
    margin-bottom: 16px;
}
.site-index .card-footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #f0f1f4;
}
.site-index .card .path {
    flex: none;
    font-size: 11px;
    line-height: 1.5;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #aab4c8;
}
.site-index .dates {
    display: grid;
    flex: none;
    gap: 2px;
    font-size: 10px;
    line-height: 1.4;
    text-align: right;
}
.site-index .date {
    display: flex;
    justify-content: flex-end;
    gap: 5px;
    white-space: nowrap;
}
.site-index .date-label {
    color: #b0b5c0;
}
.site-index .date time {
    color: #8d96a8;
    font-variant-numeric: tabular-nums;
}
</style>`;

        writeFileSync(
            join(docsDir, 'index.html'),
            fullHTML({
                title: 'lab - 前端工具集',
                meta: {
                    description:
                        '纯静态前端工具与实验合集：Base64 编解码、二维码生成、CSS 渐变生成、字体工具、图片 EXIF 查看、Markdown 简历渲染、色彩校准、3D 模型预览，以及若干 WebGL 渲染实验。',
                },
                content,
                extraHead,
            }),
        );
        console.log(`[lab] docs/index.html 已更新（Tools ${tools.length} / Experiments ${experiments.length}）`);
    },

    sitemap() {
        const links = listPages()
            .map((page) => readPageMeta(page))
            .filter((meta) => meta?.canonical)
            .map((meta) => meta.canonical);
        const lastmod = new Date().toISOString();
        const urls = links
            .map(
                (loc) =>
                    `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
            )
            .join('');
        const xml =
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">' +
            urls +
            '</urlset>';
        writeFileSync(join(rootDir, 'docs', 'sitemap.xml'), xml);
        console.log(`[lab] docs/sitemap.xml 已更新（${links.length} 条）`);
    },

    'copy-public'() {
        const from = join(rootDir, 'public');
        const to = join(rootDir, 'docs', 'public');
        mkdirSync(to, { recursive: true });
        for (const entry of readdirSync(from)) {
            cpSync(join(from, entry), join(to, entry), { recursive: true });
        }
        console.log('[lab] public/* -> docs/public/ 已同步');
    },

    async serve() {
        const port = Number(flags.port ?? 8501);
        const docsDir = join(rootDir, 'docs');
        const types = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.mjs': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.wasm': 'application/wasm',
            '.ttf': 'font/ttf',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.mp4': 'video/mp4',
            '.xml': 'application/xml; charset=utf-8',
        };
        const server = createHttpServer((req, res) => {
            let url = decodeURIComponent((req.url ?? '/').split('?')[0]);
            let file = join(docsDir, url);
            if (!file.startsWith(docsDir)) {
                res.statusCode = 403;
                return res.end();
            }
            if (existsSync(file) && statSync(file).isDirectory()) {
                file = join(file, 'index.html');
            }
            if (!existsSync(file) || !statSync(file).isFile()) {
                res.statusCode = 404;
                return res.end('not found');
            }
            res.setHeader('Content-Type', types[extname(file).toLowerCase()] ?? 'application/octet-stream');
            createReadStream(file).pipe(res);
        });
        server.listen(port, () => console.log(`[lab] docs/ 预览: http://localhost:${port}`));
    },
};

if (!commands[cmd]) {
    console.error(`未知命令: ${cmd ?? '(空)'}\n可用命令: ${Object.keys(commands).join(', ')}`);
    process.exit(1);
}
await commands[cmd]();
