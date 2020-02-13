<template>
    <div class="file-drop" :class="{placeholder: !state.file}" @dragover.prevent="handleDragOver" @drop.prevent="handleDrop">
        <span v-if="state.file" class="file-type">{{state.file.type}}</span>
        <span v-if="state.file">{{state.file.name}}</span>
        <span v-else>Drop File...</span>
    </div>
</template>
<script>
import { createComponent, reactive, computed, watch, onMounted } from '@vue/composition-api';

export default createComponent({
    setup(props, context) {
        const state = reactive({
            file: null,
        });
        return {
            state,
            handleDragOver(){},
            handleDrop(e){
                state.file = e.dataTransfer.files[0];
                context.emit('change', state.file);
            }
        };
    }
});
</script>
<style lang="scss">
.file-drop{
    position: relative;
    margin: .3rem;
    border: 4px solid #999;
    border-radius: .08rem;
    height: 3rem;
    line-height: 3rem;
    text-align: center;
    font-size: 1rem;
    color: #999;
    font-weight: 700;
    white-space: nowrap;
    font-family: fontsc, "PingFang SC", "Helvetica Neue For Number", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
.placeholder{
    color: #bbb;
    border: 4px dashed #bbb;
}
.file-type{
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    line-height: 2;
    font-size: .3rem;
    color: #999;
}
</style>
