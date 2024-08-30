import { saveCall } from './common';

interface UseDragOptions {
    enable?: () => boolean;
    onMoveStart?: () => void;
    onMove?: (x: number, y: number) => void;
    onEnd?: (offsetX: number, offsetY: number) => void;
}

enum DragStatus {
    Idle = 0,
    Ready = 1, // start，但是没开始move
    Dragging = 2,
    End = 3, // 结束后会自动切回idle
}

export function useDragUtils(options: UseDragOptions = {}) {
    const { onMoveStart, onMove, onEnd, enable } = options;

    // status ----------------------------------------
    let dragStatus: DragStatus = DragStatus.Idle;

    const startData = {
        x: 0,
        y: 0,
        time: 0,
    };
    const lastTouch = {
        pageX: 0,
        pageY: 0,
        offsetX: 0,
        offsetY: 0,
    };

    // tools ----------------------------------------
    function getTouch(e: PointerEvent) {
        return e;
    }

    function updateLast(touch: PointerEvent | undefined, x?: number, y?: number) {
        if (!touch) {
            return;
        }
        lastTouch.pageX = touch.pageX;
        lastTouch.pageY = touch.pageY;
        lastTouch.offsetX = x;
        lastTouch.offsetY = y;
    }

    function calcOffset(touch?: PointerEvent) {
        const targetTouch = touch ?? lastTouch;
        return {
            x: targetTouch.pageX - startData.x,
            y: targetTouch.pageY - startData.y,
        };
    }

    // event ----------------------------------------
    function stop() {
        if (dragStatus === DragStatus.Idle) {
            return;
        }

        dragStatus = DragStatus.End;
        saveCall(onEnd, lastTouch.offsetX, lastTouch.offsetY);
        dragStatus = DragStatus.Idle;
    }
    function bindTouchStart(e: PointerEvent) {
        if (enable && !enable()) {
            return;
        }
        if (dragStatus !== DragStatus.Idle) {
            return;
        }

        dragStatus = DragStatus.Ready;
        const touch = getTouch(e)!;

        startData.x = touch.pageX;
        startData.y = touch.pageY;
        startData.time = e.timeStamp;

        updateLast(touch);

        saveCall(onMoveStart);
    }

    function bindTouchMove(e: PointerEvent) {
        if (dragStatus !== DragStatus.Ready && dragStatus !== DragStatus.Dragging) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();

        dragStatus = DragStatus.Dragging;
        const touch = getTouch(e)!;

        const { x, y } = calcOffset(touch);
        updateLast(touch, x, y);

        saveCall(onMove, x, y);
    }

    function bindTouchEnd(e: PointerEvent) {
        if (dragStatus === DragStatus.Idle) {
            return;
        }

        const { x, y } = calcOffset();
        updateLast(lastTouch as PointerEvent, x, y);

        saveCall(onMove, x, y);

        stop();
    }

    return {
        bindTouchStart,
        bindTouchMove,
        bindTouchEnd,

        stop,
    };
}
