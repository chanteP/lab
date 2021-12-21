const glob = require('glob');
const { existsSync, readFileSync, writeFileSync, ensureFileSync } = require('fs-extra');
const { exec } = require('child_process');

const program = require('commander');

program
    .option('-w, --watch', 'watch js')
    .option('-p, --project <project>', 'watch js');
program.parse(process.argv);

// node ./build/genPage.js projectName watch
const projectName = program.project;
const watch = program.watch;

if (!projectName) {
    throw `projectName is needed`;
}

genProject(projectName, watch);

function genProject(projectName, watch = false) {
    const projectPath = `./src/${projectName}`;
    let html = readFileSync('./public/index.html', 'utf8');
    html = replaceTemplate(html, 'title', projectName);
    html = replaceTemplate(
        html,
        'content',
        existsSync(`${projectPath}/index.html`) && readFileSync(`${projectPath}/index.html`, 'utf8')
    );
    let entry;
    if (existsSync(`${projectPath}/index.js`)) {
        entry = `./src/${projectName}/index.js`;
    }
    if (existsSync(`${projectPath}/index.ts`)) {
        entry = `./src/${projectName}/index.ts`;
    }
    if (entry) {
        const command = `pack ${entry} -o ./dist/${projectName}/index.js ${watch ? '--watch' : ''}`;
        console.log(command);
        exec(command);
        html = replaceTemplate(html, 'script', `<script src="./index.js"></script>`);
    }
    ensureFileSync(`./dist/${projectName}/index.html`);
    writeFileSync(`./dist/${projectName}/index.html`, html);
}

function replaceTemplate(template, key, content) {
    return template.replace('${' + key + '}', content || '');
}
