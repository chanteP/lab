import App from './App.vue';
import { createApp } from 'vue';

function getWrapper() {
    if (document.getElementById('app')) {
        return document.getElementById('app');
    }
    const div = document.createElement('div');
    div.id = 'app';
    document.body.appendChild(div);
    return div;
}

createApp(App).mount(getWrapper());
