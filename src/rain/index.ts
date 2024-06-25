import { renderFullScreenCanvas } from '../common/gl';
import frag from './frag.glsl';
import bg from './bg.png';
import { loadImage } from '../common/image';

async function main() {
    const background = await loadImage(bg);
    const ratio = 2;

    const { gl, injectTexture } = renderFullScreenCanvas({
        frag,
        autoPlay: true,
    });

    injectTexture('background', 0, background);

    // document.body.style.background = `linear-gradient(180deg, rgb(255 244 208), rgb(84 203 177))`;

    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', async (e: DragEvent) => {
        e.preventDefault();
        const img = Array.from(e.dataTransfer.files).find((file) => {
            return file.name.endsWith('.png') || file.name.endsWith('.jpg');
        });

        const background = await loadImage(URL.createObjectURL(img));
        injectTexture('background', 0, background);
    });
}

main();
