type LoadingHandle = { destroy: () => void };
type LoadingFactory = (text: string) => LoadingHandle;

let factory: LoadingFactory | undefined, active: LoadingHandle | undefined, pending = 0;

export function registerLoading(value: LoadingFactory) { factory = value; }

export function disposeLoading() {
    factory = undefined; pending = 0; active?.destroy(); active = undefined;
}

export async function withLoading<T>(text: string, task: () => Promise<T>): Promise<T> {
    pending++;
    if (!active && factory) active = factory(text);
    try { return await task(); }
    finally {
        pending = Math.max(0, pending - 1);
        if (!pending) { active?.destroy(); active = undefined; }
    }
}
