import { darkTheme } from 'naive-ui';
import { mountVue } from '../common/vue';
import App from './App.vue';
import 'leaflet/dist/leaflet.css';

mountVue(App, true, darkTheme);
