export interface StoredPreset {
    id: string;
    name: string;
    xmp: string;
    source: 'import' | 'saved' | 'agent';
    updatedAt: number;
}

const DB_NAME = 'camera-raw-lab', STORE = 'presets';

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('camera-raw-presets-changed')); }

export async function listPresets(): Promise<StoredPreset[]> {
    const db = await openDatabase();
    try { return (await requestResult(db.transaction(STORE, 'readonly').objectStore(STORE).getAll()) as StoredPreset[]).sort((a, b) => b.updatedAt - a.updatedAt); }
    finally { db.close(); }
}

export async function putPreset(input: Omit<StoredPreset, 'id' | 'updatedAt'> & { id?: string }): Promise<StoredPreset> {
    const preset: StoredPreset = { ...input, id: input.id ?? crypto.randomUUID(), updatedAt: Date.now() };
    const db = await openDatabase();
    try { await requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).put(preset)); }
    finally { db.close(); }
    changed(); return preset;
}

export async function deletePreset(id: string): Promise<void> {
    const db = await openDatabase();
    try { await requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)); }
    finally { db.close(); }
    changed();
}
