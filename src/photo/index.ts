import { loadScript } from '../common/loader';
import { mountVue } from '../common/vue';
import App from './App.vue';

async function mount() {
    await loadScript('/public/lib/ffmpeg/umd/ffmpeg.js');

    mountVue(App, true);
}
mount();
