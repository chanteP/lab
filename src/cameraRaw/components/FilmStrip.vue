<script setup lang="ts">
import { ref } from 'vue';
import { NIcon } from 'naive-ui';
import { Add } from '@vicons/ionicons5';
import { assets, selectedIds, activeId, selectAsset, toggleSelected } from '../store';

const emit = defineEmits<{ add: []; files: [files: File[]] }>();
const dragging = ref(false);

function choose(event: MouseEvent, id: string) {
    if (event.metaKey || event.ctrlKey) toggleSelected(id);
    else void selectAsset(id);
}

function dropFiles(event: DragEvent) {
    dragging.value = false;
    const files = Array.from(event.dataTransfer?.files ?? []); if (files.length) emit('files', files);
}
</script>

<template>
    <div class="filmstrip" :class="{ dragging }" role="listbox" aria-label="已导入图片，可拖入文件" aria-orientation="horizontal" @dragenter.prevent="dragging = true" @dragleave="dragging = false" @dragover.prevent @drop.stop.prevent="dropFiles">
        <button v-for="asset in assets" :key="asset.id" class="film-item" :class="{ active: activeId === asset.id, selected: selectedIds.has(asset.id) }" type="button" role="option" :aria-selected="selectedIds.has(asset.id)" :title="asset.name" @click="choose($event, asset.id)">
            <span class="thumb-wrap"><img v-if="asset.thumbnail" :src="asset.thumbnail" :alt="asset.name" draggable="false" /><span v-else class="raw-placeholder">RAW</span><span v-if="asset.loading" class="loading" /></span>
            <span class="film-name">{{ asset.name }}</span><span v-if="selectedIds.has(asset.id)" class="selected-mark">✓</span>
        </button>
        <button class="film-item film-add" type="button" title="导入图片" aria-label="导入图片" @click="emit('add')"><span class="thumb-wrap"><NIcon><Add /></NIcon></span><span class="film-name">导入图片</span></button>
    </div>
</template>

<style lang="scss" scoped>
.filmstrip { display: flex; align-items: flex-start; gap: 6px; height: 100%; padding: 8px 10px 4px; overflow-x: auto; overflow-y: hidden; scrollbar-color: #555 #242424; }
.filmstrip.dragging { background: #34444c; outline: 1px dashed #72b3d3; outline-offset: -4px; }
.film-item { flex: 0 0 92px; position: relative; padding: 3px; border: 1px solid transparent; border-radius: 2px; background: transparent; color: #aaa; cursor: pointer; &.active { border-color: #e6e6e6; background: #4b4b4b; } &.selected:not(.active) { border-color: #777; } }
.thumb-wrap { display: flex; align-items: center; justify-content: center; width: 84px; height: 62px; background: #171717; overflow: hidden; img { width: 100%; height: 100%; object-fit: contain; } }
.raw-placeholder { color: #777; font-size: 13px; letter-spacing: 1px; }
.film-name { display: block; width: 100%; margin-top: 4px; overflow: hidden; color: inherit; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.selected-mark { position: absolute; top: 6px; right: 6px; width: 15px; height: 15px; border-radius: 50%; background: #eee; color: #222; font-size: 10px; line-height: 15px; }
.loading { position: absolute; width: 20px; height: 20px; border: 2px solid #fff4; border-top-color: white; border-radius: 50%; animation: spin .8s linear infinite; }
.film-add { border-color: #4a4a4a; border-style: dashed; .thumb-wrap { color: #999; font-size: 27px; background: #272727; } &:hover { color: #ddd; border-color: #888; } }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
