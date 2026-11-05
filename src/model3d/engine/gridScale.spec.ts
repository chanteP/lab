import assert from 'node:assert/strict';
import test from 'node:test';
import { gridStepForUnitsPerPixel, scaleBarForGrid } from './viewport/gridScale';
import { InfiniteGrid } from './viewport/InfiniteGrid';
import { AXIS_COLORS } from '../config/colors';
import * as THREE from 'three';

test('grid scales by powers of ten when zooming out', () => {
    assert.equal(gridStepForUnitsPerPixel(0.25), 10);
    assert.equal(gridStepForUnitsPerPixel(0.51), 100);
    assert.equal(gridStepForUnitsPerPixel(5.1), 1000);
    assert.equal(gridStepForUnitsPerPixel(0.05), 1);
});

test('scale bar uses integer grid segments near 150px', () => {
    const scale = scaleBarForGrid(0.25, 10);
    assert.equal(scale.segments, 4);
    assert.equal(scale.value, 40);
    assert.equal(scale.width, 160);
});

test('origin grid axes use the shared X and Z axis colors', () => {
    const grid = new InfiniteGrid();
    const material = grid.mesh.material as THREE.ShaderMaterial;
    assert.equal((material.uniforms.uXAxisColor.value as THREE.Color).getHexString(), new THREE.Color(AXIS_COLORS.x).getHexString());
    assert.equal((material.uniforms.uZAxisColor.value as THREE.Color).getHexString(), new THREE.Color(AXIS_COLORS.z).getHexString());
    grid.dispose();
});
