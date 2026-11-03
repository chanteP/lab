<script setup lang="ts">
defineProps<{ name: 'pencil' | 'ruler' | 'ellipse' | 'render' | 'clay' | 'wireframe' | 'xray' }>();
</script>

<template>
    <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="name === 'pencil'">
            <path d="m4 20 4.2-1 10.9-10.9a2.12 2.12 0 0 0-3-3L5.2 16 4 20Z" />
            <path d="m13.9 7.3 3 3M5.2 16l3 3M4 20l3-1" />
            <path d="m16.1 5.1 1-1a2.12 2.12 0 0 1 3 3l-1 1" />
        </template>
        <template v-else-if="name === 'ruler'">
            <path d="M3 7h18v10H3z" />
            <path d="M7 7v4m4-4v2m4-2v4m4-4v2M3 14h18" />
        </template>
        <ellipse v-else-if="name === 'ellipse'" cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-28 12 12)" />
        <template v-else-if="name === 'render'">
            <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" fill="currentColor" fill-opacity=".16" />
            <path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.25l8 4.5" />
        </template>
        <template v-else-if="name === 'clay'">
            <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" fill="currentColor" fill-opacity=".42" />
            <path d="m4 7.5 8 4.5 8-4.5M12 12v9" opacity=".55" />
        </template>
        <template v-else-if="name === 'wireframe'">
            <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Zm0 0v9m-8-4.5 8 4.5 8-4.5M4 12l8 4.5 8-4.5M8 5.25l8 4.5v9m0-13.5-8 4.5v9M12 12v9" />
        </template>
        <template v-else>
            <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" fill="currentColor" fill-opacity=".08" stroke-dasharray="2.5 2" />
            <path d="m4 7.5 8 4.5 8-4.5M12 12v9m-8-4.5 16-9m0 9L4 7.5" opacity=".7" />
        </template>
    </svg>
</template>
