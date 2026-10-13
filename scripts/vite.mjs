// vite 配置工厂：每个页面（src/<page>）是一个独立的 vite root，
// 单页构建只产出 docs/<page>/，不影响其他任何目录。
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { readPageMeta, sharedHead } from './page-html.mjs';

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// .glsl 以 raw 字符串导入（兼容旧代码 `import frag from './frag.glsl'`）
function glslPlugin() {
    return {
        name: 'lab-glsl',
        enforce: 'pre',
        transform(code, id) {
            if (id.endsWith('.glsl')) {
                return { code: `export default ${JSON.stringify(code)};`, map: null };
            }
        },
    };
}

// 统一注入 <head>（标题取 meta.json.title，缺省用页面名）
function labHtmlPlugin(page) {
    return {
        name: 'lab-html',
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                const meta = readPageMeta(page);
                const title = meta?.title ?? page;
                return html.replace(
                    /<head>[\s\S]*?<\/head>/,
                    `<head>\n${sharedHead({ title, meta })}\n</head>`,
                );
            },
        },
    };
}

const DEV_PUBLIC_TYPES = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
};

// dev 下把 /public/* 映射到仓库 public/ 目录
// （线上由 copy-public 同步到 docs/public/，URL 结构保持一致）
function devPublicPlugin() {
    const pubDir = join(rootDir, 'public');
    return {
        name: 'lab-dev-public',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = (req.url ?? '').split('?')[0];
                if (!url.startsWith('/public/')) {
                    return next();
                }
                const file = join(pubDir, decodeURIComponent(url.slice('/public/'.length)));
                if (!file.startsWith(pubDir + sep) || !existsSync(file) || !statSync(file).isFile()) {
                    res.statusCode = 404;
                    return res.end('not found');
                }
                res.setHeader('Content-Type', DEV_PUBLIC_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
                createReadStream(file).pipe(res);
            });
        },
    };
}

export function pageConfig(page, { outDir } = {}) {
    return {
        configFile: false,
        root: join(rootDir, 'src', page),
        base: './',
        publicDir: false,
        plugins: [vue(), glslPlugin(), labHtmlPlugin(page), devPublicPlugin()],
        resolve: {
            alias: { '@': join(rootDir, 'src') },
        },
        assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.skel', '**/*.atlas', '**/*.wasm', '**/*.wat'],
        build: {
            outDir: outDir ?? join(rootDir, 'docs', page),
            emptyOutDir: true,
            target: 'es2020',
            chunkSizeWarningLimit: 8192,
        },
        server: {
            host: true,
            fs: { allow: [rootDir] },
        },
    };
}
