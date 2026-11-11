import type {
    Checkpoint, Coordinates, ItineraryItem, Place, PointCategory, Schedule, Transit, TransitMode, Trip, TripCollection,
} from '../types';
import { createId } from './id';

const object = (value: unknown, name: string): Record<string, any> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 必须是对象`);
    return value as Record<string, any>;
};
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = '') => value == null ? fallback : String(value);
const optionalText = (value: unknown) => value == null || value === '' ? undefined : String(value);
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeCoordinates(value: unknown): Coordinates {
    const data = object(value, 'coordinates');
    const lat = number(data.lat, NaN), lng = number(data.lng, NaN);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new Error('coordinates 必须包含有效的 lat 与 lng');
    }
    return { lat, lng };
}

function normalizeCheckpoint(value: unknown): Checkpoint {
    const data = object(value, 'checkpoint');
    return { checked: Boolean(data.checked), title: text(data.title, '待办事项'), description: optionalText(data.description) };
}

export function normalizePlace(value: unknown): Place {
    const data = object(value, 'place');
    const categories = list(data.categories).map(String).filter((item): item is PointCategory => ['attraction', 'lodging', 'transport'].includes(item));
    return {
        id: text(data.id) || createId(),
        name: text(data.name, '未命名地点'),
        categories: categories.length ? categories : ['attraction'],
        coordinates: normalizeCoordinates(data.coordinates),
        images: list(data.images).map(String),
        description: optionalText(data.description),
        recommendedDurationMinutes: data.recommendedDurationMinutes == null ? undefined : number(data.recommendedDurationMinutes),
        checkpoints: list(data.checkpoints).map(normalizeCheckpoint),
    };
}

function normalizeTransit(value: unknown): Transit {
    const data = object(value, 'transit');
    const modes: TransitMode[] = ['unknown', 'walking', 'driving', 'bus', 'train', 'flight'];
    const route = data.route ? object(data.route, 'transit.route') : undefined;
    return {
        title: optionalText(data.title),
        origin: normalizePlace(data.origin),
        destination: normalizePlace(data.destination),
        waypoints: list(data.waypoints).map(normalizePlace),
        durationMinutes: data.durationMinutes == null ? undefined : number(data.durationMinutes),
        mode: modes.includes(data.mode) ? data.mode : 'unknown',
        description: optionalText(data.description),
        route: route ? {
            path: list(route.path).map(normalizeCoordinates),
            encodedPolyline: optionalText(route.encodedPolyline),
            color: optionalText(route.color),
        } : undefined,
    };
}

function normalizeItem(value: unknown): ItineraryItem {
    const data = object(value, 'itinerary item');
    const base = {
        id: text(data.id) || createId(),
        title: optionalText(data.title),
        description: optionalText(data.description),
        startTime: text(data.startTime, 'day1'),
        endTime: text(data.endTime, data.startTime || 'day1'),
        note: optionalText(data.note),
    };
    if (data.kind === 'transit') return { ...base, kind: 'transit', transit: normalizeTransit(data.transit) };
    if (data.kind !== 'place') throw new Error('itinerary item.kind 必须是 place 或 transit');
    return { ...base, kind: 'place', place: normalizePlace(data.place) };
}

function normalizeSchedule(value: unknown, index: number): Schedule {
    const data = object(value, 'schedule');
    return {
        id: text(data.id) || createId(),
        startTime: text(data.startTime, `day${index + 1}`),
        title: optionalText(data.title),
        description: optionalText(data.description),
        items: list(data.items).map(normalizeItem),
        coverImages: list(data.coverImages).map(String),
    };
}

export function normalizeTrip(value: unknown): Trip {
    const data = object(value, 'trip');
    const now = new Date().toISOString();
    if (!text(data.title).trim()) throw new Error('trip.title 不能为空');
    return {
        id: text(data.id) || createId(),
        title: text(data.title),
        description: optionalText(data.description),
        destination: normalizeCoordinates(data.destination),
        coverImages: list(data.coverImages).map(String),
        schedules: list(data.schedules).map(normalizeSchedule),
        createdAt: text(data.createdAt, now),
        updatedAt: text(data.updatedAt, now),
    };
}

export function normalizeTripCollection(value: unknown): TripCollection {
    const data = object(value, 'trip collection');
    return { trips: list(data.trips).map(normalizeTrip) };
}
