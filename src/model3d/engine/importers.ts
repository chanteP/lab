import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEntity, type ModelEntity } from '../types';
import { uid } from '../utils/id';

function extension(name: string) {
    return name.toLowerCase().split('.').pop() || '';
}

function baseName(name: string) {
    return name.replace(/\.[^.]+$/, '').trim() || '导入实体';
}

function entityFromGeometry(geometry: THREE.BufferGeometry, name: string): ModelEntity {
    if (!geometry.attributes.position?.count) throw new Error('文件中没有可导入的网格');
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, index) => index));
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const entity = createEntity('extrude', uid());
    entity.kind = 'boolean';
    entity.name = name;
    entity.position = [0, 0, 0];
    entity.compositeGeometry = true;
    entity.revision = 1;
    entity.meshGeometry = {
        positions: Array.from(geometry.attributes.position.array),
        indices: geometry.index ? Array.from(geometry.index.array) : [],
        normals: geometry.attributes.normal ? Array.from(geometry.attributes.normal.array) : undefined,
    };
    return entity;
}

function entitiesFromGroup(group: THREE.Group, name: string) {
    group.updateMatrixWorld(true);
    const entities: ModelEntity[] = [];
    group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        entities.push(entityFromGeometry(geometry, entities.length ? `${name} ${entities.length + 1}` : name));
        geometry.dispose();
    });
    if (!entities.length) throw new Error('文件中没有可导入的网格');
    return entities;
}

/** Imports self-contained static meshes; external .gltf resources and textures are intentionally unsupported. */
export async function importMeshFile(file: File): Promise<ModelEntity[]> {
    const type = extension(file.name), name = baseName(file.name);
    if (type === 'stl') return [entityFromGeometry(new STLLoader().parse(await file.arrayBuffer()), name)];
    if (type === 'obj') return entitiesFromGroup(new OBJLoader().parse(await file.text()), name);
    if (type === 'glb') {
        const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '');
        return entitiesFromGroup(gltf.scene, name);
    }
    throw new Error('仅支持 STL、OBJ、GLB 格式的 3D 文件');
}
