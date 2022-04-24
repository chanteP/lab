import { genHTML, genIndex } from './utils';
import glob from 'glob';
import { existsSync, readFileSync, writeFileSync, ensureFileSync } from 'fs-extra';
import { exec } from 'child_process';
import program from 'commander';

program.option('-w, --watch', 'watch js').option('-p, --project <project>', 'watch js');
program.parse(process.argv);

// node ./build/genPage.js projectName watch
const projectName = program.project;
const watch = program.watch;

if (!projectName) {
    throw `projectName is needed`;
}

genProject(projectName, watch);
genIndex();

function genProject(projectName, watch = false) {
    const projectPath = `./src/${projectName}`;
    const title = projectName;
    const content = existsSync(`${projectPath}/index.html`) ? readFileSync(`${projectPath}/index.html`, 'utf8') : '';
    let script = '';
    let entry;
    if (existsSync(`${projectPath}/index.js`)) {
        entry = `./src/${projectName}/index.js`;
    }
    if (existsSync(`${projectPath}/index.ts`)) {
        entry = `./src/${projectName}/index.ts`;
    }
    if (entry) {
        const command = `pack ${entry} -o ./dist/${projectName}/index.js ${watch ? '--watch' : '--mode production'}`;
        console.log(command);
        exec(command);
        script = `<script src="./index.js"></script>`;
    }
    ensureFileSync(`./dist/${projectName}/index.html`);

    const html = genHTML({
        title,
        content,
        script,
    });

    writeFileSync(`./dist/${projectName}/index.html`, html);
}
