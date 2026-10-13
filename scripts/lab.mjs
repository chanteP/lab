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
import { extname, join } from 'node:path';
import { build, createServer } from 'vite';
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
        const outDir = flags.out ? join(rootDir, flags.out) : undefined;
        const target = outDir ?? join(rootDir, 'docs', page);
        console.log(`[lab] build ${page} -> ${target}`);
        await build(pageConfig(page, { outDir }));
        console.log(`[lab] done: ${page}`);
    },

    index() {
        const docsDir = join(rootDir, 'docs');
        const projects = readdirSync(docsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && existsSync(join(docsDir, d.name, 'index.html')))
            .map((d) => `${d.name}/index.html`)
            .sort();
        const content = projects
            .map(
                (route) =>
                    `<li style="display:block;line-height:50px;padding-left:2em;font-family:monospace;"><a href="${route}">${route}</a></li>`,
            )
            .join('\n');
        writeFileSync(join(docsDir, 'index.html'), fullHTML({ title: 'index', content: `<ul>${content}</ul>` }));
        console.log(`[lab] docs/index.html 已更新（${projects.length} 个页面）`);
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
