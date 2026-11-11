<script setup lang="ts">
import { NIcon } from 'naive-ui';
import { ArrowBackOutline, ArrowUpCircleOutline, CalendarClearOutline } from '@vicons/ionicons5';
import type { Place, Schedule, Trip } from '../../types';
import { scheduleDateLabel, scheduleDay, tripDateRange } from '../../utils/time';
import AppIconButton from '../ui/AppIconButton.vue';
import PlaceDetailPanel from './PlaceDetailPanel.vue';

const props = defineProps<{ trip: Trip; selectedPlace?: Place }>();
const emit = defineEmits<{ back: []; export: []; selectPlace: [place: Place]; closePlace: [] }>();

function firstPlace(schedule: Schedule) {
    for (const item of schedule.items) {
        if (item.kind === 'place') return item.place;
        if (item.kind === 'transit') return item.transit.origin;
    }
}
function selectSchedule(schedule: Schedule) {
    const place = firstPlace(schedule);
    if (place) emit('selectPlace', place);
}
</script>

<template>
    <div class="plan-view">
        <header class="plan-header">
            <a href="#/" class="back" aria-label="返回世界地图" @click="emit('back')">
                <NIcon :size="20"><ArrowBackOutline /></NIcon><span>世界地图</span>
            </a>
            <div class="trip-heading">
                <h1>{{ props.trip.title }}</h1>
                <span><NIcon :size="13"><CalendarClearOutline /></NIcon>{{ tripDateRange(props.trip) }} · {{ props.trip.schedules.length }} 天</span>
            </div>
            <AppIconButton label="导出当前旅行计划" @click="emit('export')"><NIcon :size="19"><ArrowUpCircleOutline /></NIcon></AppIconButton>
        </header>

        <nav v-if="props.trip.schedules.length" class="day-nav" aria-label="每日行程导航">
            <span class="day-nav__label">ITINERARY</span>
            <button v-for="(schedule, index) in props.trip.schedules" :key="schedule.id" type="button"
                :disabled="!firstPlace(schedule)" @click="selectSchedule(schedule)">
                <span class="day-nav__number">{{ String(scheduleDay(schedule, index)).padStart(2, '0') }}</span>
                <span class="day-nav__copy"><strong>{{ schedule.title || `第 ${scheduleDay(schedule, index)} 天` }}</strong><small>{{ scheduleDateLabel(schedule) }}</small></span>
            </button>
        </nav>

        <PlaceDetailPanel :place="props.selectedPlace" @close="emit('closePlace')" />
    </div>
</template>

<style lang="scss" scoped>
.plan-view { position: absolute; inset: 0; z-index: 500; pointer-events: none; }
.plan-header {
    position: absolute; top: 20px; left: 22px; right: 22px; display: grid; grid-template-columns: 1fr auto 1fr;
    align-items: center; pointer-events: none;
}
.back {
    display: inline-flex; align-items: center; justify-self: start; gap: 8px; height: 40px; padding: 0 14px;
    border: 1px solid rgba(255,255,255,.12); border-radius: 13px; color: rgba(255,255,255,.82);
    background: rgba(24,31,32,.62); text-decoration: none; font-size: 12px; pointer-events: auto;
    backdrop-filter: blur(18px); transition: background .2s ease, transform .2s ease;
    &:hover { background: rgba(53,65,63,.8); transform: translateX(-2px); }
    &:focus-visible { outline: 2px solid #d6e9ae; outline-offset: 3px; }
}
.trip-heading { text-align: center; color: #f5f5f0; text-shadow: 0 2px 15px rgba(0,0,0,.5); }
.trip-heading h1 { margin: 0 0 7px; font-size: 23px; font-weight: 570; letter-spacing: 1px; }
.trip-heading span { display: flex; align-items: center; justify-content: center; gap: 5px; color: rgba(255,255,255,.55); font-size: 10px; }
.plan-header > :last-child { justify-self: end; pointer-events: auto; }
.day-nav {
    position: absolute; top: 94px; left: 22px; display: flex; flex-direction: column; gap: 5px; width: 190px; padding: 15px 10px 10px;
    border: 1px solid rgba(255,255,255,.11); border-radius: 18px; background: rgba(23,30,31,.64);
    box-shadow: 0 12px 35px rgba(0,0,0,.16); backdrop-filter: blur(20px); pointer-events: auto;
    &__label { padding: 0 10px 8px; color: rgba(255,255,255,.35); font-size: 8px; letter-spacing: 2px; }
    button {
        display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 9px; border: 0; border-radius: 11px;
        color: #eef1e9; background: transparent; text-align: left; cursor: pointer;
        transition: background .2s ease, transform .2s ease;
        &:hover { background: rgba(220,235,189,.1); transform: translateX(2px); }
        &:focus-visible { outline: 2px solid #d6e9ae; outline-offset: 1px; }
    }
    &__number { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid rgba(220,235,189,.24); border-radius: 9px; color: #dcebbd; font-size: 11px; }
    &__copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
    &__copy strong { overflow: hidden; font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
    &__copy small { color: rgba(255,255,255,.4); font-size: 9px; }
}
.plan-enter-active, .plan-leave-active { transition: opacity .4s ease, transform .55s cubic-bezier(.2,.8,.2,1); }
.plan-enter-from, .plan-leave-to { opacity: 0; transform: translateY(12px); }
@media (max-width: 700px) {
    .plan-header { top: 14px; left: 14px; right: 14px; grid-template-columns: 1fr auto; }
    .trip-heading { position: absolute; top: 55px; left: 0; text-align: left; }
    .trip-heading h1 { font-size: 20px; }
    .trip-heading span { justify-content: flex-start; }
    .back span { display: none; }
    .back { width: 40px; padding: 0; justify-content: center; }
    .day-nav { top: auto; right: 12px; bottom: 16px; left: 12px; width: auto; flex-direction: row; padding: 8px; overflow-x: auto; }
    .day-nav__label { display: none; }
    .day-nav button { min-width: 125px; }
}
</style>
