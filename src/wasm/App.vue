<template>
    <div class="wrapper">
        <h1>{{state.status}}</h1>
        <div>
            <input v-model="state.n" type="tel" />
            <span>{{tips}}</span>
        </div>
        <div><b>result:</b> {{state.result}}</div>
        <div>
            <button @click="run('js')">js</button><span>{{state.time.js}} ms</span>
        </div>
        <div>
            <button @click="run('c')">c</button><span>{{state.time.c}} ms</span>
        </div>
        <div>
            <button @click="run('assemblyScript')">assemblyScript</button><span>{{state.time.assemblyScript}} ms</span>
        </div>
        <pre>
            <code>
                function fib(n) {
                    if (n &lt;= 2) {
                        return 1;
                    }
                    return fib(n - 1) + fib(n - 2);
                }
            </code>
        </pre>
    </div>
</template>
<script>
import { createComponent, reactive, computed, watch, onMounted } from '@vue/composition-api';
import { fib as jsFib } from './fn/fibonacci.js';
import wasmModule from './fn/fibonacci.asm';
import wasmModuleC from './fn/fibonacci-c.wasm';

export default createComponent({
    setup(props, context) {
        const state = reactive({
            status: 'loading',
            n: 38,
            time: {
                js: 0,
                c: 0,
                assemblyScript: 0
            },
            result: 0
        });
        const fns = {};

        const tips = computed(() => {
            return state.n > 42 ? '慎重，你的浏览器会死掉的' : '';
        });

        Promise.all([wasmModule(), wasmModuleC()]).then(
            ([
                {
                    exports: { fib: asmFib }
                },
                {
                    exports: { fib: cFib }
                }
            ]) => {
                fns.js = jsFib;
                register('js', jsFib);
                register('c', cFib);
                register('assemblyScript', asmFib);
                state.status = 'ready';
            }
        );

        function register(key, fn) {
            fns[key] = n => {
                const t1 = Date.now();
                console.time(name);
                const rs = fn(n);
                console.timeEnd(name);
                state.time[key] = Date.now() - t1;
                return (state.result = rs);
            };
        }

        return {
            state,
            tips,
            run(key) {
                fns[key](state.n);
            }
        };
    }
});
</script>
<style>
.wrapper div {
    margin: 10px;
}
input{
    width:100px;
    height: 50px;
    line-height: 50px;
}
button {
    width: 100px;
    height: 50px;
}
button + span {
    display: inline-block;
    margin-left: 20px;
}
code {
    background: #333;
    display: block;
    color: #fff;
}
</style>
