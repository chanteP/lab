<template>
  <div class="wrapper">
    <FileDrop @change="handleChange" :progress="state.fileProgress" />
    <ParserTable :file="state.file" @progress="handleProgress" />
  </div>
</template>
<script>
import { createComponent, reactive, computed, watch, onMounted } from '@vue/composition-api';
import FileDrop from './FileDrop.vue';
import ParserTable from './ParserTable.vue';

export default createComponent({
    components: {
        FileDrop,
        ParserTable,
    },
    setup(props, context) {
        const state = reactive({
            file: null,
            fileProgress: 0,
        });
        return {
            state,
            handleChange(file){
                state.file = file;
            },
            handleProgress({loaded, total}){
                state.fileProgress = loaded / total;
            },
        };
    },
});
</script>
<style>
body{
    /* background: #fefefe left top/.05rem 0.05rem repeat; */
    /* background-image: linear-gradient(0deg, #ffffff00 0% 90%, #aaaaaa66 90% 100%), linear-gradient(90deg, #ffffff00 0% 90%, #aaaaaa66 90% 100%); */
}
.wrapper {
    overflow: hidden;
}
</style>
