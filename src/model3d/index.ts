import App from './App.vue';
import { initializeManifold } from './engine/modeling/ManifoldKernel';
import { mountVue } from '../common/vue';
import { UI_COLORS, UI_NAMED_COLORS } from './config/colors';
import './styles/model3d.css';

UI_COLORS.forEach((color) => document.documentElement.style.setProperty(`--model3d-ui-${color.slice(1).toLowerCase()}`, color));
Object.entries(UI_NAMED_COLORS).forEach(([name, color]) => document.documentElement.style.setProperty(`--model3d-ui-${name}`, color));

initializeManifold().then(() => mountVue(App, true)).catch((error) => console.error('无法初始化实体几何内核', error));
