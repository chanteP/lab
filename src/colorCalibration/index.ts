import { mountVue } from '../common/vue';
import App from './App.vue';

async function mount() {
    mountVue(App, true);
}
mount();
