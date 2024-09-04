<script setup lang="ts">
import { ref, watch } from 'vue';
import { bindDeviceOrientation, unbindDeviceOrientation, useDeviceOrientation } from './orientation';
import type { Orientation, Quaternion } from './types';

const orientation = ref<Orientation>({ alpha: 0, beta: 90, gamma: 0 });
// const quaternion = ref<Quaternion>({} as Quaternion);

const transformO = ref<string>('');
// const transformQ = ref<string>('');

useDeviceOrientation((o, q) => {
    orientation.value = o;
});

watch(
    () => orientation.value,
    () => {
        const o = orientation.value;

        transformO.value = `perspective(800px) rotateX(${o.beta - 90 - 180}deg) rotateY(${
            -o.gamma
        }deg) rotateZ(${o.alpha}deg)`;

        // const quaternion = calculateQuaternion(o.beta + 270, -o.gamma, o.alpha);
        // const matrix = quaternionToCSSMatrix3D(quaternion);
        // transformQ.value = `perspective(800px) matrix3d(${matrix.join(',')})`;
    },
    {
        deep: true,
    },
);
</script>

<template>
    <div class="perspective" @click="bindDeviceOrientation">
        <div class="card" :style="{ transform: transformO }"></div>
    </div>
</template>

<style scoped>
.perspective{
    height: 100vh;
    overflow: hidden;
}
.card {
    margin: 20vh auto;
    width: 70vw;
    height: 50vh;
    background-color: #fff;
    background-image: linear-gradient(33deg, #000 0%, #ff0c0cff 40%, #e6050557 100%);
    border-radius: 40px;
}
</style>
