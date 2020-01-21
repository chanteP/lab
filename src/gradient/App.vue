<template>
    <div class="wrapper">
        <div class="transparent">
            <Preview :style="state.previewCss" :list="state.list" @change="handleChange" />
        </div>
        <div class="add-btnbox">
            Add:
            <a v-for="(item, type) in gradientMap" :key="type" @click="add(type)">{{item.text}}</a>
            Or:
            <a @click="clearCache">clear all</a>
        </div>
        <template v-for="(data, index) in state.list">
            <Bar class="bar" :key="`bar${index}`" :class="{selected: state.selected === index}" @click.native="select(index, $event)" @change="handleChange($event, index)" @remove="remove(index)" :data="data"></Bar>
            <Panel class="panel" :key="`panel${index}`" v-if="state.selected === index && state.list[index]" :data="state.list[index]" @change="handleChange($event, index)" />
        </template>
        <TextValue :value="state.previewCss" />
    </div>
</template>
<script>
import { createComponent, reactive, computed, watch, onMounted } from '@vue/composition-api';
import Bar from './Bar';
import Panel from './Panel';
import TextValue from './TextValue';
import Preview from './Preview';
import gradientMap from './gradientMap';
import { clearCache, setCache, getCache } from './utils';

export default createComponent({
    components: {
        Bar,
        Panel,
        TextValue,
        Preview,
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
                pos: `50% 50%`,
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
            clearCache() {
                clearCache();
                state.list = [];
            }
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
.panel {
    background: #fff;
}
.selected {
    background: #fff;
}
</style>
