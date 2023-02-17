<script setup lang="ts">
import { rules } from '../rules';
</script>

<template>
    <div>
        <pre class="tips">{{ rules }}</pre>
    </div>
</template>

<style scoped lang="scss">
.tips {
    padding: 10px;
    font-size: 12px;
    color: #666;
    line-height: 1.4;
    background: #ddd;
}
</style>
