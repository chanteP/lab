/** A latitude/longitude pair. Longitude is named `lng` to match GeoJSON and map SDKs. */
export interface Coordinates {
    lat: number;
    lng: number;
}

/** ISO timestamp, relative day (`day1`), or local time (`10:30`). */
export type TimeExpression = string;

export type PointCategory = 'attraction' | 'lodging' | 'transport';
export type TransitMode = 'unknown' | 'walking' | 'driving' | 'bus' | 'train' | 'flight';

export interface Checkpoint {
    checked: boolean;
    title: string;
    description?: string;
}

export interface Place {
    id: string;
    name: string;
    categories: PointCategory[];
    coordinates: Coordinates;
    images: string[];
    description?: string;
    recommendedDurationMinutes?: number;
    checkpoints: Checkpoint[];
}

export interface TransitRoute {
    /** Fixed path in travel order. When present, the map uses it instead of connecting stops directly. */
    path: Coordinates[];
    /** Optional Google encoded polyline for a future Google Maps Directions import. */
    encodedPolyline?: string;
    color?: string;
}

export interface Transit {
    title?: string;
    origin: Place;
    destination: Place;
    waypoints: Place[];
    durationMinutes?: number;
    mode: TransitMode;
    description?: string;
    route?: TransitRoute;
}

interface ItineraryItemBase {
    id: string;
    title?: string;
    description?: string;
    startTime: TimeExpression;
    endTime: TimeExpression;
    note?: string;
}

export interface PlaceItineraryItem extends ItineraryItemBase {
    kind: 'place';
    place: Place;
}

export interface TransitItineraryItem extends ItineraryItemBase {
    kind: 'transit';
    transit: Transit;
}

export type ItineraryItem = PlaceItineraryItem | TransitItineraryItem;

export interface Schedule {
    id: string;
    /** ISO timestamp or `dayN`. It controls the day badge and trip date range. */
    startTime: TimeExpression;
    title?: string;
    description?: string;
    items: ItineraryItem[];
    coverImages: string[];
}

export interface Trip {
    id: string;
    title: string;
    description?: string;
    destination: Coordinates;
    coverImages: string[];
    schedules: Schedule[];
    createdAt: string;
    updatedAt: string;
}

export interface TripSummary {
    id: string;
    title: string;
    description?: string;
    destination: Coordinates;
    coverImage?: string;
    days: number;
    dateRange: string;
}

export interface TripCollection {
    trips: Trip[];
}
