<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ImageAsset } from '../types';
import { metadataEntries } from '../io/metadata';
import noticesUrl from '../THIRD_PARTY_NOTICES.txt?url';

const props = defineProps<{ open: boolean; asset?: ImageAsset }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
watch(() => props.open, async (open) => { await nextTick(); open ? dialog.value?.showModal() : dialog.value?.close(); });
</script>

<template>
    <dialog ref="dialog" class="metadata-dialog" role="dialog" aria-modal="true" aria-labelledby="metadata-title" @close="emit('close')" @click="$event.target === dialog && emit('close')">
        <header><div><h2 id="metadata-title">图像信息</h2><p>{{ asset?.name }}</p></div><button type="button" aria-label="关闭元数据" @click="emit('close')">×</button></header>
        <dl v-if="asset"><template v-for="[key, value] in metadataEntries(asset.metadata)" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></template></dl>
        <p v-if="asset && !metadataEntries(asset.metadata).length" class="empty">此文件没有可读取的 EXIF 元数据。</p>
        <footer>元数据仅在浏览器本地读取，不会上传。JPEG 原图的 EXIF 在导出时原样保留。<br /><a :href="noticesUrl" target="_blank" rel="noopener">LibRaw 与第三方组件许可说明</a></footer>
    </dialog>
</template>

<style lang="scss" scoped>
.metadata-dialog { width: min(600px, 90vw); max-height: 78vh; padding: 0; border: 1px solid #555; border-radius: 5px; background: #292929; color: #ddd; box-shadow: 0 20px 70px #000a; &::backdrop { background: #000a; } }
header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 20px 12px; border-bottom: 1px solid #444; h2 { margin: 0 0 4px; font-size: 16px; } p { margin: 0; color: #999; font-size: 11px; } button { border: 0; background: transparent; color: #ccc; font-size: 24px; cursor: pointer; } }
dl { display: grid; grid-template-columns: minmax(130px, .8fr) 1.4fr; margin: 0; padding: 14px 20px; overflow-wrap: anywhere; dt, dd { padding: 7px 4px; border-bottom: 1px solid #3a3a3a; font-size: 12px; } dt { color: #999; } dd { margin: 0; } }
footer, .empty { margin: 0; padding: 12px 20px 18px; color: #888; font-size: 10px; line-height: 1.6; } footer a { color: #aaa; }
</style>
