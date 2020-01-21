<template>
    <div class="color-arrow-wrapper" tabindex="99" ref="wrapper">
        <div class="color-arrow" @click.stop="show" @mousedown="handleMoveStart">
            <div class="color-arrow-preview" :style="{backgroundColor: state.value}"></div>
        </div>
        <ColorPicker class="color-picker" :value="state.value" ref="picker" @input="emit" v-if="state.focus" />
    </div>
</template>
<script>
import ColorPicker from 'vue-color/src/components/Chrome.vue';
import { createComponent, reactive, onMounted, onBeforeUnmount } from '@vue/composition-api';
export default createComponent({
    components: {
        ColorPicker
    },
    props: {
        value: String,
        movable: {
            type: Boolean,
            default: true
        },
        disabled: Boolean
    },
    setup(props, context) {
        const state = reactive({
            focus: false,
            value: props.value,
            isActive: false
        });
        let x = null;
        let y = null;

        function show() {
            if (props.disabled) {
                return;
            }
            state.focus = true;
        }
        function hide() {
            state.focus = false;
        }
        function emit(data) {
            state.value = data.hex8;
            context.emit('input', state.value);
        }
        function handleMoveStart(e) {
            if (!props.movable) {
                return;
            }
            state.isActive = true;
            x = e.pageX;
            y = e.pageY;
        }
        function handleMove(e) {
            if (!state.isActive) {
                return;
            }
            if (e.pageX !== x) {
                context.emit('moveX', e);
            }
            if (e.pageY !== y) {
                context.emit('moveY', e);
            }
            context.emit('move', e);

            // x = e.pageX;
            // y = e.pageY;
        }
        function handleMoveEnd() {
            state.isActive = false;
            context.emit('moveend');
        }
        function handleClick(e) {
            const target = e.target;
            const wrapper = context.refs.wrapper;
            const picker = context.refs.picker && context.refs.picker.$el;
            console.log(picker)
            if (
                wrapper !== target &&
                !wrapper.contains(target) &&
                (!picker || (target !== picker && !picker.contains(target)))
            ) {
                hide();
            }
        }
        onMounted(() => {
            document.documentElement.addEventListener('click', handleClick, true);
            document.documentElement.addEventListener('mousemove', handleMove);
            document.documentElement.addEventListener('mouseup', handleMoveEnd);
        });
        onBeforeUnmount(() => {
            document.documentElement.removeEventListener('click', handleClick, true);
            document.documentElement.removeEventListener('mousemove', handleMove);
            document.documentElement.removeEventListener('mouseup', handleMoveEnd);
        });
        return {
            state,
            show,
            hide,
            emit,
            handleMoveStart,
            handleMove
        };
    }
});
</script>
<style scoped lang="scss">
$border-color: #999;
$half-size: 0.14rem;
.color-arrow-wrapper {
    position: absolute;
}
.color-arrow {
    position: absolute;
    margin-left: -$half-size;
    width: 0;
    height: 0;
    border-bottom: 0.1rem solid $border-color;
    border-left: $half-size solid transparent;
    border-right: $half-size solid transparent;
    cursor: pointer;
    z-index: 99;
}
.color-arrow-preview {
    position: absolute;
    top: 0.1rem;
    left: -$half-size;
    width: $half-size * 2;
    height: $half-size * 2 * 0.8;
    box-sizing: border-box;
    border: 1px solid $border-color;
    cursor: pointer;
}
.color-picker {
    position: absolute;
    top: 0.5rem;
    transform: translate(-50%, 0);
    z-index: 999;
}
</style>