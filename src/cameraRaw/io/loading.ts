import { reactive } from 'vue';

type LoadingHandle = { destroy: () => void };
type LoadingFactory = (text: string) => LoadingHandle;

let factory: LoadingFactory | undefined, active: LoadingHandle | undefined, pending = 0;
export const loadingState = reactive({ visible: false, text: '', progress: undefined as number | undefined });

export function registerLoading(value: LoadingFactory) { factory = value; }

export function setLoading(state: { text?: string; progress?: number }) {
    if (state.text !== undefined) loadingState.text = state.text;
    loadingState.progress = state.progress === undefined ? undefined : Math.max(0, Math.min(100, state.progress));
}

export function disposeLoading() {
    factory = undefined; pending = 0; active?.destroy(); active = undefined;
    loadingState.visible = false; loadingState.text = ''; loadingState.progress = undefined;
}

export async function withLoading<T>(text: string, task: () => Promise<T>): Promise<T> {
    pending++;
    loadingState.visible = true; loadingState.text = text; loadingState.progress = undefined;
    if (!active && factory) active = factory(text);
    try { return await task(); }
    finally {
        pending = Math.max(0, pending - 1);
        if (!pending) {
            active?.destroy(); active = undefined; loadingState.visible = false; loadingState.progress = undefined;
        }
    }
}
