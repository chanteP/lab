import type { Trip } from '../types';
import { parseTrips, serializeTrip } from '../utils/yaml';

const DB_NAME = 'lab:travel';
const STORE_NAME = 'trips';
const ACTIVE_KEY = 'lab:travel:trip:activeId';

type StoredTrip = { id: string; yaml: string };

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await openDatabase();
    return new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function listStoredTrips() {
    const records = await run('readonly', (store) => store.getAll() as IDBRequest<StoredTrip[]>);
    return records.flatMap((record) => parseTrips(record.yaml)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putStoredTrip(trip: Trip) {
    const record: StoredTrip = { id: trip.id, yaml: serializeTrip(trip) };
    await run('readwrite', (store) => store.put(record));
}

export async function deleteStoredTrip(id: string) {
    await run('readwrite', (store) => store.delete(id));
}

export const getActiveTripId = () => localStorage.getItem(ACTIVE_KEY);
export const setActiveTripId = (id: string) => localStorage.setItem(ACTIVE_KEY, id);
