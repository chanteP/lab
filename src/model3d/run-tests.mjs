import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const outdir = resolve(root, '.temp/test/model3d');
const entries = ['sketchCurves', 'sketchBorders', 'entityTopology', 'entityNames', 'faceExtrusion', 'directEditTransaction', 'edgePicker', 'featureReferences', 'repeatedFaceExtrusion', 'signedBoolean', 'sketchHover', 'unionFixtureRegression', 'displayMode', 'sketchAdvanced', 'sketchLinearPattern', 'sketchRadialPattern', 'sketchMarquee', 'sketchItemDeletion', 'geometry', 'geometrySelection', 'measurement', 'section', 'profileIntersection', 'gridScale', 'gizmoOrbit', 'defaultView', 'transformColors', 'trimmedEllipseExtrusion', 'booleanRegions', 'sketchAssets', 'edgeTreatments', 'guideRenderer', 'sketchSemanticSplit', 'bezierRectangleExtrusion', 'edgeTreatmentSelection', 'sketchRegionPreview', 'sketchSelection', 'sketchConstraintSolver', 'sketchConstraintChain', 'sketchSelectionMemory', 'sketchDimension', 'sketchGuides', 'sketchShapes', 'sketchWholeShapeSnap', 'sketchRulers', 'meshImport', 'vertexTreatments', 'projectYaml', 'directArrowPicker', 'overlay', 'shell', 'shellOperation', 'sketchGeometricConstraints', 'webmcp'];
await build({
    entryPoints: entries.map((name) => resolve(root, `src/model3d/engine/${name}.spec.ts`)),
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir,
    outExtension: { '.js': '.mjs' },
    logLevel: 'warning',
    loader: { '.wasm': 'file' },
});
const result = spawnSync(process.execPath, ['--test', ...entries.map((name) => resolve(outdir, `${name}.spec.mjs`))], { stdio: 'inherit' });
process.exit(result.status ?? 1);
