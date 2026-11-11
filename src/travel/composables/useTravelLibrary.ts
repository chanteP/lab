import { computed, ref } from 'vue';
import type { Trip } from '../types';
import { deleteStoredTrip, getActiveTripId, listStoredTrips, putStoredTrip, setActiveTripId } from '../stores/travelStore';
import { normalizeTrip } from '../utils/normalize';
import { parseTrips } from '../utils/yaml';

const trips = ref<Trip[]>([]);
const loading = ref(true);
let loadPromise: Promise<void> | undefined;

async function persist(trip: Trip) {
    const next = normalizeTrip({ ...trip, updatedAt: new Date().toISOString() });
    await putStoredTrip(next);
    const index = trips.value.findIndex((item) => item.id === next.id);
    if (index >= 0) trips.value = trips.value.map((item) => item.id === next.id ? next : item);
    else trips.value = [next, ...trips.value];
    return next;
}

export function useTravelLibrary() {
    async function loadTrips() {
        if (!loadPromise) {
            loadPromise = listStoredTrips().then((stored) => { trips.value = stored; }).finally(() => { loading.value = false; });
        }
        await loadPromise;
    }

    async function importYaml(source: string) {
        const imported = parseTrips(source);
        const saved: Trip[] = [];
        for (const trip of imported) saved.push(await persist(trip));
        return saved;
    }

    async function saveTrip(trip: Trip) {
        return persist(trip);
    }

    async function removeTrip(id: string) {
        await deleteStoredTrip(id);
        trips.value = trips.value.filter((trip) => trip.id !== id);
    }

    function rememberTrip(id: string) {
        setActiveTripId(id);
    }

    return {
        trips,
        loading,
        activeTrip: computed(() => trips.value.find((trip) => trip.id === getActiveTripId())),
        loadTrips,
        importYaml,
        saveTrip,
        removeTrip,
        rememberTrip,
    };
}
