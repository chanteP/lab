import { type Component, createApp, ref, watch, createVNode } from 'vue';
import { saveParseJSON } from './common';
import NaiveUIContainer from '../common/NaiveUIContainer.vue';

function getWrapper() {
    if (document.getElementById('app')) {
        return document.getElementById('app');
    }
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);
    return div;
}

export function mountVue(App: Component, withUI = false) {
    if (withUI) {
        const root = {
            functional: true,
            render: (context) => {
                return createVNode(NaiveUIContainer, {}, [createVNode(App)]);
            },
        };
        const app = createApp(root).mount(getWrapper());
        return app;
    } else {
        return createApp(App).mount(getWrapper());
    }
}

export function cachedRef<T = undefined>(key: string, defaultValue?: T, wideDefault = false) {
    const stringValue = localStorage.getItem(key);

    const refData = (wideDefault ? (!stringValue || stringValue === '""') : stringValue === null) ? ref<T>(defaultValue) : ref<T>(saveParseJSON(stringValue));

    watch(
        () => refData.value,
        () => {
            localStorage.setItem(key, JSON.stringify(refData.value));
        },
    );

    return refData;
}
