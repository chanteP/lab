<script setup lang="ts">
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { type BuiltInGlobalTheme } from 'naive-ui/es/themes/interface';

const props = defineProps<{
    theme?: BuiltInGlobalTheme
}>();

</script>

<template>
    <NConfigProvider class="naive-container" :theme="props.theme">
        <NMessageProvider>
            <slot></slot>
        </NMessageProvider>
    </NConfigProvider>
</template>

<style scoped>
.naive-container {
    min-height: 100vh;
}
</style>
