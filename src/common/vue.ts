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

interface CacheRefOptions<T> {
    // 宽松检测，缓存是‘’也走默认
    wideDefault?: boolean;
    // 如果符合这个条件，优先用这个
    firstCheck?: () => T | undefined;
}

export function cachedRef<T = undefined>(key: string, defaultValue?: T, options?: CacheRefOptions<T>) {
    const stringValue = localStorage.getItem(key);

    let refDataValue = options?.firstCheck?.() ?? defaultValue;

    if (!(options?.wideDefault ? !stringValue || stringValue === '""' : stringValue === null)) {
        refDataValue = saveParseJSON(stringValue);
    }

    const refData = ref<T>(refDataValue as T);
    watch(
        () => refData.value,
        () => {
            localStorage.setItem(key, JSON.stringify(refData.value));
        },
    );

    return refData;
}
