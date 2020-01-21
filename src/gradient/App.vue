<template>
    <div class="wrapper">
        <a class="clear-btn" @click="clearCache">clear cache...</a>
        <div class="transparent">
            <div class="preview" :style="state.previewCss"></div>
        </div>
        <div class="add-btnbox">
            Add:
            <a v-for="(item, type) in gradientMap" :key="type" @click="add(type)">{{item.text}}</a>
        </div>
        <Bar class="bar" :class="{selected: state.selected === index}" @click.native="select(index, $event)" v-for="(data, index) in state.list" :key="index" @change="handleChange($event, index)" @remove="remove(index)" :data="data"></Bar>
        <Panel v-if="state.list[state.selected]" :data="state.list[state.selected]" @change="handleChange($event, state.selected)" />
        <TextValue :value="state.previewCss" />
    </div>
</template>
<script>
import { createComponent, reactive, computed, watch, onMounted } from '@vue/composition-api';
import Bar from './Bar';
import Panel from './Panel';
import TextValue from './TextValue';
import gradientMap from './gradientMap';
import { clearCache, setCache, getCache } from './utils';

export default createComponent({
    components: {
        Bar,
        Panel,
        TextValue
    },
    setup(props, context) {
        const state = reactive({
            list: getCache([]),
            selected: null,
            previewCss: ''
        });
        watch(
            () => state.list,
            () => {
                combineCss();
            },
            { deep: true }
        );

        function handleChange(data, index) {
            Object.assign(state.list[index], data);
            // TODO
            combineCss();
        }
        function combineCss() {
            setCache(state.list);

            const backgroundImage = [];
            const backgroundSize = [];
            const backgroundPosition = [];
            state.list
                .filter(data => !data.disabled)
                .map(data => {
                    backgroundImage.push(gradientMap[data.type].css(data));
                    backgroundSize.push(data.size);
                    backgroundPosition.push(data.pos);
                })
                .join(',\n');
            state.previewCss = [
                `background-image: ${backgroundImage}`,
                `background-size: ${backgroundSize}`,
                `background-position: ${backgroundPosition}`
            ].join(';\n');
            console.log(state.previewCss);
        }
        function remove(index) {
            state.list.splice(index, 1);
        }
        function add(type) {
            const data = {
                type,
                position: [0, 0],
                angle: 0,
                colorList: []
            };
            gradientMap[type].format(data);
            state.list.push(data);
        }
        function select(index, e) {
            state.selected = index;
        }
        return {
            state,
            combineCss,
            add,
            remove,
            select,
            gradientMap,
            handleChange,
            clearCache
        };
    }
});
</script>
<style lang="scss">
body {
    background: #f0f0f0 left top/.1rem 0.1rem repeat;
    background-image: linear-gradient(0deg, #ffffff00 0% 75%, #dddddd66 75% 100%),
        linear-gradient(90deg, #ffffff00 0% 75%, #dddddd66 75% 100%);
}
.wrapper {
    max-width: 960px;
    min-height: 100vh;
    padding: 0 0.3rem 0.2rem;
    margin: auto;
}
.preview {
    box-sizing: border-box;
    height: 40vh;
    border: 1px solid #ccc;
}
.transparent {
    background: conic-gradient(#fff 0.25turn, #ddd 0.25turn 0.5turn, #fff 0.5turn 0.75turn, #ddd 0.75turn) top left /
        0.6rem 0.6rem repeat;
}
.add-btnbox {
    margin-top: 0.2rem;
    margin-bottom: 0.3rem;
    font-size: 0.52rem;
    a {
        display: inline-block;
        padding: 0 0.1rem;
        font-size: 0.26rem;
        &:hover {
            text-decoration: underline;
        }
    }
}
.bar {
    position: relative;
    &:before {
        content: '';
        position: absolute;
        top: 0;
        left: -0.3rem;
        right: -0.3rem;
        height: 100%;
    }
}
.clear-btn {
    position: fixed;
    bottom: 0;
    right: 0;
}
.selected {
    outline: 3px solid #f90;
}
</style>
