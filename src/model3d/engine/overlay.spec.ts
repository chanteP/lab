import test from 'node:test';
import assert from 'node:assert/strict';
import { sketchDimensionEdgeKey } from './viewport/OverlayController';

test('rectangle and segment dimensions share semantic edge keys with their lock badges', () => {
    assert.equal(sketchDimensionEdgeKey('rectangle', { kind: 'width', index: 0 }), 'rectangle:0');
    assert.equal(sketchDimensionEdgeKey('rectangle', { kind: 'height', index: 1 }), 'rectangle:1');
    assert.equal(sketchDimensionEdgeKey('line', { kind: 'segment', index: 4 }), 'line:4');
});

test('radial, angular and direct-edit dimensions never capture sketch edge locks', () => {
    assert.equal(sketchDimensionEdgeKey('circle', { kind: 'radius' }), undefined);
    assert.equal(sketchDimensionEdgeKey('line', { kind: 'angle', index: 0 }), undefined);
    assert.equal(sketchDimensionEdgeKey('line', { kind: 'control', index: 0, handle: 1 }), undefined);
});


test('a committed dimension value is not applied again by the following blur', async () => {
    const { claimDimensionCommit, resetDimensionCommit } = await import('../components/viewport/dimensionCommit');
    const input = {} as HTMLInputElement;
    assert.equal(claimDimensionCommit(input, '5'), true);
    assert.equal(claimDimensionCommit(input, '5'), false);
    resetDimensionCommit(input);
    assert.equal(claimDimensionCommit(input, '5'), true);
});
