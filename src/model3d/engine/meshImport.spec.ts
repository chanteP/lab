import test from 'node:test';
import assert from 'node:assert/strict';
import { importMeshFile } from './importers';

test('STL imports as a baked model entity', async () => {
    const source = 'solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle';
    const [entity] = await importMeshFile(new File([source], 'triangle.stl'));
    assert.equal(entity.kind, 'boolean');
    assert.equal(entity.compositeGeometry, true);
    assert.equal(entity.meshGeometry?.positions.length, 9);
    assert.equal(entity.name, 'triangle');
});

test('OBJ imports every mesh with transformed baked geometry', async () => {
    const source = 'o Square\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3\nf 1 3 4\n';
    const [entity] = await importMeshFile(new File([source], 'square.obj'));
    assert.equal(entity.kind, 'boolean');
    assert.equal(entity.meshGeometry?.indices.length, 6);
    assert.equal(entity.meshGeometry?.normals?.length, entity.meshGeometry?.positions.length);
});

test('unsupported mesh extensions explain the supported formats', async () => {
    await assert.rejects(() => importMeshFile(new File(['{}'], 'model.gltf')), /STL、OBJ、GLB/);
});

test('GLB imports a self-contained binary triangle', async () => {
    const asset = {
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        buffers: [{ byteLength: 44 }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
        ],
    };
    const json = new TextEncoder().encode(JSON.stringify(asset));
    const jsonLength = Math.ceil(json.length / 4) * 4;
    const buffer = new ArrayBuffer(12 + 8 + jsonLength + 8 + 44);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
    view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buffer, 20, jsonLength).set(json);
    if (jsonLength > json.length) new Uint8Array(buffer, 20 + json.length, jsonLength - json.length).fill(0x20);
    const binOffset = 20 + jsonLength;
    view.setUint32(binOffset, 44, true); view.setUint32(binOffset + 4, 0x004e4942, true);
    new Float32Array(buffer, binOffset + 8, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    new Uint16Array(buffer, binOffset + 44, 3).set([0, 1, 2]);
    const [entity] = await importMeshFile(new File([buffer], 'triangle.glb'));
    assert.equal(entity.kind, 'boolean');
    assert.equal(entity.meshGeometry?.indices.length, 3);
});
