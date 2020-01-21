<template>
    <textarea class="text-view" ref="textarea" v-model="value" disabled /></template>
<script>
import { createComponent, watch, onMounted } from '@vue/composition-api';

export default createComponent({
    props: {
        value: String
    },
    setup(props, context) {
        watch(
            () => props.value,
            () => {
                calcHeight();
            }
        );
        onMounted(() => {
            calcHeight();
        });
        function calcHeight() {
            if (!context.refs.textarea) {
                return;
            }
            context.refs.textarea.style.height = context.refs.textarea.scrollHeight + 'px';
        }
        return {
            calcHeight
        };
    }
});
</script>
<style scoped>
.text-view {
    -webkit-appearance: none;
    box-sizing: border-box;
    width: 100%;
    min-height: 1rem;
    line-height: 1.4;
    margin: 0 0 0.08rem;
    padding: 0.1rem 0.2rem;
    font-size: 0.12rem;
    color: #999;
    background: #ffffffdd;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 0.04rem;
}
</style>
