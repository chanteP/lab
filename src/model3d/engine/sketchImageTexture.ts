import * as THREE from 'three';

const textures = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/** Document sync can be frequent during corner drags; decoded data-URL textures are shared by source. */
export function sketchImageTexture(source: string) {
    let texture = textures.get(source);
    if (!texture) {
        texture = loader.load(source);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        textures.set(source, texture);
    }
    return texture;
}
