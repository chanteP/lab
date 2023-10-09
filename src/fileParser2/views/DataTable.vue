<script setup lang="ts">
import { onMounted, ref, type Ref, computed } from 'vue';
import type { FileRecords } from '../parser';

import DataTableItem from './DataTableItem.vue';

const props = defineProps<{
    result: FileRecords[];
    filter?: string;
}>();
</script>

<template>
    <div>
        <div class="table">
            <div class="thead row">
                <div class="col">Field</div>
                <div class="col">Length</div>
                <div class="col">Value</div>
            </div>
            <template v-for="item in props.result">
                <DataTableItem :item="item" :file="props.result" />
            </template>
        </div>
    </div>
</template>

<style scoped lang="scss">
.table {
    background-color: rgba(0, 0, 0, 0.1);
    font-size: 13px;
    line-height: 2;
}

.thead.row {
    background: #f0f0f0;
}

.row,
:deep(.row) {
    box-sizing: border-box;
    display: flex;
    border-top: 1px solid #dedede;
}

.col,
:deep(.col) {
    box-sizing: border-box;
    padding: 2px 6px;

    &:nth-child(1) {
        width: 120px;
    }
    &:nth-child(2) {
        width: 120px;
        border-left: 1px solid #dedede;
    }
    &:nth-child(3) {
        flex: 1;
        max-width: calc(100% - 240px);
        border-left: 1px solid #dedede;
    }
}
</style>
