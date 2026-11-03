import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_MODES, normalizeDisplayMode } from '../config/configs';

test('viewport display modes exclude outline and normalize persisted values', () => {
    assert(!DISPLAY_MODES.some((mode) => mode.value === 'outline'));
    assert.equal(normalizeDisplayMode('wireframe'), 'wireframe');
    assert.equal(normalizeDisplayMode('xray'), 'xray');
    assert.equal(normalizeDisplayMode('outline'), 'shaded');
    assert.equal(normalizeDisplayMode(null), 'shaded');
});
