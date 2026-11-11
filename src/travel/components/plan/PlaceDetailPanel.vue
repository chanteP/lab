<script setup lang="ts">
import { NIcon, NProgress } from 'naive-ui';
import { Checkmark, CloseOutline, LocationOutline, TimeOutline } from '@vicons/ionicons5';
import type { Place } from '../../types';
import { durationLabel } from '../../utils/time';
import AppIconButton from '../ui/AppIconButton.vue';

const props = defineProps<{ place?: Place }>();
const emit = defineEmits<{ close: [] }>();
const categoryNames = { attraction: '景点', lodging: '住宿', transport: '交通' };
function completed(place: Place) { return place.checkpoints.filter((item) => item.checked).length; }
</script>

<template>
    <Transition name="detail">
        <aside v-if="props.place" class="detail-panel" aria-label="地点详情">
            <div class="hero">
                <img v-if="props.place.images[0]" :src="props.place.images[0]" :alt="props.place.name" />
                <div v-else class="hero__placeholder"><NIcon :size="42"><LocationOutline /></NIcon></div>
                <div class="hero__shade" />
                <AppIconButton class="detail-panel__close" label="关闭地点详情" @click="emit('close')">
                    <NIcon :size="20"><CloseOutline /></NIcon>
                </AppIconButton>
                <div class="hero__caption">
                    <div class="categories">
                        <span v-for="category in props.place.categories" :key="category">{{ categoryNames[category] }}</span>
                    </div>
                    <h2>{{ props.place.name }}</h2>
                </div>
            </div>
            <div class="content">
                <div v-if="props.place.recommendedDurationMinutes" class="duration">
                    <NIcon :size="17"><TimeOutline /></NIcon>
                    <span>建议停留</span><strong>{{ durationLabel(props.place.recommendedDurationMinutes) }}</strong>
                </div>
                <p class="description">{{ props.place.description || '还没有地点介绍，可以在 YAML 中补充 description。' }}</p>
                <div v-if="props.place.images.length > 1" class="gallery" aria-label="地点图片">
                    <img v-for="(image, index) in props.place.images.slice(1, 4)" :key="image" :src="image" :alt="`${props.place.name} 图片 ${index + 2}`" />
                </div>
                <section v-if="props.place.checkpoints.length" class="checkpoints">
                    <div class="checkpoints__heading">
                        <h3>旅行清单</h3><span>{{ completed(props.place) }} / {{ props.place.checkpoints.length }}</span>
                    </div>
                    <NProgress type="line" :percentage="Math.round(completed(props.place) / props.place.checkpoints.length * 100)"
                        :show-indicator="false" color="#cdddac" rail-color="rgba(255,255,255,.08)" :height="4" />
                    <ul>
                        <li v-for="checkpoint in props.place.checkpoints" :key="checkpoint.title" :class="{ checked: checkpoint.checked }">
                            <span class="check"><NIcon v-if="checkpoint.checked" :size="13"><Checkmark /></NIcon></span>
                            <div><strong>{{ checkpoint.title }}</strong><p v-if="checkpoint.description">{{ checkpoint.description }}</p></div>
                        </li>
                    </ul>
                </section>
                <div class="coordinates"><NIcon :size="14"><LocationOutline /></NIcon>{{ props.place.coordinates.lat.toFixed(5) }}, {{ props.place.coordinates.lng.toFixed(5) }}</div>
            </div>
        </aside>
    </Transition>
</template>

<style lang="scss" scoped>
.detail-panel {
    position: absolute; z-index: 600; top: 88px; right: 20px; bottom: 20px; width: min(380px, calc(100vw - 40px));
    overflow: hidden auto; border: 1px solid rgba(255,255,255,.14); border-radius: 24px;
    color: #f1f3ed; background: rgba(26,34,34,.9); box-shadow: 0 24px 70px rgba(0,0,0,.36);
    backdrop-filter: blur(28px) saturate(1.2); scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;
}
.hero { position: relative; height: 255px; background: #35433e; }
.hero img { width: 100%; height: 100%; object-fit: cover; }
.hero__placeholder { display: grid; place-items: center; height: 100%; color: #bdcda9; }
.hero__shade { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.04) 35%, rgba(17,24,23,.86)); }
.detail-panel__close { position: absolute; top: 14px; right: 14px; }
.hero__caption { position: absolute; left: 24px; right: 24px; bottom: 20px; }
.categories { display: flex; gap: 6px; margin-bottom: 9px; }
.categories span { padding: 4px 8px; border: 1px solid rgba(255,255,255,.22); border-radius: 6px; color: #e0efbe; background: rgba(30,40,35,.38); font-size: 9px; letter-spacing: 1px; }
h2 { margin: 0; font-size: 29px; font-weight: 580; letter-spacing: .5px; }
.content { padding: 20px 24px 26px; }
.duration { display: flex; align-items: center; gap: 7px; color: rgba(255,255,255,.52); font-size: 12px; }
.duration strong { margin-left: auto; color: #dfe7d4; font-weight: 500; }
.description { margin: 18px 0; color: rgba(255,255,255,.68); font-size: 13px; line-height: 1.85; }
.gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0 0 22px; }
.gallery img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 9px; }
.checkpoints { padding-top: 20px; border-top: 1px solid rgba(255,255,255,.09); }
.checkpoints__heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.checkpoints h3 { margin: 0; font-size: 14px; font-weight: 550; }
.checkpoints__heading span { color: #cdddac; font-size: 11px; }
ul { display: grid; gap: 16px; margin: 20px 0 0; padding: 0; list-style: none; }
li { display: flex; align-items: flex-start; gap: 10px; }
.check { display: grid; flex: 0 0 auto; place-items: center; width: 18px; height: 18px; margin-top: 1px; border: 1px solid rgba(255,255,255,.22); border-radius: 50%; color: #283326; }
li.checked .check { border-color: #cdddac; background: #cdddac; }
li strong { color: rgba(255,255,255,.83); font-size: 12px; font-weight: 500; }
li.checked strong { color: rgba(255,255,255,.4); text-decoration: line-through; }
li p { margin: 5px 0 0; color: rgba(255,255,255,.43); font-size: 11px; line-height: 1.65; }
.coordinates { display: flex; align-items: center; gap: 5px; margin-top: 25px; color: rgba(255,255,255,.3); font-size: 10px; font-variant-numeric: tabular-nums; }
.detail-enter-active, .detail-leave-active { transition: opacity .35s ease, transform .5s cubic-bezier(.16,1,.3,1); }
.detail-enter-from, .detail-leave-to { opacity: 0; transform: translateX(45px) scale(.97); }
@media (max-width: 700px) {
    .detail-panel { top: auto; right: 12px; bottom: 12px; left: 12px; width: auto; max-height: 58vh; border-radius: 22px; }
    .hero { height: 190px; }
}
</style>
