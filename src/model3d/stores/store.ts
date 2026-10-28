import type { ProjectRecord } from '../types';

const DB_NAME = 'lab-model3d';
const STORE_NAME = 'projects';
const ACTIVE_KEY = 'lab-model3d-active';

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDatabase();
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function listProjects() {
    const projects = await run('readonly', (store) => store.getAll() as IDBRequest<ProjectRecord[]>);
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putProject(project: ProjectRecord) {
    await run('readwrite', (store) => store.put(JSON.parse(JSON.stringify(project))));
}

export async function deleteProject(id: string) {
    await run('readwrite', (store) => store.delete(id));
}

export function getActiveProjectId() {
    return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProjectId(id: string) {
    localStorage.setItem(ACTIVE_KEY, id);
}
