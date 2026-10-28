<script setup lang="ts">
defineProps<{ name: 'pencil' | 'ruler' | 'ellipse' }>();
</script>

<template>
    <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="name === 'pencil'">
            <path d="m4 20 4.2-1 10.9-10.9a2.12 2.12 0 0 0-3-3L5.2 16 4 20Z" />
            <path d="m13.9 7.3 3 3M5.2 16l3 3M4 20l3-1" />
            <path d="m16.1 5.1 1-1a2.12 2.12 0 0 1 3 3l-1 1" />
        </template>
        <template v-else>
            <ellipse v-if="name === 'ellipse'" cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-28 12 12)" />
        </template>
        <template v-if="name === 'ruler'">
            <path d="M3 7h18v10H3z" />
            <path d="M7 7v4m4-4v2m4-2v4m4-4v2M3 14h18" />
        </template>
    </svg>
</template>
