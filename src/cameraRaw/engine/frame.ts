export function createLatestFrameScheduler(task: (version: number) => void) {
    let frame = 0, version = 0;
    return {
        schedule() {
            version++;
            if (frame) cancelAnimationFrame(frame);
            const current = version;
            frame = requestAnimationFrame(() => { frame = 0; task(current); });
        },
        isCurrent(value: number) { return value === version; },
        cancel() { if (frame) cancelAnimationFrame(frame); frame = 0; version++; },
    };
}
