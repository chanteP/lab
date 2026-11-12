import L, { type LatLngBoundsExpression, type Marker } from 'leaflet';
import type { Place, Schedule, Transit, Trip } from '../types';
import { scheduleDateLabel, scheduleDay, tripDateRange } from '../utils/time';

interface MapCallbacks {
    onOpenTrip: (id: string) => void;
    onEditTrip: (id: string) => void;
    onSelectPlace: (place: Place) => void;
}

const MODE_COLORS = {
    walking: '#8ed8b2', driving: '#82b7ff', bus: '#ffbd73', train: '#bd9dff', flight: '#f3f5f7', unknown: '#9ba7b4',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string) {
    const node = document.createElement(tag);
    node.className = className;
    if (content) node.textContent = content;
    return node;
}

function decodePolyline(value: string) {
    let index = 0, lat = 0, lng = 0;
    const coordinates: { lat: number; lng: number }[] = [];
    while (index < value.length) {
        const read = () => {
            let result = 0, shift = 0, byte: number;
            do {
                if (index >= value.length) throw new Error('Invalid encoded polyline');
                byte = value.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            return (result & 1) ? ~(result >> 1) : result >> 1;
        };
        lat += read(); lng += read();
        coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return coordinates;
}

function transitCoordinates(transit: Transit) {
    if (transit.route?.path && transit.route.path.length >= 2) return transit.route.path;
    if (transit.route?.encodedPolyline) {
        try { return decodePolyline(transit.route.encodedPolyline); } catch { /* Fall back to stop order below. */ }
    }
    return [transit.origin, ...transit.waypoints, transit.destination].map((place) => place.coordinates);
}

/** Leaflet provider. Keep map-specific behavior here so a Google Maps provider can replace it later. */
export class TravelMap {
    private map: L.Map;
    private layers = L.layerGroup();
    private markers: Marker[] = [];
    private callbacks: MapCallbacks;
    private focusGeneration = 0;

    constructor(container: HTMLElement, callbacks: MapCallbacks) {
        this.callbacks = callbacks;
        this.map = L.map(container, {
            center: [24, 18], zoom: 2.25, minZoom: 2, maxZoom: 19,
            zoomControl: false, attributionControl: false, worldCopyJump: true,
            zoomSnap: 0.25, zoomDelta: 0.5, preferCanvas: true,
        });
        L.control.zoom({ position: 'bottomleft' }).addTo(this.map);
        L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        ).addTo(this.map);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, detectRetina: true, className: 'travel-map-tiles',
        }).addTo(this.map);
        this.layers.addTo(this.map);
    }

    destroy() {
        this.focusGeneration++;
        this.map.remove();
    }

    resize() { this.map.invalidateSize({ animate: false }); }

    private clear() {
        this.focusGeneration++;
        this.layers.clearLayers();
        this.markers = [];
    }

    private fit(bounds: LatLngBoundsExpression, animate: boolean, maxZoom: number, padding: L.PointExpression = [64, 64]) {
        this.map.flyToBounds(bounds, { padding, maxZoom, animate, duration: animate ? 1.05 : 0, easeLinearity: 0.22 });
    }

    renderHome(trips: Trip[], animate = false) {
        this.clear();
        for (const trip of trips) this.addTripMarker(trip);
        if (!trips.length) this.map.setView([24, 18], 2.25, { animate });
        else if (trips.length === 1) this.map.flyTo(trips[0].destination, 4.5, { animate, duration: animate ? 1 : 0 });
        else this.fit(trips.map((trip) => [trip.destination.lat, trip.destination.lng]), animate, 5, [110, 110]);
    }

    private addTripMarker(trip: Trip) {
        const root = element('div', 'trip-pin');
        const main = element('button', 'trip-pin__main');
        main.type = 'button';
        main.setAttribute('aria-label', `打开旅行计划：${trip.title}`);
        const photo = element('div', 'trip-pin__photo');
        if (trip.coverImages[0]) {
            const image = element('img', 'trip-pin__image');
            image.src = trip.coverImages[0]; image.alt = ''; image.draggable = false;
            photo.append(image);
        } else photo.append(element('span', 'trip-pin__placeholder', 'ATLAS'));
        photo.append(element('span', 'trip-pin__shine'));
        main.append(photo, element('span', 'trip-pin__point'));

        const cover = element('div', 'trip-pin__cover');
        cover.append(element('span', 'trip-pin__eyebrow', `${trip.schedules.length || 1} DAY JOURNEY`));
        cover.append(element('strong', 'trip-pin__title', trip.title));
        cover.append(element('span', 'trip-pin__dates', tripDateRange(trip)));
        cover.append(element('span', 'trip-pin__description', trip.description || '为下一段旅程留下注脚。'));
        const edit = element('button', 'trip-pin__edit', '编辑标题与备注');
        edit.type = 'button'; edit.setAttribute('aria-label', `编辑旅行计划：${trip.title}`);
        cover.append(edit);
        root.append(cover, main);
        L.DomEvent.disableClickPropagation(root);
        L.DomEvent.disableScrollPropagation(root);
        L.DomEvent.on(main, 'click', () => this.callbacks.onOpenTrip(trip.id));
        L.DomEvent.on(edit, 'click', () => this.callbacks.onEditTrip(trip.id));
        const positionCover = () => this.positionTripCover(root, trip);
        L.DomEvent.on(root, 'mouseenter', positionCover);
        L.DomEvent.on(root, 'focusin', positionCover);
        const marker = L.marker(trip.destination, {
            icon: L.divIcon({ className: 'travel-trip-marker', html: root, iconSize: [144, 142], iconAnchor: [72, 140] }),
            keyboard: false, riseOnHover: true, zIndexOffset: 500,
        });
        this.layers.addLayer(marker); this.markers.push(marker);
    }

    private positionTripCover(root: HTMLElement, trip: Trip) {
        const point = this.map.latLngToContainerPoint(trip.destination);
        const width = this.map.getSize().x;
        root.classList.toggle('trip-pin--above', width <= 700);
        root.classList.toggle('trip-pin--left', width > 700 && point.x > width * 0.6);
    }

    renderPlan(trip: Trip, animate = true) {
        this.clear();
        const bounds: { lat: number; lng: number }[] = [];
        const seen = new Set<string>();

        // Routes sit below every point marker and use their stored geometry whenever available.
        trip.schedules.forEach((schedule) => schedule.items.forEach((item) => {
            if (item.kind !== 'transit') return;
            const coordinates = transitCoordinates(item.transit);
            bounds.push(...coordinates);
            const line = L.polyline(coordinates.map((point) => [point.lat, point.lng]), {
                color: item.transit.route?.color || MODE_COLORS[item.transit.mode],
                weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round',
                dashArray: item.transit.route ? undefined : '3 9',
            });
            line.bindTooltip(item.transit.title || item.title || '交通路线', { sticky: true, className: 'travel-route-tooltip' });
            this.layers.addLayer(line);
        }));

        trip.schedules.forEach((schedule, scheduleIndex) => {
            let first = true;
            schedule.items.forEach((item) => {
                const places = item.kind === 'place'
                    ? [item.place]
                    : [item.transit.origin, item.transit.destination];
                places.forEach((place) => {
                    bounds.push(place.coordinates);
                    const key = place.id || `${place.coordinates.lat},${place.coordinates.lng}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    this.addPlaceMarker(place, first ? schedule : undefined, scheduleIndex);
                    first = false;
                });
            });
        });
        if (!bounds.length) bounds.push(trip.destination);
        this.fit(bounds.map((point) => [point.lat, point.lng]), animate, 14, [76, 96]);
    }

    private addPlaceMarker(place: Place, schedule?: Schedule, scheduleIndex = 0) {
        const root = element('div', 'place-pin');
        if (schedule) {
            const badge = element('div', 'place-pin__day');
            badge.append(element('strong', '', `第 ${scheduleDay(schedule, scheduleIndex)} 天`), element('span', '', scheduleDateLabel(schedule)));
            root.append(badge);
        }
        const button = element('button', 'place-pin__button');
        button.type = 'button'; button.setAttribute('aria-label', `查看地点：${place.name}`);
        const imageWrap = element('span', 'place-pin__image-wrap');
        if (place.images[0]) {
            const image = element('img', 'place-pin__image');
            image.src = place.images[0]; image.alt = ''; image.draggable = false;
            imageWrap.append(image);
        } else imageWrap.append(element('span', 'place-pin__initial', place.name.slice(0, 1)));
        button.append(imageWrap, element('span', 'place-pin__name', place.name), element('span', 'place-pin__dot'));
        root.append(button);
        L.DomEvent.disableClickPropagation(root);
        L.DomEvent.disableScrollPropagation(root);
        L.DomEvent.on(button, 'click', () => this.callbacks.onSelectPlace(place));
        const marker = L.marker(place.coordinates, {
            icon: L.divIcon({ className: 'travel-place-marker', html: root, iconSize: [56, 70], iconAnchor: [28, 66] }),
            keyboard: false, riseOnHover: true, zIndexOffset: schedule ? 700 : 300,
        });
        this.layers.addLayer(marker); this.markers.push(marker);
    }

    focusPlace(place: Place) {
        const generation = ++this.focusGeneration;
        const offset = Math.min(190, this.map.getSize().x * 0.16);
        this.map.flyTo(place.coordinates, Math.max(this.map.getZoom(), 13), { duration: 0.65, easeLinearity: 0.2 });
        this.map.once('moveend', () => {
            if (generation !== this.focusGeneration) return;
            this.map.panBy([offset, 0], { animate: true, duration: 0.35, easeLinearity: 0.2 });
        });
    }

    restorePlan(trip: Trip) {
        this.focusGeneration++;
        const coordinates = trip.schedules.flatMap((schedule) => schedule.items.flatMap((item) => item.kind === 'place'
            ? [item.place.coordinates]
            : [item.transit.origin.coordinates, item.transit.destination.coordinates]));
        if (coordinates.length) this.fit(coordinates.map((point) => [point.lat, point.lng]), true, 14, [76, 96]);
    }
}
