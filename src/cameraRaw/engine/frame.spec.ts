import test from 'node:test';
import assert from 'assert/strict';
import { createLatestFrameScheduler } from './frame.ts';

test('coalesced watchers always execute the latest frame instead of dropping it', () => {
    const callbacks = new Map<number, FrameRequestCallback>(), completed: number[] = [];
    let id = 0;
    const previousRaf = globalThis.requestAnimationFrame, previousCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => { callbacks.set(++id, callback); return id; };
    globalThis.cancelAnimationFrame = (frame) => { callbacks.delete(frame); };
    try {
        const scheduler = createLatestFrameScheduler((version) => completed.push(version));
        scheduler.schedule(); scheduler.schedule(); scheduler.schedule();
        assert.equal(callbacks.size, 1);
        for (const callback of callbacks.values()) callback(0);
        assert.deepEqual(completed, [3]);
        assert.ok(scheduler.isCurrent(3));
    } finally {
        globalThis.requestAnimationFrame = previousRaf; globalThis.cancelAnimationFrame = previousCancel;
    }
});
