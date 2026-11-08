import type { DcpCatalogEntry } from '../engine/dcp/types';
import { openCameraRawDatabase, PROFILE_STORE, requestResult } from './database';

export interface StoredProfile extends DcpCatalogEntry {
    bytes: Uint8Array;
    updatedAt: number;
}

export async function listStoredProfiles(): Promise<StoredProfile[]> {
    const db = await openCameraRawDatabase();
    try { return await requestResult(db.transaction(PROFILE_STORE, 'readonly').objectStore(PROFILE_STORE).getAll()) as StoredProfile[]; }
    finally { db.close(); }
}

export async function putStoredProfile(profile: Omit<StoredProfile, 'updatedAt'>): Promise<void> {
    const db = await openCameraRawDatabase();
    try { await requestResult(db.transaction(PROFILE_STORE, 'readwrite').objectStore(PROFILE_STORE).put({ ...profile, updatedAt: Date.now() })); }
    finally { db.close(); }
}

export async function deleteStoredProfile(id: string): Promise<void> {
    const db = await openCameraRawDatabase();
    try { await requestResult(db.transaction(PROFILE_STORE, 'readwrite').objectStore(PROFILE_STORE).delete(id)); }
    finally { db.close(); }
}
