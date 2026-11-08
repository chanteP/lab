import { parseDcp } from '../engine/dcp/parser';
import type { DcpCatalogEntry, DcpProfile } from '../engine/dcp/types';
import { builtinDcpCatalog } from '../profiles/catalog';
import { listStoredProfiles, putStoredProfile } from './profileStore';
import { setLoading } from './loading';

const cache = new Map<string, Promise<DcpProfile>>();

export async function loadDcpCatalog(): Promise<DcpCatalogEntry[]> {
    try {
        const custom = await listStoredProfiles();
        return [...builtinDcpCatalog, ...custom.map(({ bytes: _bytes, updatedAt: _updatedAt, ...entry }) => ({ ...entry, custom: true }))];
    } catch { return builtinDcpCatalog; }
}

async function fetchBytes(entry: DcpCatalogEntry): Promise<Uint8Array> {
    if (entry.custom) {
        const stored = (await listStoredProfiles()).find((profile) => profile.id === entry.id);
        if (!stored) throw new Error('导入的 DCP 已不存在');
        return stored.bytes;
    }
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`DCP 下载失败 (${response.status})`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body) return new Uint8Array(await response.arrayBuffer());
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read(); if (done) break;
        chunks.push(value); received += value.byteLength;
        setLoading({ text: `正在加载 ${entry.name}`, progress: total ? received / total * 100 : undefined });
    }
    const bytes = new Uint8Array(received); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
}

export function loadDcp(entry: DcpCatalogEntry): Promise<DcpProfile> {
    let task = cache.get(entry.id);
    if (!task) {
        task = fetchBytes(entry).then((bytes) => parseDcp(bytes, entry.fileName));
        cache.set(entry.id, task);
        task.catch(() => cache.delete(entry.id));
    }
    return task;
}

export async function importDcp(file: File): Promise<{ entry: DcpCatalogEntry; profile: DcpProfile }> {
    const bytes = new Uint8Array(await file.arrayBuffer()), profile = parseDcp(bytes, file.name);
    const entry: DcpCatalogEntry = {
        id: `custom-${crypto.randomUUID()}`, name: profile.name, cameraModel: profile.cameraModel,
        fileName: file.name, url: '', custom: true,
    };
    await putStoredProfile({ ...entry, bytes });
    cache.set(entry.id, Promise.resolve(profile));
    return { entry, profile };
}
