import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import glob from 'glob';
import path from 'path';

const templatePath = resolve(__dirname, '../public/index.html');
const html = readFileSync(templatePath, 'utf8');

export function genHTML({ title = '', content = '', script = '', meta = '' }) {
    return html
        .replace('${title}', title)
        .replace('${meta}', meta)
        .replace('${script}', script)
        .replace('${content}', content);
}

export function genIndex() {
    const projects = glob.sync('*/index.html', {
        cwd: path.resolve(__dirname, '../docs/'),
    });

    console.log(projects);

    const content = projects
        .map(
            (projectRoute) =>
                `<li style="display:block;line-height:50px;padding-left:2em;font-family:monospace;"><a href="${projectRoute}">${projectRoute}</a></li>`,
        )
        .join('\n');
    const html = genHTML({
        title: 'index',
        content: `<ul>${content}</ul>`,
    });

    writeFileSync(`./docs/index.html`, html);
}

export function genMeta(meta?: Record<string, string> | null) {
    if (!meta) {
        return '';
    }
    return Object.keys(meta)
        .map((key) => {
            const desc = meta[key];
            return `    <meta content="${desc}" name="${key}">`;
        })
        .join('\n');
}
