import { initWLibraw } from '@wasmedia/wlibraw';
import { handleMessage, serializeError } from '../../../node_modules/@wasmedia/wlibraw/dist/worker-protocol.js';
import wasmUrl from '../../../node_modules/@wasmedia/wlibraw/dist/wlibraw.wasm?url';

let instance: ReturnType<typeof initWLibraw> | undefined;
const getInstance = () => (instance ??= initWLibraw({ locateFile: () => wasmUrl }).catch((error) => {
    instance = undefined;
    throw error;
}));

// Explicit WASM URL is required under a page-relative Vite root; the package's
// default import.meta URL otherwise falls back to the page HTML in dev mode.
const workerScope = self as unknown as { postMessage: (message: unknown, transfer?: ArrayBuffer[]) => void };
self.onmessage = (event: MessageEvent) => {
    const { id } = event.data;
    void handleMessage(getInstance, event.data)
        .then(({ response, transfer }) => workerScope.postMessage(response, transfer))
        .catch((error) => workerScope.postMessage({ id, type: 'error', payload: serializeError(error) }));
};
