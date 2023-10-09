<script setup lang="ts">
import { watch, onMounted, ref, type Ref, computed } from 'vue';

const props = defineProps<{
}>();

</script>

<template>
    <div>
        <canvas class="canvas"></canvas>
    </div>
</template>

<style>
body {
    background: linear-gradient(180deg, #060015, rgb(24, 0, 67));
}
</style>

<style scoped>
.canvas {
    width: 100vw;
    height: 100vh;
}
</style>
