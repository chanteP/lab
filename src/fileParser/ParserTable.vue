<template>
  <div class="parser-wrapper">
    <div class="control-bar">
      <div class="control">
        <select @change="setFormatter" :value="state.lastFormatter">
          <option value="">---formatter---</option>
          <option v-for="(content, key) in state.parsers" :key="key" :value="key">{{key}}</option>
        </select>
      </div>
      <label class="control">
        <a v-if="state.hideTextarea" @click="state.hideTextarea = false">ShowEditor</a>
        <a v-else @click="state.hideTextarea = true">HideEditor</a>
      </label>
      <label class="control">
        <a @click="saveAs" v-if="!state.hideTextarea">SaveCodeAs</a>
      </label>
      <input class="control filter-input" type="text" v-model="state.filter" placeholder="filter field:name" />
    </div>
    <textarea ref="textarea" :hidden="state.hideTextarea" v-model="state.format" placeholder="field,4"></textarea>
    <progress :max="state.fileTotal" v-if="!!state.fileReaded && state.fileReaded !== state.fileTotal" :value="state.fileReaded" />
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
          <tr :key="index" v-if="record.type === 'group'" :style="{borderTop:'2px solid #ccc',backgroundColor:getColor(record.name)}" :hidden="!!state.filter">
            <td @click="log(record)"><strong>{{record.name}}</strong></td>
            <td></td>
            <td></td>
          </tr>
          <tr :key="index" v-if="record.type === 'field'" :style="{backgroundColor:getColor()}" :hidden="match(record.name)">
            <td @click="log(record)">{{record.name}}</td>
            <td>
              <span class="length">{{record.length || 0}}</span>
              <span class="offset" v-if="record.offset">{{record.offset[0]}} - {{record.offset[1]}}</span>
            </td>
            <td>
              <pre class="cell-content" @click="copy(record.value)">{{record.value}}</pre>
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
import {
    fitHeight,
    parseText,
    getValue,
    parseFormatter,
    parseFile,
    parseBlank,
    tips,
    genColorFromString,
    parseJson,
} from './utils';
import parser from './parser';
const cacheFormatterKey = 'lab.fileParser.textarea';
const cacheToggleTextareaKey = 'lab.fileParser.toggle.textarea';
const cacheLastFormatter = 'lab.fileParser.lastformatter';
const cacheUserFormatter = 'lab.fileParser.formatter.user';

export default createComponent({
    components: {},
    props: {
        file: Blob,
    },
    setup(props, context) {
        const state = reactive({
            format: localStorage.getItem(cacheFormatterKey) || '',
            hideTextarea: !!+localStorage.getItem(cacheToggleTextareaKey),
            lastFormatter: localStorage.getItem(cacheLastFormatter),
            parsers: {},
            formatter: [],
            result: [],
            filter: '',
            fileReaded: 0,
            fileTotal: 0,
        });
        loadFormatter(parseJson(localStorage.getItem(cacheUserFormatter)) || {});
        let color = '';
        watch(
            () => state.format,
            () => {
                fitHeight(context.refs.textarea);
                localStorage.setItem(cacheFormatterKey, state.format);
                state.formatter = parseText(state.format);
            },
        );
        watch(
            () => state.hideTextarea,
            () => {
                fitHeight(context.refs.textarea);
                localStorage.setItem(cacheToggleTextareaKey, +state.hideTextarea);
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

        function progress(loaded, total) {
            state.fileReaded = loaded;
            state.fileTotal = total;
            context.emit('progress', {
                loaded,
                total,
            });
        }

        async function parseValue() {
            state.result = props.file
                ? await parseFile(state.formatter, props.file, progress)
                : await parseBlank(state.formatter);
            console.log(state.result);
        }
        function loadFormatter(userPart) {
            state.parsers = {
                ...parser,
                ...userPart,
            };
        }

        return {
            state,
            tips,
            saveAs() {
                const name = window.prompt('把解析脚本保存为');
                if (!name) {
                    return;
                }
                const cache = parseJson(localStorage.getItem(cacheUserFormatter)) || {};
                if (!cache) {
                    return;
                }
                cache[name] = state.format;
                localStorage.setItem(cacheUserFormatter, JSON.stringify(cache));
                loadFormatter(cache);
            },
            match(name) {
                return state.filter ? !name.includes(state.filter) : false;
            },
            setFormatter(e) {
                if (state.parsers[e.target.value]) {
                    state.format = state.parsers[e.target.value];
                    state.lastFormatter = e.target.value;
                } else {
                    state.lastFormatter = '';
                }
                localStorage.setItem(cacheLastFormatter, state.lastFormatter);
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
progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    border-radius: 0;
    z-index: 9;
}
table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
}
.control-bar {
    display: flex;
    margin: 0.1rem;
    overflow: hidden;
}
.filter-input {
    padding: 0.04rem 0.1rem;
    width: 50vw;
    border-radius: 0.06rem;
    border: 1px solid #999;
}
.control {
    flex: 1;
    box-sizing: border-box;
    line-height: 0.5rem;
}
select,
input {
    height: 0.5rem;
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
    font-size: 0.24rem;
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
.tips {
    padding: 0.2rem;
    font-size: 0.24rem;
    color: #666;
    line-height: 1.4;
    background: #ddd;
}
</style>
