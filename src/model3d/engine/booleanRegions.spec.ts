import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDocument, createEntity, type ModelEntity } from '../types';
import { buildBooleanRegions, buildEntityMesh } from './geometry';
import { initializeManifold } from './modeling/ManifoldKernel';

await initializeManifold();

function fixture() {
    const document = createDocument();
    const a = Object.assign(createEntity('box', 'a'), { width: 10, height: 10, depth: 10, position: [0, 0, 0] as [number, number, number] });
    const b = Object.assign(createEntity('box', 'b'), { width: 10, height: 10, depth: 10, position: [7.5, 0, 0] as [number, number, number] });
    document.entities.push(a, b);
    return { document, ids: ['a', 'b'] };
}
function volume(geometry: THREE.BufferGeometry) {
    const p = geometry.attributes.position, index = geometry.index;
    let result = 0;
    for (let cursor = 0; cursor < (index?.count || p.count); cursor += 3) {
        const ids = [0, 1, 2].map((corner) => index ? index.getX(cursor + corner) : cursor + corner);
        const a = new THREE.Vector3().fromBufferAttribute(p, ids[0]);
        const b = new THREE.Vector3().fromBufferAttribute(p, ids[1]);
        const c = new THREE.Vector3().fromBufferAttribute(p, ids[2]);
        result += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(result);
}
function selected(document: ReturnType<typeof createDocument>, regionSigns: Record<string, 1 | -1>) {
    const entity: ModelEntity = { id: 'result', parentId: null, name: 'result', kind: 'boolean', color: '#fff', visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], operation: 'union', operands: ['a', 'b'], regionSigns };
    return buildEntityMesh(entity, document);
}

test('two operands decompose into A-B, AB and B-A', () => {
    const { document, ids } = fixture();
    const regions = buildBooleanRegions(document, ids);
    assert.deepEqual(regions.map((region) => region.key).sort(), ['1', '2', '3']);
    assert.ok(Math.abs(volume(regions.find((region) => region.key === '1')!.geometry) - 750) < 1e-4);
    assert.ok(Math.abs(volume(regions.find((region) => region.key === '2')!.geometry) - 750) < 1e-4);
    assert.ok(Math.abs(volume(regions.find((region) => region.key === '3')!.geometry) - 250) < 1e-4);
});

test('only positive regions contribute to the committed result', () => {
    const { document } = fixture();
    assert.ok(Math.abs(volume(selected(document, { '1': -1, '2': -1, '3': 1 }).geometry) - 250) < 1e-4);
    assert.ok(Math.abs(volume(selected(document, { '1': 1, '2': 1, '3': 1 }).geometry) - 1750) < 1e-4);
});
