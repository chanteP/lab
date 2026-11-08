const DB_NAME = 'lab:cameraRaw';
export const PRESET_STORE = 'presets';
export const PROFILE_STORE = 'profiles';

export function openCameraRawDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PRESET_STORE)) db.createObjectStore(PRESET_STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
            if (!db.objectStoreNames.contains(PROFILE_STORE)) db.createObjectStore(PROFILE_STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
