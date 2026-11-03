import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm';
import type { BooleanOperation } from '../../types';
import { geometryMergeVectors } from '../topology/RenderVertices';

let modulePromise: Promise<ManifoldToplevel> | null = null;
let kernel: ManifoldToplevel | null = null;

export async function initializeManifold() {
    if (!modulePromise) modulePromise = Module({ locateFile: () => (globalThis as any).process?.versions?.node ? decodeURIComponent(new URL(wasmUrl, import.meta.url).pathname) : wasmUrl }).then((module) => {
        module.setup();
        kernel = module;
        return module;
    });
    return modulePromise;
}

export function getManifold() {
    if (!kernel) throw new Error('实体几何内核尚未初始化');
    return kernel;
}

function inputMesh(geometry: THREE.BufferGeometry) {
    const position = geometry.attributes.position;
    const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: position.count }, (_, index) => index);
    const merge = geometryMergeVectors(geometry);
    let mergedGeometry: THREE.BufferGeometry | null = null;
    let properties = position.array;
    let triangles = indices;
    if (!merge) {
        // Primitive/legacy meshes need a body-local weld. Kernel results instead retain their explicit merge vectors.
        const positionsOnly = new THREE.BufferGeometry();
        positionsOnly.setAttribute('position', position.clone());
        if (geometry.index) positionsOnly.setIndex(geometry.index.clone());
        mergedGeometry = mergeVertices(positionsOnly, 1e-6);
        positionsOnly.dispose();
        properties = mergedGeometry.attributes.position.array;
        triangles = mergedGeometry.index ? Array.from(mergedGeometry.index.array) : Array.from({ length: mergedGeometry.attributes.position.count }, (_, index) => index);
    }
    const mesh = new (getManifold().Mesh)({
        numProp: 3,
        vertProperties: new Float32Array(properties),
        triVerts: new Uint32Array(triangles),
        ...(merge ? { mergeFromVert: new Uint32Array(merge.from), mergeToVert: new Uint32Array(merge.to) } : {}),
    });
    mergedGeometry?.dispose();
    return mesh;
}

function outputGeometry(mesh: InstanceType<ManifoldToplevel['Mesh']>) {
    // Copy before deleting WASM objects or allowing a later operation to grow its heap.
    const properties = new Float32Array(mesh.vertProperties);
    const indices = new Uint32Array(mesh.triVerts);
    const faceIDs = new Uint32Array(mesh.faceID);
    const mergeFromVert = new Uint32Array(mesh.mergeFromVert);
    const mergeToVert = new Uint32Array(mesh.mergeToVert);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let vertex = 0; vertex < mesh.numVert; vertex++) {
        positions[vertex * 3] = properties[vertex * mesh.numProp];
        positions[vertex * 3 + 1] = properties[vertex * mesh.numProp + 1];
        positions[vertex * 3 + 2] = properties[vertex * mesh.numProp + 2];
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(mesh.numVert * 2), 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.sourceFaceIDs = faceIDs;
    geometry.userData.mergeFromVert = mergeFromVert;
    geometry.userData.mergeToVert = mergeToVert;
    return geometry;
}

export function evaluateBoolean(base: THREE.BufferGeometry, tool: THREE.BufferGeometry, operation: BooleanOperation) {
    const { Manifold } = getManifold();
    const baseMesh = inputMesh(base), toolMesh = inputMesh(tool);
    let baseSolid: InstanceType<typeof Manifold> | null = null;
    let toolSolid: InstanceType<typeof Manifold> | null = null;
    let result: InstanceType<typeof Manifold> | null = null;
    try {
        try { baseSolid = new Manifold(baseMesh); } catch (error) { throw new Error(`目标实体无法转换为闭合网格：${error instanceof Error ? error.message : error}`); }
        try { toolSolid = new Manifold(toolMesh); } catch (error) { throw new Error(`拉伸工具体无效：${error instanceof Error ? error.message : error}`); }
        if (baseSolid.status() !== 'NoError') throw new Error(`目标实体无效：${baseSolid.status()}`);
        if (toolSolid.status() !== 'NoError') throw new Error(`工具体无效：${toolSolid.status()}`);
        const simplifiedBase = baseSolid.simplify();
        const simplifiedTool = toolSolid.simplify();
        baseSolid.delete();
        toolSolid.delete();
        baseSolid = simplifiedBase;
        toolSolid = simplifiedTool;
        result = operation === 'union' ? baseSolid.add(toolSolid) : operation === 'subtract' ? baseSolid.subtract(toolSolid) : baseSolid.intersect(toolSolid);
        if (result.status() !== 'NoError') throw new Error(`布尔运算失败：${result.status()}`);
        if (result.isEmpty()) return new THREE.BufferGeometry();
        const simplified = result.simplify();
        result.delete();
        result = simplified;
        if (result.status() !== 'NoError') throw new Error(`结果清理失败：${result.status()}`);
        const mesh = result.getMesh();
        return outputGeometry(mesh);
    } finally {
        result?.delete();
        baseSolid?.delete();
        toolSolid?.delete();
    }
}

/** Normalizes planar contours with Manifold before extruding; self-intersecting CSG fragments never enter the sweep. */
export function extrudeNormalizedFaceLoops(
    loops: THREE.Vector2[][],
    depth: number,
    u: THREE.Vector3,
    v: THREE.Vector3,
    direction: THREE.Vector3,
    origin: THREE.Vector3,
) {
    const { CrossSection } = getManifold();
    const polygons = loops.map((loop) => loop.map((point) => [point.x, point.y] as [number, number]));
    const section = CrossSection.ofPolygons(polygons, 'EvenOdd');
    let solid: InstanceType<ReturnType<typeof getManifold>['Manifold']> | null = null;
    let transformed: typeof solid = null;
    try {
        if (section.isEmpty()) throw new Error('选中面的有效轮廓为空');
        solid = section.extrude(depth);
        const matrix = new THREE.Matrix4().makeBasis(u, v, direction).setPosition(origin);
        transformed = solid.transform(matrix.elements as unknown as import('manifold-3d').Mat4);
        if (transformed.status() !== 'NoError') throw new Error(`扫掠体无效：${transformed.status()}`);
        const mesh = transformed.getMesh();
        return outputGeometry(mesh);
    } finally {
        transformed?.delete();
        solid?.delete();
        section.delete();
    }
}
