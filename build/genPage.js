const glob = require('glob');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { exec } = require('child_process');

const template = readFileSync('./public/index.html', 'utf8');

// node ./build/genPage.js projectName watch
const projectName = process.argv[2];
const watch = process.argv[3];

if(!projectName){
    throw `projectName is needed`;
}
genProject(projectName, watch);

function genProject(projectName, watch = false) {
    const projectPath = `./src/${projectName}`
    let html = template;
    html = replaceTemplate(html, 'title', projectName);
    html = replaceTemplate(html, 'content', existsSync(`${projectPath}/index.html`) && readFileSync(`${projectPath}/index.html`, 'utf8'));
    if(existsSync(`${projectPath}/index.js`)){
        exec(`pack ./src/${projectName}/index.js -o ./dist/${projectName}/index.js ${watch ? '--watch' : ''}`);
        html = replaceTemplate(html, 'script', `<script src="./index.js"></script>`);
    }
    writeFileSync(`./dist/${projectName}/index.html`, html);
}

function replaceTemplate(template, key, content) {
    return template.replace('${' + key + '}', content || '');
}

