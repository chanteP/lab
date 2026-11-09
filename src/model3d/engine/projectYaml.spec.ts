import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectYaml, stringifyProjectYaml } from '../utils/projectYaml';

test('compact project YAML round-trips nested objects, arrays and escaped strings', () => {
    const value = {
        version: 1,
        name: '逗号, 冒号: #井号 "引号" \\斜杠\n换行',
        visible: true,
        empty: null,
        position: [0, 20.123456, -0.00001],
        single: ['only'],
        points: [[1, 2], [3.1415926, 4]],
        entities: [{ id: 'box', flags: [true, false], matrix: [[[1, 2]], [[3, 4]]] }],
        records: { 0: { value: 1.23456 }, 'unsafe:key': 'text' },
        emptyArray: [],
        emptyObject: {},
    };
    const source = stringifyProjectYaml(value);
    assert.match(source, /position: 0,20.1235,0/);
    assert.match(source, /single: "only",/);
    assert.match(source, /  - 1,2\n  - 3.1416,4/);
    assert.match(source, /name: "逗号, 冒号: #井号 \\"引号\\" \\\\斜杠\\n换行"/);
    assert.deepEqual(parseProjectYaml(source), {
        ...value,
        position: [0, 20.1235, 0],
        points: [[1, 2], [3.1416, 4]],
        records: { 0: { value: 1.2346 }, 'unsafe:key': 'text' },
    });
});

test('compact project YAML rejects ambiguous unquoted strings and invalid structure', () => {
    assert.throws(() => parseProjectYaml('name: unquoted\n'), /双引号/);
    assert.throws(() => parseProjectYaml('items: 1,,2\n'), /不能为空/);
    assert.throws(() => parseProjectYaml('items:\n  - 1,2\n   - 3,4\n'), /缩进或结构无效/);
    assert.throws(() => stringifyProjectYaml({ bad: Number.NaN }), /有限数/);
});

test('sketch plane ruler guides survive project YAML round trips', () => {
    const value = {
        version: 1,
        planes: [{ id: 'plane', visible: true, guides: [{ id: 'vertical', axis: 'u', offset: -12.5 }, { id: 'horizontal', axis: 'v', offset: 30 }] }],
    };
    expectRoundTrip(value);
});

function expectRoundTrip(value: unknown) {
    assert.deepEqual(parseProjectYaml(stringifyProjectYaml(value)), value);
}
