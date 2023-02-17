<template>
  <label class="file-drop" :class="{placeholder: !state.file}" :style="{backgroundColor:state.backgroundColor, opacity:progress >= 1 ? 1: .7}" @dragover.prevent="handleDragOver" @dragleave="handleLeave" @drop.prevent="handleDrop">
    <span v-if="state.file" class="file-type">{{state.file.type}}</span>
    <span v-if="state.file">{{state.file.name}}</span>
    <span v-else>Drop File...</span>
    <input type="file" hidden @change="handleFileChange" />
  </label>
</template>
<script>
import { createComponent, reactive, computed, watch, onMounted } from '@vue/composition-api';
import { genColorFromString } from './utils';

export default createComponent({
    props: {
        progress: Number,
    },
    setup(props, context) {
        const state = reactive({
            file: null,
            backgroundColor: '',
        });
        watch(
            () => state.file,
            () => {
                if (!state.file) {
                    return;
                }
                state.backgroundColor = `hsl(${genColorFromString(state.file.name)}, 50%, 65%)`;
            },
        );
        return {
            state,
            handleDragOver(e) {
                state.backgroundColor = `#aaaaaa66`;
            },
            handleLeave() {
                if (state.file) {
                    return;
                }
                state.backgroundColor = '';
            },
            handleDrop(e) {
                state.file = e.dataTransfer.files[0];
                context.emit('change', state.file);
            },
            handleFileChange(e) {
                state.file = e.target.files[0];
            },
        };
    },
});
</script>
<style lang="scss">
.file-drop {
    display: block;
    position: relative;
    margin: 0.3rem;
    border: 4px solid transparent;
    border-radius: 0.08rem;
    height: 3rem;
    line-height: 3rem;
    text-align: center;
    font-size: 1rem;
    color: #fff;
    font-weight: 700;
    white-space: nowrap;
    font-family: fontsc, 'PingFang SC', 'Helvetica Neue For Number', -apple-system,
        BlinkMacSystemFont, 'Segoe UI', Roboto, 'Hiragino Sans GB', 'Microsoft YaHei',
        'Helvetica Neue', Helvetica, Arial, sans-serif;
    transition: background, opacity 0.5s ease;
    cursor: pointer;
}
.file-drop:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0.08rem;
    background-color: none;
    transition: background 0.5s ease;
}
.progress-mark {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0.08rem;
    background: right top no-repeat;
    background-image: linear-gradient(-90deg, #00000033 0%, #000000cc 100%);
    background-size: 0% 100%;
    pointer-events: none;
    transition: background 0.5s ease;
}
.file-drop:hover:before {
    background-color: #aaaaaa66;
}

.placeholder {
    color: #bbb;
    border: 4px dashed #bbb;
}
.file-type {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    line-height: 2;
    font-size: 0.5rem;
    font-weight: 100;
    color: #fff;
}
</style>
