<template>
  <div class="parser-wrapper">
    <select @change="setFormatter">
      <option>---formatter---</option>
      <option v-for="(content, key) in parser" :key="key">{{key}}</option>
    </select>
    <textarea ref="textarea" v-model="state.format" placeholder="field,4"></textarea>
    <table>
      <thead>
        <tr>
          <th style="width:8em;">Field</th>
          <th style="width:8em;">Length</th>
          <th style="">Value</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(record, index) in state.result">
          <tr :key="index" v-if="record.type === 'group'" :style="{borderTop:'2px solid #ccc',backgroundColor:getColor(record.name)}">
            <td @click="log(record)">{{record.name}}</td>
            <td></td>
            <td></td>
          </tr>
          <tr :key="index" v-if="record.type === 'field'" :style="{backgroundColor:getColor()}">
            <td @click="log(record)">{{record.name}}</td>
            <td>
              <span class="length">{{record.length || 0}}</span>
              <span class="offset" v-if="record.offset">{{record.offset[0]}} - {{record.offset[1]}}</span>
            </td>
            <td>
              <div class="cell-content" @click="copy(record.value)">{{record.value}}</div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <pre class="tips">{{tips}}</pre>
  </div>
</template>
<script>
import { createComponent, reactive, computed, watch, onMounted } from '@vue/composition-api';
import { fitHeight, parseText, getValue, parseFormatter, parseFile, parseBlank, tips, genColorFromString } from './utils';
import parser from './parser';
const cacheKey = 'lab.fileParser.textarea';

export default createComponent({
    components: {},
    props: {
        file: Blob,
    },
    setup(props, context) {
        const state = reactive({
            format: localStorage.getItem(cacheKey) || '',
            formatter: [],
            result: [],
        });
        let color = '';
        watch(
            () => state.format,
            () => {
                fitHeight(context.refs.textarea);
                localStorage.setItem(cacheKey, state.format);
                state.formatter = parseText(state.format);
            },
        );
        watch(
            () => props.file,
            () => {
                state.formatter = parseText(state.format);
            },
        );
        watch(
            () => state.formatter,
            () => {
                console.log(state.formatter);
                parseValue();
            },
        );
        onMounted(() => {
            fitHeight(context.refs.textarea);
        });

        async function parseValue() {
            state.result = props.file
                ? await parseFile(state.formatter, props.file)
                : await parseBlank(state.formatter);
            console.log(state.result);
        }

        return {
            state,
            parser,
            tips,
            setFormatter(e) {
                if(parser[e.target.value]){
                    state.format = parser[e.target.value];
                }
            },
            copy(value) {
                try {
                    navigator.clipboard.writeText(value);
                    console.log('copy complete');
                } catch (e) {
                    console.warn(e);
                }
                console.log(value);
            },
            log(info) {
                window.currentField = info;
                console.log('window.currentField = ', info);
            },
            getColor(text) {
                if (text) {
                    color = `hsl(${genColorFromString(text)}, 70%, 95%)`;
                }
                return color;
            },
        };
    },
});
</script>
<style lang="scss">
.parser-wrapper {
    margin: 0.3rem;
}
table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
}

table,
th,
td {
    border: 1px solid #dedede;
}
th,
td {
    position: relative;
    padding: 0.1rem 0.14rem;
}
.cell-content {
    overflow: auto;
    max-height: 3rem;
}
.length:after {
    content: ' byte';
    font-size: 0.24rem;
    color: #999;
}
.offset {
    position: absolute;
    bottom: -0.08rem;
    right: 0;
    font-size: 0.24rem;
    color: #999;
    white-space: nowrap;
    transform: scale(0.8);
}
textarea {
    box-sizing: border-box;
    width: 100%;
    height: 3rem;
    resize: none;
}
.tips{
    padding: .2rem;
    font-size: .24rem;
    color: #666;
    line-height: 1.4;
    background: #ddd;
}
</style>
