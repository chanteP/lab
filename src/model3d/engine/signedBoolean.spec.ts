import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDocument, createEntity, type BooleanOperation, type ModelDocument, type ModelEntity } from '../types';
import { buildEntityMesh } from './geometry';
import { initializeManifold } from './modeling/ManifoldKernel';

await initializeManifold();

function fixture() {
    const document = createDocument();
    const boxes = ['a', 'b', 'c'].map((id, index) => Object.assign(createEntity('box', id), {
        width: 10, height: 10, depth: 10, position: [index * 7.5, 0, 0] as [number, number, number],
    }));
    document.entities.push(...boxes);
    return { document, ids: boxes.map((box) => box.id) };
}
function result(document: ModelDocument, operation: BooleanOperation, ids: string[], signs: number[]) {
    const entity: ModelEntity = {
        id: 'result', parentId: null, name: 'result', kind: 'boolean', color: '#fff', visible: true,
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], operation, operands: ids,
        operandSigns: Object.fromEntries(ids.map((id, index) => [id, signs[index] === 1 ? 1 as const : -1 as const])),
    };
    return buildEntityMesh(entity, document);
}
function volume(geometry: THREE.BufferGeometry) {
    const position = geometry.attributes.position;
    const index = geometry.index;
    let volume = 0;
    for (let cursor = 0; cursor < (index?.count || position.count); cursor += 3) {
        const ids = [0, 1, 2].map((corner) => index ? index.getX(cursor + corner) : cursor + corner);
        const a = new THREE.Vector3().fromBufferAttribute(position, ids[0]);
        const b = new THREE.Vector3().fromBufferAttribute(position, ids[1]);
        const c = new THREE.Vector3().fromBufferAttribute(position, ids[2]);
        volume += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(volume);
}

test('multi-body union combines every positive operand', () => {
    const { document, ids } = fixture();
    const mesh = result(document, 'union', ids, [1, 1, 1]);
    assert.ok(volume(mesh.geometry) >= 2500 && volume(mesh.geometry) < 3000);
});

test('signed subtract removes every negative operand', () => {
    const { document, ids } = fixture();
    const mesh = result(document, 'subtract', ids, [1, -1, -1]);
    assert.ok(Math.abs(volume(mesh.geometry) - 750) < 1e-4);
});

test('intersect uses positive operands and then removes negative operands', () => {
    const { document, ids } = fixture();
    const mesh = result(document, 'intersect', ids, [1, 1, -1]);
    assert.ok(Math.abs(volume(mesh.geometry) - 250) < 1e-4);
});

test('all-negative boolean input is rejected', () => {
    const { document, ids } = fixture();
    assert.throws(() => result(document, 'subtract', ids, [-1, -1, -1]), /至少保留一个目标实体/);
});
