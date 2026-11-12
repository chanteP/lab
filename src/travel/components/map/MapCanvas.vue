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
    &.leaflet-container .leaflet-control-attribution {
        margin: 0 10px 10px 0; padding: 4px 8px; border: 1px solid rgba(255,255,255,.09); border-radius: 8px;
        color: rgba(255,255,255,.48); background: rgba(13,18,19,.78);
        font-size: 9px; backdrop-filter: blur(8px);
        a { color: rgba(255,255,255,.62); }
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
    position: relative; width: 144px; height: 142px;
    &__main {
        position: absolute; z-index: 2; inset: 0; padding: 0; border: 0; cursor: pointer;
        background: transparent; filter: drop-shadow(0 12px 16px rgba(0,0,0,.32));
        transition: transform .38s cubic-bezier(.2,.8,.2,1), filter .3s ease;
        &:focus-visible { outline: 2px solid #d6ff7f; outline-offset: 5px; border-radius: 17px; }
    }
    &__photo {
        position: relative; height: 112px; overflow: hidden; border: 1px solid rgba(255,255,255,.28);
        border-radius: 16px; background: #293630; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
    }
    &__image { width: 100%; height: 100%; object-fit: cover; pointer-events: none; transition: transform .55s cubic-bezier(.2,.8,.2,1); }
    &__placeholder {
        display: grid; place-items: center; height: 100%; color: #35413c;
        background: linear-gradient(145deg, #d9e5ce, #a8c5b3);
        font-size: 15px; letter-spacing: 3px; font-weight: 700;
    }
    &__shine {
        position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        background: linear-gradient(145deg, rgba(255,255,255,.12), transparent 45%, rgba(0,0,0,.1));
    }
    &__point {
        position: relative; display: block; width: 2px; height: 15px; margin: 5px auto 0;
        border-radius: 2px; background: rgba(225,235,215,.72); box-shadow: 0 2px 5px rgba(0,0,0,.3);
        &::after {
            content: ''; position: absolute; left: 50%; bottom: -5px; width: 6px; height: 6px;
            border: 1px solid rgba(255,255,255,.75); border-radius: 50%; background: #92ae8f;
            transform: translateX(-50%); box-shadow: 0 2px 5px rgba(0,0,0,.3);
        }
    }
    &__cover {
        position: absolute; z-index: 4; left: 0; top: 0; width: 222px; min-height: 148px;
        display: flex; flex-direction: column; align-items: flex-start; padding: 17px;
        box-sizing: border-box; border: 1px solid rgba(255,255,255,.17); border-radius: 16px;
        color: #f3f4ef; background: rgba(35,46,43,.97); box-shadow: 0 18px 45px rgba(0,0,0,.36);
        opacity: 0; transform: translate(24px, 14px) rotate(-5deg) scale(.9);
        transform-origin: 0 70%; pointer-events: none;
        transition: transform .46s cubic-bezier(.16,1,.3,1), opacity .2s ease;
        backdrop-filter: blur(20px);
    }
    &:hover &__cover, &:focus-within &__cover {
        opacity: 1; transform: translate(154px, -6px) rotate(1.5deg) scale(1); pointer-events: auto;
    }
    &--left:hover &__cover, &--left:focus-within &__cover { transform: translate(-230px, -6px) rotate(-1.5deg) scale(1); }
    &--above:hover &__cover, &--above:focus-within &__cover { transform: translate(-39px, -166px) rotate(0) scale(.94); }
    &:hover &__main, &:focus-within &__main { transform: translateY(-6px); filter: drop-shadow(0 18px 20px rgba(0,0,0,.38)); }
    &:hover &__image, &:focus-within &__image { transform: scale(1.045); }
    &__eyebrow { color: #d6e9ae; font-size: 8px; font-weight: 700; letter-spacing: 1.6px; }
    &__title { margin-top: 8px; font-size: 18px; line-height: 1.3; }
    &__dates { margin-top: 5px; color: rgba(255,255,255,.48); font-size: 10px; font-variant-numeric: tabular-nums; }
    &__description {
        display: -webkit-box; margin-top: 8px; overflow: hidden; color: rgba(255,255,255,.68);
        font-size: 11px; line-height: 1.55; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    &__edit {
        margin-top: auto; padding: 10px 0 0; border: 0; color: #d6e9ae; background: none;
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
    .place-pin__name { max-width: 100px; }
}
</style>
