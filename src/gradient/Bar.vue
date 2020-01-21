<template>
    <div>
        <div class="transparent">
            <div class="color-view" :class="{disabled: state.disabled}" ref="preview" :style="`background-image: ${state.css};`" @click="handleClick">
                <div class="btn-box">
                    <span class="toggle-btn" @click.stop="toggle">{{state.disabled ? 'show' : 'hide'}}</span>
                    <span class="delete-btn" @click.stop="$emit('remove')">×</span>
                </div>
            </div>
        </div>
        <div class="color-stop-list">
            <ColorArrow class="color-stop" :class="{'remove-ready' : colorStop.removeReady}" v-for="(colorStop, index) in state.colorList" :movable="colorStop.movable" :key="colorStop.id" @moveY="checkYOffset(colorStop, $event)" @moveX="handleColorMove(colorStop, $event)" @moveend="checkRemove(colorStop, index)" v-model="colorStop.color" :left="colorStop.stop" :style="{left: calcLeft(colorStop.stop * 100) + '%'}" />
        </div>
    </div>
</template>
<script>
import { createComponent, reactive, computed, watch } from '@vue/composition-api';
import ColorArrow from './ColorArrow';
import gradientMap from './gradientMap';
export default createComponent({
    components: {
        ColorArrow
    },
    props: {
        data: Object
    },
    setup(props, context) {
        let id = 0;
        const state = reactive({
            colorList: (props.data.colorList.length
                ? props.data.colorList
                : gradientMap[props.data.type].getDefault()
            ).map((data, index, arr) => createColor(data)),
            disabled: false,

            css: ''
        });

        watch(
            () => [state.colorList, state.disabled],
            () => {
                state.css = gradientMap[props.data.type].css({ colorList: state.colorList });
                context.emit('change', { colorList: state.colorList, disabled: state.disabled });
            },
            {
                deep: true
            }
        );
        function createColor({ color, stop }, movable = true) {
            return {
                color,
                stop,
                id: ++id,
                movable
            };
        }
        function addColor(color, stop) {
            color = color || findNearColor(stop);
            state.colorList.push(createColor({ color, stop }));
        }
        function checkYOffset(colorStop, e) {
            // if (state.colorList.length <= 2) {
            //     return;
            // }
            colorStop.removeReady = Math.abs(e.pageY - context.refs.preview.getBoundingClientRect().bottom) > 50;
        }
        function checkRemove(colorStop, index) {
            colorStop.removeReady && state.colorList.splice(index, 1);
        }
        function calcStop(e) {
            return +(
                (e.pageX - context.refs.preview.getBoundingClientRect().left) /
                context.refs.preview.clientWidth
            ).toFixed(3);
        }
        function findNearColor(currentStop, exclude = null) {
            let i = 0;
            let minDist = 1;
            let target = state.colorList[0];
            while (i < state.colorList.length) {
                if (exclude !== null && i === exclude) {
                    continue;
                }
                const stop = state.colorList[i].stop;
                const dist = Math.abs(currentStop - stop);
                if (dist < minDist) {
                    minDist = dist;
                    target = state.colorList[i];
                }
                i++;
            }
            return target.color;
        }
        function handleClick(e) {
            addColor(null, calcStop(e));
        }
        function handleColorMove(colorStop, e) {
            colorStop.stop = calcStop(e);
        }
        function calcLeft(value) {
            return value < 0 ? 0 : value > 100 ? 100 : value;
        }
        function toggle() {
            state.disabled = !state.disabled;
        }
        return {
            state,
            handleClick,
            handleColorMove,
            calcLeft,
            checkRemove,
            checkYOffset,
            toggle
        };
    }
});
</script>
<style scoped lang="scss">
$delete-btn-size: 0.36rem;
.color-view {
    position: relative;
    box-sizing: border-box;
    height: 0.8rem;
    border: 1px solid rgba(0, 0, 0, 0.2);
    cursor: col-resize;
    .btn-box {
        display: none;
        position: absolute;
        top: -$delete-btn-size/2;
        right: -$delete-btn-size/2;
        text-align: right;
        span {
            display: inline-block;
            padding: 0.04rem 0.08rem;
            line-height: $delete-btn-size - 0.04rem;
            text-align: center;
            border-radius: 0.06rem;
            transition: all 0.3s ease;
            cursor: pointer;
            background: #ffffffcc;
            &:hover {
                font-weight: 700;
            }
        }
    }
    .delete-btn {
        font-size: 0.3rem;
        color: #f30;
        &:hover {
            background: #f30;
            color: #ffffffcc;
        }
    }
    &:hover .btn-box {
        display: block;
    }
}
.remove-ready {
    opacity: 0.6;
    transform: translateY(0.2rem);
}
.color-stop-list {
    position: relative;
    height: 0.5rem;
    transition: all 0.2s ease;
}
.disabled {
    opacity: 0.5;
}
</style>
