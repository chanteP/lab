<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { TravelMap } from '../../map/TravelMap';
import type { Place, Trip } from '../../types';

const props = defineProps<{
    trips: Trip[];
    activeTrip?: Trip;
    selectedPlace?: Place;
}>();
const emit = defineEmits<{
    openTrip: [id: string];
    editTrip: [id: string];
    selectPlace: [place: Place];
}>();
const container = ref<HTMLElement>();
let map: TravelMap | undefined;

onMounted(() => {
    map = new TravelMap(container.value!, {
        onOpenTrip: (id) => emit('openTrip', id),
        onEditTrip: (id) => emit('editTrip', id),
        onSelectPlace: (place) => emit('selectPlace', place),
    });
    if (props.activeTrip) map.renderPlan(props.activeTrip, false);
    else map.renderHome(props.trips);
});
watch(() => props.trips, (trips) => {
    if (!props.activeTrip) map?.renderHome(trips);
}, { deep: false });
watch(() => props.activeTrip, (trip, previous) => {
    if (trip) map?.renderPlan(trip, previous?.id !== trip.id);
    else map?.renderHome(props.trips, Boolean(previous));
});
watch(() => props.selectedPlace, (place, previous) => {
    if (place) map?.focusPlace(place);
    else if (previous && props.activeTrip) map?.restorePlan(props.activeTrip);
});
onBeforeUnmount(() => map?.destroy());
</script>

<template>
    <div ref="container" class="travel-map" aria-label="旅行交互地图" />
</template>

<style lang="scss">
.travel-map {
    position: absolute;
    inset: 0;
    background: #101516;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif;

    .leaflet-tile-pane { filter: invert(.92) hue-rotate(180deg) saturate(.32) brightness(.72) contrast(.92); }
    .leaflet-container { background: #101516; }
    .leaflet-control-zoom {
        margin: 0 0 28px 24px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 8px 30px rgba(0,0,0,.22);
        backdrop-filter: blur(18px);
        a {
            width: 36px; height: 36px; line-height: 34px;
            color: rgba(255,255,255,.82); background: rgba(24,31,32,.72);
            border-color: rgba(255,255,255,.1); font-size: 20px;
            transition: background .2s ease;
            &:hover { background: rgba(48,59,59,.9); }
        }
    }
    .leaflet-control-attribution {
        padding: 3px 7px; color: rgba(255,255,255,.42); background: rgba(13,18,19,.5);
        font-size: 9px; backdrop-filter: blur(8px);
        a { color: rgba(255,255,255,.55); }
    }
    .leaflet-tooltip.travel-route-tooltip {
        border: 1px solid rgba(255,255,255,.12); border-radius: 9px;
        background: rgba(20,27,28,.88); color: #f3f5f2;
        box-shadow: 0 8px 24px rgba(0,0,0,.2); backdrop-filter: blur(12px);
        &::before { display: none; }
    }
}

.travel-trip-marker, .travel-place-marker { background: none; border: 0; overflow: visible !important; }
.trip-pin {
    position: relative; width: 126px; height: 154px;
    &__main {
        position: absolute; z-index: 2; inset: 0; padding: 0; border: 0; cursor: pointer;
        background: transparent; filter: drop-shadow(0 12px 12px rgba(0,0,0,.34));
        transition: transform .38s cubic-bezier(.2,.8,.2,1), filter .3s ease;
        &:focus-visible { outline: 2px solid #d6ff7f; outline-offset: 5px; border-radius: 12px; }
    }
    &__photo {
        position: relative; height: 126px; padding: 6px; overflow: hidden;
        border: 1px solid rgba(255,255,255,.65); border-radius: 12px;
        background: #f1efe8; transform: rotate(-1.5deg);
    }
    &__image { width: 100%; height: 100%; object-fit: cover; border-radius: 7px; pointer-events: none; }
    &__placeholder {
        display: grid; place-items: center; height: 100%; border-radius: 7px;
        color: #35413c; background: linear-gradient(145deg, #d9e5ce, #a8c5b3);
        font-size: 15px; letter-spacing: 3px; font-weight: 700;
    }
    &__shine {
        position: absolute; inset: 6px; border-radius: 7px; pointer-events: none;
        background: linear-gradient(125deg, rgba(255,255,255,.25), transparent 42%, rgba(0,0,0,.12));
    }
    &__point {
        display: block; width: 19px; height: 19px; margin: -2px auto 0;
        border: 4px solid #f4f1e9; border-radius: 50% 50% 50% 0;
        background: #78917e; transform: rotate(-45deg); box-shadow: 0 4px 8px rgba(0,0,0,.28);
    }
    &__cover {
        position: absolute; z-index: 1; left: 7px; top: 6px; width: 190px; min-height: 148px;
        display: flex; flex-direction: column; align-items: flex-start; padding: 15px;
        box-sizing: border-box; border: 1px solid rgba(255,255,255,.17); border-radius: 13px;
        color: #f3f4ef; background: rgba(35,46,43,.96); box-shadow: 0 14px 35px rgba(0,0,0,.3);
        opacity: 0; transform: translate(-8px, 12px) rotate(-8deg) scale(.88);
        transform-origin: 20% 100%; pointer-events: none;
        transition: transform .48s cubic-bezier(.16,1,.3,1), opacity .22s ease;
        backdrop-filter: blur(20px);
    }
    &:hover &__cover, &:focus-within &__cover {
        opacity: 1; transform: translate(91px, -27px) rotate(3deg) scale(1); pointer-events: auto;
    }
    &:hover &__main, &:focus-within &__main { transform: translateY(-9px) rotate(1deg); filter: drop-shadow(0 20px 16px rgba(0,0,0,.38)); }
    &__eyebrow { color: #d6e9ae; font-size: 8px; font-weight: 700; letter-spacing: 1.6px; }
    &__title { margin-top: 8px; font-size: 17px; line-height: 1.25; }
    &__dates { margin-top: 5px; color: rgba(255,255,255,.43); font-size: 9px; font-variant-numeric: tabular-nums; }
    &__description {
        display: -webkit-box; margin-top: 6px; overflow: hidden; color: rgba(255,255,255,.65);
        font-size: 11px; line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    &__edit {
        margin-top: auto; padding: 8px 0 0; border: 0; color: #d6e9ae; background: none;
        font-size: 10px; cursor: pointer;
        &:focus-visible { outline: 1px solid #d6e9ae; outline-offset: 3px; }
    }
}
.place-pin {
    position: relative; width: 56px;
    &__button {
        position: relative; display: flex; flex-direction: column; align-items: center; padding: 0;
        border: 0; background: transparent; cursor: pointer; filter: drop-shadow(0 7px 8px rgba(0,0,0,.4));
        transition: transform .28s cubic-bezier(.2,.8,.2,1);
        &:hover { transform: translateY(-5px) scale(1.05); }
        &:focus-visible { outline: 2px solid #d6ff7f; outline-offset: 4px; border-radius: 25px; }
    }
    &__image-wrap {
        display: grid; place-items: center; width: 46px; height: 46px; padding: 3px;
        box-sizing: border-box; border: 1px solid rgba(255,255,255,.8); border-radius: 50%;
        background: #eff0e8;
    }
    &__image { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; pointer-events: none; }
    &__initial { color: #3c5247; font-size: 19px; font-weight: 650; }
    &__name {
        position: absolute; left: 50%; top: 51px; width: max-content; max-width: 140px; padding: 4px 8px;
        overflow: hidden; text-overflow: ellipsis; border: 1px solid rgba(255,255,255,.12); border-radius: 7px;
        color: #fff; background: rgba(22,29,29,.8); font-size: 11px; white-space: nowrap;
        transform: translateX(-50%); backdrop-filter: blur(10px);
    }
    &__dot { width: 7px; height: 7px; margin-top: 2px; border: 2px solid #fff; border-radius: 50%; background: #92ae8f; }
    &__day {
        position: absolute; left: 50%; bottom: 69px; display: flex; align-items: center; gap: 7px;
        width: max-content; padding: 8px 12px; border: 1px solid rgba(255,255,255,.22); border-radius: 12px;
        color: #202820; background: rgba(224,239,195,.95); box-shadow: 0 7px 20px rgba(0,0,0,.24);
        transform: translateX(-50%); backdrop-filter: blur(12px);
        &::after {
            content: ''; position: absolute; left: calc(50% - 5px); bottom: -5px; width: 10px; height: 10px;
            background: rgba(224,239,195,.95); transform: rotate(45deg);
        }
        strong { font-size: 12px; }
        span { color: #586653; font-size: 10px; }
    }
}
@media (max-width: 700px) {
    .trip-pin:hover .trip-pin__cover { transform: translate(45px, -30px) rotate(3deg) scale(.92); }
    .place-pin__name { max-width: 100px; }
}
</style>
