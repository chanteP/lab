<template>
    <div class="config-wrapper">
        <div class="form-item">
            <label>background-size</label>
            <input @input="setData('size', $event)" :value="data.size" type="text" placeholder="size" />
        </div>
        <div class="form-item">
            <label>background-position</label>
            <input @input="setData('pos', $event)" :value="data.pos" type="text" placeholder="position" />
        </div>
        <div class="form-item" v-if="data.type === 'radial'">
            <label>shape</label>
            <input @input="setData('shape', $event)" :value="data.shape" type="text" placeholder="circle | ellipse | x y | x% y%" />
        </div>
        <div class="form-item" v-else>
            <label>angle</label>
            <input @input="setData('angle', $event)" :value="data.angle" type="number" placeholder="n" />
        </div>
    </div>
</template>
<script>
import { createComponent, reactive, computed, watch } from '@vue/composition-api';
import gradientMap from './gradientMap';
export default createComponent({
    props: {
        data: Object
    },
    setup(props, context) {
        const state = reactive({});

        function setData(name, e) {
            context.emit('change', { [name]: e.target.value });
        }

        return {
            state,
            setData
        };
    }
});
</script>
<style scoped lang="scss">
.config-wrapper {
    margin: 0 0 0.2rem;
    padding: 0 0.2rem;
}
.form-item {
    position: relative;
    height: 0.5rem;
    line-height: 0.5rem;
    label {
        position: absolute;
        width: 4rem;
        font-size: 0.3rem;
        font-weight: 700;
    }
    input {
        display: block;
        box-sizing: border-box;
        padding-left: 4rem;
        width: 100%;
        line-height: 0.5rem;
    }
}
</style>
