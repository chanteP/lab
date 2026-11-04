import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntity } from '../types';
import { uniqueSketchName } from '../utils/entity';

test('sketch names follow their shape and remain unique', () => {
    const document = createDocument();
    assert.equal(uniqueSketchName(document, 'circle'), '圆形 1');
    assert.equal(uniqueSketchName(document, 'rectangle'), '矩形 1');
    document.entities.push(Object.assign(createEntity('sketch', 'circle'), { name: '圆形 1', profileType: 'circle' as const }));
    assert.equal(uniqueSketchName(document, 'circle'), '圆形 2');
});

test('split and restitched sketches use the trimmed-edge name', () => {
    const document = createDocument();
    assert.equal(uniqueSketchName(document, 'polygon', true), '裁剪边 1');
    const pending = [Object.assign(createEntity('sketch', 'pending'), { name: '裁剪边 1' })];
    assert.equal(uniqueSketchName(document, 'polygon', true, pending), '裁剪边 2');
});
