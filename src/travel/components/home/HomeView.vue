<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui';
import { AddOutline, ArrowDownCircleOutline, ArrowUpCircleOutline, MapOutline } from '@vicons/ionicons5';
import type { Trip } from '../../types';

const props = defineProps<{ trips: Trip[]; loading: boolean }>();
const emit = defineEmits<{ import: []; exportAll: []; create: [] }>();
</script>

<template>
    <div class="home-view">
        <header class="topbar">
            <a class="brand" href="#/" aria-label="Atlas 旅行地图首页">
                <span class="brand__mark"><NIcon :size="20"><MapOutline /></NIcon></span>
                <span>ATLAS</span>
                <span class="brand__edition">TRAVEL NOTES</span>
            </a>
            <nav class="actions" aria-label="旅行计划操作">
                <NButton class="action action--quiet" tertiary aria-label="导入 YAML" @click="emit('import')">
                    <template #icon><NIcon><ArrowDownCircleOutline /></NIcon></template>
                    导入 YAML
                </NButton>
                <NButton class="action action--quiet" tertiary aria-label="导出全部旅行计划" :disabled="!props.trips.length" @click="emit('exportAll')">
                    <template #icon><NIcon><ArrowUpCircleOutline /></NIcon></template>
                    导出全部
                </NButton>
                <NButton class="action action--new" aria-label="新建旅行" @click="emit('create')">
                    <template #icon><NIcon><AddOutline /></NIcon></template>
                    新建旅行
                </NButton>
            </nav>
        </header>

        <section v-if="!props.loading && !props.trips.length" class="empty-state" aria-labelledby="empty-title">
            <span class="empty-state__kicker">YOUR NEXT CHAPTER</span>
            <h1 id="empty-title">把世界，变成你的旅行手记。</h1>
            <p>导入一份 YAML 行程，或从第一个目的地开始。</p>
            <div class="empty-state__actions">
                <NButton size="large" class="action action--new" @click="emit('import')">导入旅行计划</NButton>
                <NButton size="large" tertiary class="action action--quiet" @click="emit('create')">创建空白计划</NButton>
            </div>
        </section>

        <div v-else-if="props.trips.length" class="collection-note" aria-live="polite">
            <span class="collection-note__line" />
            <span>{{ String(props.trips.length).padStart(2, '0') }} 段旅程</span>
            <span class="collection-note__hint">悬停翻阅 · 点击启程</span>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.home-view { position: absolute; inset: 0; z-index: 500; pointer-events: none; }
.topbar {
    position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between;
    padding: 24px 28px; pointer-events: none;
    background: linear-gradient(to bottom, rgba(10,15,16,.52), transparent);
}
.brand {
    display: flex; align-items: center; gap: 10px; color: #f4f5f0; text-decoration: none;
    font-size: 17px; font-weight: 650; letter-spacing: 3px; pointer-events: auto;
    &:focus-visible { outline: 2px solid #d6e9ae; outline-offset: 5px; border-radius: 8px; }
    &__mark {
        display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid rgba(255,255,255,.2);
        border-radius: 12px; color: #e0efbe; background: rgba(32,42,40,.56); backdrop-filter: blur(16px);
    }
    &__edition { margin-left: 2px; color: rgba(255,255,255,.4); font-size: 8px; font-weight: 500; letter-spacing: 1.8px; }
}
.actions { display: flex; gap: 9px; pointer-events: auto; }
.action {
    border-radius: 12px; font-weight: 500; letter-spacing: .2px;
    &--quiet { color: rgba(255,255,255,.82); background: rgba(24,31,32,.58); backdrop-filter: blur(18px); }
    &--new { color: #243021; background: #dcebbd; border: 1px solid rgba(255,255,255,.2); }
}
.empty-state {
    position: absolute; left: 50%; top: 50%; width: min(560px, calc(100% - 48px)); padding: 38px;
    box-sizing: border-box; text-align: center; border: 1px solid rgba(255,255,255,.12); border-radius: 26px;
    color: #f4f5f0; background: rgba(20,28,28,.7); box-shadow: 0 28px 80px rgba(0,0,0,.24);
    transform: translate(-50%, -50%); backdrop-filter: blur(28px); pointer-events: auto;
    &__kicker { color: #cdddac; font-size: 10px; letter-spacing: 3px; }
    h1 { margin: 15px 0 10px; font-size: clamp(25px, 4vw, 38px); font-weight: 580; letter-spacing: 1px; }
    p { margin: 0; color: rgba(255,255,255,.58); font-size: 14px; }
    &__actions { display: flex; justify-content: center; gap: 10px; margin-top: 26px; }
}
.collection-note {
    position: absolute; left: 30px; bottom: 88px; display: flex; align-items: center; gap: 12px;
    color: rgba(255,255,255,.78); font-size: 12px; letter-spacing: 1px;
    &__line { width: 26px; height: 1px; background: #dcebbd; }
    &__hint { color: rgba(255,255,255,.38); font-size: 10px; }
}
.home-enter-active, .home-leave-active { transition: opacity .45s ease, transform .55s cubic-bezier(.2,.8,.2,1); }
.home-enter-from, .home-leave-to { opacity: 0; transform: scale(1.025); }
@media (max-width: 720px) {
    .topbar { padding: 16px; align-items: flex-start; }
    .brand__edition, .topbar .action :deep(.n-button__content) { display: none; }
    .actions { gap: 6px; }
    .action { width: 40px; padding: 0; }
    .collection-note { left: 18px; bottom: 86px; }
    .collection-note__hint { display: none; }
}
</style>
