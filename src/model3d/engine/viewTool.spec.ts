import assert from 'node:assert/strict';
import test from 'node:test';
import { ref } from 'vue';
import type { Viewport, ViewTool } from './Viewport';
import { recoverSelectionTool, shouldPanLeftDrag, toolAfterSelection } from '../utils/viewTool';

test('ordinary selection stays on Select instead of implicitly entering Translate', () => {
    const tools: ViewTool[] = ['select', 'pan', 'offsetFace', 'extrude', 'fillet', 'chamfer', 'shell', 'revolve'];
    tools.forEach((tool) => assert.equal(toolAfterSelection(tool), 'select'));
});

test('explicit transform tools survive another selection', () => {
    const tools: ViewTool[] = ['translate', 'rotate', 'scale'];
    tools.forEach((tool) => assert.equal(toolAfterSelection(tool), tool));
});

test('hand tool and Space both map left drag to pan', () => {
    assert.equal(shouldPanLeftDrag('pan', false), true);
    assert.equal(shouldPanLeftDrag('select', true), true);
    assert.equal(shouldPanLeftDrag('select', false), false);
    assert.equal(shouldPanLeftDrag('translate', false), false);
});

test('failed tools restore Select in both Vue and viewport state', () => {
    const activeTool = ref<ViewTool>('shell');
    let viewportTool: ViewTool = 'shell';
    const viewport = { setTool: (tool: ViewTool) => { viewportTool = tool; } } as unknown as Viewport;
    recoverSelectionTool(activeTool, () => viewport);
    assert.equal(activeTool.value, 'select');
    assert.equal(viewportTool, 'select');
});
