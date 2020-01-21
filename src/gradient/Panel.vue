<template>
    <div class="config-wrapper">
        <div class="form-item">
            <label>background-size</label>
            <input @input="setData('size', $event)" type="text" placeholder="size" />
        </div>
        <div class="form-item">
            <label>background-position</label>
            <input @input="setData('pos', $event)" type="text" placeholder="position" />
        </div>
        <div class="form-item" v-if="data.type === 'radial'">
            <label>shape</label>
            <input @input="setData('shape', $event)" type="text" placeholder="circle | ellipse | x y | x% y%" />
        </div>
        <div class="form-item" v-else>
            <label>angle</label>
            <input @input="setData('angle', $event)" type="number" placeholder="n" />
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
.config-wrapper{
    margin: .2rem 0;
}
.form-item{
    height: .5rem;
    line-height: .5rem;
    label{
        float: left;
        width: 4rem;
        font-size: .3rem;
        font-weight: 700;
    }
    input{
        display: block;
        margin-left: 4rem;
        width: 5rem;
    }
}
</style>
