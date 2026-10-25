import type { Arrangement } from './types';

const DB_NAME = 'acoustic-guitar-lab';
const STORE = 'arrangements';
const VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
    const db = await openDatabase();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE, mode);
            const request = action(transaction.objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

const clone = (song: Arrangement): Arrangement => JSON.parse(JSON.stringify(song));
export const listArrangements = async () => (await request('readonly', store => store.getAll() as IDBRequest<Arrangement[]>))
    .sort((a, b) => b.updatedAt - a.updatedAt);
export const getArrangement = (id: string) => request('readonly', store => store.get(id) as IDBRequest<Arrangement | undefined>);
export const saveArrangement = (song: Arrangement) => request('readwrite', store => store.put(clone(song)) as IDBRequest<IDBValidKey>);
export const deleteArrangement = (id: string) => request('readwrite', store => store.delete(id) as IDBRequest<undefined>);
export const CURRENT_SONG_KEY = 'guitar:current-arrangement';
