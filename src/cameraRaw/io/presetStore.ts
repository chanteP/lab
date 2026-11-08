import { openCameraRawDatabase, PRESET_STORE, requestResult } from './database';

export interface StoredPreset {
    id: string;
    name: string;
    xmp: string;
    source: 'import' | 'saved' | 'agent';
    updatedAt: number;
}

function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('camera-raw-presets-changed')); }

async function legacyPresets(): Promise<StoredPreset[]> {
    return new Promise((resolve) => {
        const request = indexedDB.open('camera-raw-lab', 1);
        request.onerror = () => resolve([]); request.onupgradeneeded = () => { request.result.close(); resolve([]); };
        request.onsuccess = async () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PRESET_STORE)) { db.close(); resolve([]); return; }
            const result = await requestResult(db.transaction(PRESET_STORE, 'readonly').objectStore(PRESET_STORE).getAll()).catch(() => []);
            db.close(); resolve(result as StoredPreset[]);
        };
    });
}

export async function listPresets(): Promise<StoredPreset[]> {
    const db = await openCameraRawDatabase();
    try {
        const store = () => db.transaction(PRESET_STORE, 'readonly').objectStore(PRESET_STORE);
        let presets = await requestResult(store().getAll()) as StoredPreset[];
        if (!presets.length) {
            const legacy = await legacyPresets();
            for (const preset of legacy) await requestResult(db.transaction(PRESET_STORE, 'readwrite').objectStore(PRESET_STORE).put(preset));
            presets = await requestResult(store().getAll()) as StoredPreset[];
        }
        return presets.sort((a, b) => b.updatedAt - a.updatedAt);
    } finally { db.close(); }
}

export async function putPreset(input: Omit<StoredPreset, 'id' | 'updatedAt'> & { id?: string }): Promise<StoredPreset> {
    const preset: StoredPreset = { ...input, id: input.id ?? crypto.randomUUID(), updatedAt: Date.now() };
    const db = await openCameraRawDatabase();
    try { await requestResult(db.transaction(PRESET_STORE, 'readwrite').objectStore(PRESET_STORE).put(preset)); }
    finally { db.close(); }
    changed(); return preset;
}

export async function deletePreset(id: string): Promise<void> {
    const db = await openCameraRawDatabase();
    try { await requestResult(db.transaction(PRESET_STORE, 'readwrite').objectStore(PRESET_STORE).delete(id)); }
    finally { db.close(); }
    changed();
}
