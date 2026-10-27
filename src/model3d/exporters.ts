import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildScene } from './geometry';
import type { GeometryQuality, ModelDocument } from './types';

function download(data: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(name: string) {
    return name.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_') || 'model';
}

export function exportSTL(document: ModelDocument, name: string, quality: GeometryQuality) {
    const scene = buildScene(document, quality, false);
    const result = new STLExporter().parse(scene, { binary: true }) as DataView;
    download(result.buffer as ArrayBuffer, `${safeName(name)}-${quality}.stl`, 'model/stl');
}

export async function exportGLB(document: ModelDocument, name: string, quality: GeometryQuality) {
    const scene = buildScene(document, quality, false);
    const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
    download(result as ArrayBuffer, `${safeName(name)}-${quality}.glb`, 'model/gltf-binary');
}

export function exportProject(document: ModelDocument, name: string) {
    download(JSON.stringify(document, null, 2), `${safeName(name)}.model.json`, 'application/json');
}
