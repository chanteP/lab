import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const outdir = resolve(root, '.temp/test/model3d');
const entries = ['sketchCurves', 'sketchBorders', 'sketchAdvanced'];
await build({
    entryPoints: entries.map((name) => resolve(root, `src/model3d/engine/${name}.spec.ts`)),
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir,
    outExtension: { '.js': '.mjs' },
    logLevel: 'warning',
});
const result = spawnSync(process.execPath, ['--test', ...entries.map((name) => resolve(outdir, `${name}.spec.mjs`))], { stdio: 'inherit' });
process.exit(result.status ?? 1);
