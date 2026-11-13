import type { Ref } from 'vue';
import type { Viewport, ViewTool } from '../engine/Viewport';

/** Failed tools always expose the selection tool again without committing pending work. */
export function recoverSelectionTool(activeTool: Ref<ViewTool>, viewport: () => Viewport | undefined) {
    activeTool.value = 'select';
    viewport()?.setTool('select');
}

export function toolAfterSelection(tool: ViewTool): ViewTool {
    return ['translate', 'rotate', 'scale'].includes(tool) ? tool : 'select';
}

export function shouldPanLeftDrag(tool: ViewTool, spacePressed: boolean) {
    return tool === 'pan' || spacePressed;
}
