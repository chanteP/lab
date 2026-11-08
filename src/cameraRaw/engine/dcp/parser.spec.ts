import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cameraModelMatches, normalizeCameraModel, parseDcp } from './parser.ts';

const directory = join(process.cwd(), 'src/cameraRaw/profiles');

test('parses every bundled Sony profile with bounded tables', () => {
    const files = readdirSync(directory).filter((name) => name.endsWith('.dcp'));
    assert.equal(files.length, 21);
    for (const fileName of files) {
        const profile = parseDcp(readFileSync(join(directory, fileName)), fileName);
        assert.ok(profile.cameraModel, fileName);
        assert.equal(profile.colorMatrix1?.length, 9, fileName);
        for (const table of [profile.hueSatMap, profile.lookTable]) if (table) {
            assert.equal(table.data.length, table.dimensions[0] * table.dimensions[1] * table.dimensions[2] * 3, fileName);
        }
    }
});

test('Sony revised bodies match only the base camera profile', () => {
    assert.ok(cameraModelMatches('ILCE-7RM3A', 'Sony ILCE-7RM3'));
    assert.ok(!cameraModelMatches('ILCE-7RM3A', 'Sony ILCE-7CM2'));
    assert.equal(normalizeCameraModel('Sony ILCE-7RM3'), 'ILCE7RM3');
});

test('rejects truncated DCP data', () => {
    const bytes = readFileSync(join(directory, 'SONY ILCE-7RM3.dcp')).slice(0, 64);
    assert.throws(() => parseDcp(bytes), /越界|无效|不完整/);
});
