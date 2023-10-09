import { genHTML, genIndex } from './utils';
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

    const command = `pack ./src/${projectName}/${entry} -o ./dist/${projectName}/index.js ${
        watch ? '--watch' : '--mode production'
    }`;
    console.log(command);

    exec(command);

    script = `<script src="./index.js"></script>`;
    ensureFileSync(`./dist/${projectName}/index.html`);

    const html = genHTML({
        title,
        content,
        script,
    });

    writeFileSync(`./dist/${projectName}/index.html`, html);

    open
}

function ensureEntry(root: string) {
    const paths = ['index.js', 'index.ts'];
    const entry = paths.find((p) => existsSync(`${root}/${p}`));

    return entry;
}
