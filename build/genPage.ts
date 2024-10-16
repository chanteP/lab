import { genHTML, genIndex, genMeta } from './utils';
import glob from 'glob';
import { existsSync, readFileSync, writeFileSync, ensureFileSync } from 'fs-extra';
import { exec, spawn, spawnSync } from 'child_process';
import program from 'commander';

program.option('-w, --watch', 'watch js').option('-p, --project <project>', 'watch js');
program.parse(process.argv);

// node ./build/genPage.js projectName watch
const projectName = program.project;
const watch = program.watch;

if (!projectName) {
    throw `projectName is needed`;
}

run();

async function run() {
    await genProject(projectName, watch);
    genIndex();
}

async function genProject(projectName, watch = false) {
    const projectPath = `./src/${projectName}`;
    const title = projectName;
    const content = existsSync(`${projectPath}/index.html`) ? readFileSync(`${projectPath}/index.html`, 'utf8') : '';
    let script = '';
    const entry = ensureEntry(projectPath);

    if (!entry) {
        console.error('no entry found');
        process.exit(1);
    }

    const meta: Record<string, string> = existsSync(`${projectPath}/meta.json`)
        ? JSON.parse(readFileSync(`${projectPath}/meta.json`, 'utf8'))
        : null;

    const command = `pack ./src/${projectName}/${entry} -o ./docs/${projectName}/index.js ${
        watch ? '--watch' : '--mode production'
    }`;
    console.log(command);

    const child = exec(command);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    script = `<script src="./index.js"></script>`;
    ensureFileSync(`./docs/${projectName}/index.html`);

    const html = genHTML({
        title: meta?.title ?? title,
        meta: genMeta(meta),
        content,
        script,
    });

    writeFileSync(`./docs/${projectName}/index.html`, html);
}

function ensureEntry(root: string) {
    const paths = ['index.js', 'index.ts'];
    const entry = paths.find((p) => existsSync(`${root}/${p}`));

    return entry;
}
