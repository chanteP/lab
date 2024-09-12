import { loadImage } from '../loader';

async function getNoise(size: 256 | 512 | 1024 = 256) {
    if (size === 512) {
        return import('./noise512.png');
    }
    if (size === 1024) {
        return import('./noise1024.png');
    }
    return import('./noise.png');
}

export async function getNoiseImg(size: 256 | 512 | 1024 = 256) {
    const src = (await getNoise(size)).default;
    return loadImage(src);
}
