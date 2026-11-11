<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NButton, NInput, NInputNumber, NModal } from 'naive-ui';
import type { Trip } from '../../types';
import { createId } from '../../utils/id';

const props = defineProps<{ show: boolean; trip?: Trip }>();
const emit = defineEmits<{ close: []; save: [trip: Trip]; export: [trip: Trip] }>();
const draft = ref<Trip>();
const isNew = computed(() => !props.trip);
const cloneTrip = (trip: Trip) => JSON.parse(JSON.stringify(trip)) as Trip;

function emptyTrip(): Trip {
    const now = new Date().toISOString();
    return {
        id: createId(), title: '', description: '', destination: { lat: 35, lng: 105 },
        coverImages: [], schedules: [], createdAt: now, updatedAt: now,
    };
}

watch(() => props.show, (show) => {
    if (show) draft.value = props.trip ? cloneTrip(props.trip) : emptyTrip();
}, { immediate: true });
watch(() => props.trip, (trip) => { if (props.show && trip) draft.value = cloneTrip(trip); });

function updateCover(value: string) {
    if (!draft.value) return;
    draft.value.coverImages = value.trim() ? [value.trim()] : [];
}
</script>

<template>
    <NModal :show="props.show" preset="card" class="trip-editor" :title="isNew ? '创建旅行' : '旅行手记'"
        :bordered="false" role="dialog" aria-modal="true" @update:show="!$event && emit('close')">
        <div v-if="draft" class="form">
            <label class="field">
                <span>标题</span>
                <NInput v-model:value="draft.title" size="large" placeholder="给这段旅程一个名字" maxlength="80" autofocus />
            </label>
            <label class="field">
                <span>备注</span>
                <NInput v-model:value="draft.description" type="textarea" placeholder="旅行灵感、注意事项，或想留下的记忆…"
                    :autosize="{ minRows: 3, maxRows: 5 }" maxlength="500" show-count />
            </label>
            <label class="field">
                <span>封面图片 URL</span>
                <NInput :value="draft.coverImages[0] || ''" placeholder="https://…" @update:value="updateCover" />
            </label>
            <div class="coordinates">
                <label class="field"><span>目的地纬度</span><NInputNumber v-model:value="draft.destination.lat" :min="-90" :max="90" :precision="5" /></label>
                <label class="field"><span>目的地经度</span><NInputNumber v-model:value="draft.destination.lng" :min="-180" :max="180" :precision="5" /></label>
            </div>
        </div>
        <template #footer>
            <div class="footer">
                <NButton v-if="!isNew && draft" tertiary @click="emit('export', draft)">导出此计划</NButton>
                <span class="footer__spacer" />
                <NButton tertiary @click="emit('close')">取消</NButton>
                <NButton class="save" :disabled="!draft?.title.trim()" @click="draft && emit('save', draft)">保存</NButton>
            </div>
        </template>
    </NModal>
</template>

<style lang="scss" scoped>
.form { display: grid; gap: 18px; }
.field { display: grid; gap: 8px; color: rgba(255,255,255,.66); font-size: 12px; }
.coordinates { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.coordinates :deep(.n-input-number) { width: 100%; }
.footer { display: flex; align-items: center; gap: 9px; }
.footer__spacer { flex: 1; }
.save { color: #243021; background: #dcebbd; }
</style>

<style lang="scss">
.trip-editor.n-card {
    width: min(540px, calc(100vw - 32px)); border: 1px solid rgba(255,255,255,.12); border-radius: 22px;
    background: rgba(28,35,35,.96); box-shadow: 0 30px 90px rgba(0,0,0,.45); backdrop-filter: blur(30px);
    .n-card-header { padding: 24px 26px 12px; font-size: 20px; font-weight: 580; }
    .n-card__content { padding: 14px 26px 22px; }
    .n-card__footer { padding: 16px 26px 22px; }
    .n-input, .n-input-number { --n-border-radius: 10px !important; }
}
</style>
