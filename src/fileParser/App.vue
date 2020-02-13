<template>
  <div class="wrapper">
    <FileDrop @change="handleChange" />
    <ParserTable :file="state.file" />
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
        });
        return {
            state,
            handleChange(file){
                state.file = file;
            }
        };
    },
});
</script>
<style lang="scss">
.wrapper {
    overflow: hidden;
}
</style>
