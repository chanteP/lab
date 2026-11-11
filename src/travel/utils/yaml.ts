import { parse, stringify } from 'yaml';
import type { Trip, TripCollection } from '../types';
import { normalizeTrip, normalizeTripCollection } from './normalize';

/** Standard YAML with every exported string double-quoted for stable agent-generated data. */
export function serializeTrip(trip: Trip) {
    return stringify({ trip }, { defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN', lineWidth: 0 });
}

export function serializeTripCollection(trips: Trip[]) {
    const collection: TripCollection = { trips };
    return stringify(collection, { defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN', lineWidth: 0 });
}

export function parseTrips(source: string): Trip[] {
    const document = parse(source) as unknown;
    if (!document || typeof document !== 'object') throw new Error('YAML 根节点必须是 trip 或 trips');
    const root = document as Record<string, unknown>;
    if (Array.isArray(root.trips)) return normalizeTripCollection(root).trips;
    if (root.trip) return [normalizeTrip(root.trip)];
    // Also accept a bare trip object to keep agent-generated imports concise.
    if (root.title && root.destination) return [normalizeTrip(root)];
    throw new Error('YAML 中缺少 trip 或 trips');
}

export function downloadYaml(source: string, filename: string) {
    const url = URL.createObjectURL(new Blob([source], { type: 'application/yaml;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filename.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_') || 'travel'}.yaml`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
