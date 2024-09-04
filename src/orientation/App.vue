<script setup lang="ts">
import { ref, watch } from 'vue';
import { bindDeviceOrientation, unbindDeviceOrientation, useDeviceOrientation } from './orientation';
import type { Orientation, Quaternion } from './types';
import { calculateQuaternion, quaternionToCSSMatrix3D } from './math';

const orientation = ref<Orientation>({ alpha: 0, beta: 90, gamma: 0 });
// const quaternion = ref<Quaternion>({} as Quaternion);

const transformO = ref<string>('');
const transformQ = ref<string>('');

bindDeviceOrientation();

useDeviceOrientation((o, q) => {
    orientation.value = o;
});

watch(
    () => orientation.value,
    () => {
        const o = orientation.value;

        transformO.value = `perspective(800px) rotateX(${-o.beta - 90 - 180}deg) rotateY(${
            o.gamma
        }deg) rotateZ(${-o.alpha}deg)`;

        const quaternion = calculateQuaternion(o.beta + 270, -o.gamma, o.alpha);
        const matrix = quaternionToCSSMatrix3D(quaternion);
        transformQ.value = `perspective(800px) matrix3d(${matrix.join(',')})`;
    },
    {
        deep: true,
    },
);
</script>

<template>
    <!--
    <div>alpha:{{ orientation.alpha }}</div>
    <div>beta:{{ orientation.beta }}</div>
    <div>gamma:{{ orientation.gamma }}</div>

    <input type="range" v-model="orientation.alpha" min="0" max="360" />
    <input type="range" v-model="orientation.beta" min="-180" max="180" />
    <input type="range" v-model="orientation.gamma" min="-90" max="90" />
    -->

    <div class="perspective">
        <div class="card" :style="{ transform: transformO }"></div>
        <!-- <div class="card" :style="{ transform: transformQ }"></div> -->
    </div>
</template>

<style scoped>
.card {
    margin: 100px auto;
    width: 50vw;
    height: 300px;
    background-color: #fff;
    background-image: linear-gradient(33deg, #000 0%, #ff0c0cff 40%, #e6050557 100%);
    border-radius: 12px;
}
</style>
