// 页面 HTML 的共享 head 生成逻辑。
// 每个页面的 <head> 都由这里统一生成（标题 / meta.json / 基础样式），
// 保证站点级一致，页面自身只关心 <body>。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from './vite.mjs';

const RESET_CSS = `html,body,div,span,object,iframe,h1,h2,h3,h4,h5,h6,p,blockquote,pre,abbr,address,cite,code,del,dfn,em,img,ins,kbd,q,samp,small,strong,sub,sup,var,b,i,dl,dt,dd,ol,ul,li,fieldset,form,label,legend,table,caption,tbody,tfoot,thead,tr,th,td,article,aside,canvas,details,figcaption,figure,footer,header,hgroup,menu,nav,section,summary,time,mark,audio,video{margin:0;padding:0;border:0;outline:0;font-size:100%;vertical-align:baseline;background:transparent}div{background:transparent}body{line-height:1}article,aside,details,figcaption,figure,footer,header,hgroup,menu,nav,section{display:block}nav ul,ul{list-style:none}blockquote,q{quotes:none}blockquote:before,blockquote:after,q:before,q:after{content:'';content:none}a{margin:0;padding:0;font-size:100%;vertical-align:baseline;background:transparent;cursor:pointer}ins{background-color:#ff9;color:#000;text-decoration:none}mark{background-color:#ff9;color:#000;font-style:italic;font-weight:bold}del{text-decoration:line-through}abbr[title],dfn[title]{border-bottom:1px dotted;cursor:help}table{text-align:left;border-collapse:collapse;border-spacing:0}b,i{font-weight:400;text-decoration:none}a,img{-webkit-touch-callout:none}input,select,textarea,button{outline:0}`;

const BASE_CSS = `html{
    height: 100%;
    font-size: 50px;
    overflow-x: hidden;
}
body{
    position: relative;
    font-size: 13px;
    min-height: 100vh;
    overflow-x: hidden;
    font-family: "PingFang SC";
    line-height: normal;
    background: #f5f5f5;
    color: #333;
    -webkit-font-smoothing: antialiased;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
}
html[data-dpr="2"]{
    font-size: 100px;
}
html[data-dpr="2"] body{
    font-size: 26px;
}
textarea, input, select{
    font-size: inherit;
    color: inherit;
    font-family: inherit;
}`;

const DPR_SCRIPT = `(function(isIOS, devicePixelRatio, meta){
    if(!meta){return;}
    var dpr = !isIOS || devicePixelRatio < 2 ? 1 : 2;
    document.documentElement.dataset.dpr = dpr;
    if(dpr >= 2){
        meta.content = meta.content.replace(/-scale=([\\d\\.]+)/g, '-scale=0.5');
    }
})(/\\bi(phone|pad|pod)/i.test(navigator.userAgent), +window.devicePixelRatio || 1, document.querySelector && document.querySelector('[name="viewport"]'));`;

const GOOGLE_VERIFICATION = 'xBgDcziQCKGDlTSLabOYyQAgsPBMiRxgnDI19wgmxek';

export function readPageMeta(page) {
    const metaPath = join(rootDir, 'src', page, 'meta.json');
    if (!existsSync(metaPath)) {
        return null;
    }
    try {
        return JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch (e) {
        console.warn(`[lab] ${page}/meta.json 解析失败，已忽略: ${e.message}`);
        return null;
    }
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// 生成 <head> 内部内容（不含 <head> 标签本身）
export function sharedHead({ title, meta = null }) {
    const metaTags = meta
        ? Object.keys(meta)
              .map((key) => `    <meta content="${escapeAttr(meta[key])}" name="${escapeAttr(key)}">`)
              .join('\n')
        : '';
    return `    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="icon" href="/favicon.png" type="image/x-icon">
    <meta content="telephone=no,email=no" name=format-detection />
    <meta content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" name="viewport" />
${metaTags}
    <meta name="google-site-verification" content="${GOOGLE_VERIFICATION}" />
    <script>${DPR_SCRIPT}</script>
    <style>${RESET_CSS}</style>
    <style>${BASE_CSS}</style>`;
}

// 生成完整 HTML（用于 docs/index.html 这类非 vite 产物）
export function fullHTML({ title, meta = null, content = '' }) {
    return `<!DOCTYPE html>
<html lang="zh">
<head>
${sharedHead({ title, meta })}
</head>
<body id="wrapper">
    <div id="app">
        ${content}
    </div>
</body>
</html>
`;
}
