import { type Component, createApp } from 'vue';

function getWrapper() {
    if (document.getElementById('app')) {
        return document.getElementById('app');
    }
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);
    return div;
}

export function mountVue(App: Component) {
    return createApp(App).mount(getWrapper());
}
