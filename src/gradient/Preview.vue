<template>
    <div class="preview" ref="preview">
        <template v-for="(data, index) in list">
            <ColorArrow disabled :value="'#fff'" v-if="!data.disabled" class="position-arrow" :key="`arrow${index}`" :style="calcArrowPos(data)" @move="setPos(data, index, $event)"></ColorArrow>
        </template>
    </div>
</template>
<script>
import { createComponent } from '@vue/composition-api';
import ColorArrow from './ColorArrow';

export default createComponent({
    components: {
        ColorArrow
    },
    props: {
        list: Array
    },
    setup(props, context) {
        function calcArrowPos(data) {
            const posArr = data.pos.split(' ');
            const rs = {
                top: posArr[1],
                left: posArr[0]
            };
            console.log(rs);
            return rs;
        }
        function setPos(data, index, e) {
            const content = context.refs.preview;
            const pos = content.getBoundingClientRect();
            const x = ((e.pageX - pos.left) / pos.width) * 100;
            const y = ((e.pageY - pos.top) / pos.height) * 100;
            context.emit('change', { pos: `${x.toFixed(2)}% ${y.toFixed(2)}%` }, index);
        }
        return { calcArrowPos, setPos };
    }
});
</script>
<style scoped>
.preview {
    position: relative;
    box-sizing: border-box;
    height: 40vh;
    border: 1px solid #ccc;
}
.position-arrow {
    position: absolute;
}
</style>
