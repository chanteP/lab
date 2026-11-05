import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm';
import type { BooleanOperation, Vec3 } from '../../types';
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
    const normals = mesh.numProp >= 6 ? new Float32Array(mesh.numVert * 3) : null;
    for (let vertex = 0; vertex < mesh.numVert; vertex++) {
        positions[vertex * 3] = properties[vertex * mesh.numProp];
        positions[vertex * 3 + 1] = properties[vertex * mesh.numProp + 1];
        positions[vertex * 3 + 2] = properties[vertex * mesh.numProp + 2];
        if (normals) for (let axis = 0; axis < 3; axis++) normals[vertex * 3 + axis] = properties[vertex * mesh.numProp + 3 + axis];
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(mesh.numVert * 2), 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    else geometry.computeVertexNormals();
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
        const simplified = result.asOriginal().simplify();
        result.delete();
        result = simplified;
        if (result.status() !== 'NoError') throw new Error(`结果清理失败：${result.status()}`);
        const shaded = result.calculateNormals(0, 60);
        result.delete();
        result = shaded;
        const mesh = result.getMesh(0);
        return outputGeometry(mesh);
    } finally {
        result?.delete();
        baseSolid?.delete();
        toolSolid?.delete();
    }
}

/** Exact local chamfer using the kernel's half-space trim instead of a coplanar tetrahedron subtraction. */
export function evaluatePlaneChamfer(base: THREE.BufferGeometry, corner: Vec3, radius: number, planeNormal: Vec3, planeOffset: number) {
    const { Manifold } = getManifold();
    const normal = new THREE.Vector3(...planeNormal).normalize();
    const sourceCorner = new THREE.Vector3(...corner);
    const position = base.attributes.position;
    // Plane trimming is global; use it only when the removed half-space is local to this treatment.
    for (let index = 0; index < position.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, index);
        if (normal.dot(point) > planeOffset + 1e-6 && point.distanceTo(sourceCorner) > radius * 3 + 0.25) return null;
    }
    let baseSolid: InstanceType<typeof Manifold> | null = null;
    let result: InstanceType<typeof Manifold> | null = null;
    try {
        baseSolid = new Manifold(inputMesh(base));
        const simplifiedBase = baseSolid.simplify();
        baseSolid.delete();
        baseSolid = simplifiedBase;
        const inward = normal.clone().negate();
        result = baseSolid.trimByPlane(inward.toArray(), -planeOffset);
        if (result.status() !== 'NoError' || result.isEmpty()) return null;
        const simplified = result.asOriginal().simplify();
        result.delete();
        result = simplified;
        const shaded = result.calculateNormals(0, 60);
        result.delete();
        result = shaded;
        return outputGeometry(result.getMesh(0));
    } finally {
        result?.delete();
        baseSolid?.delete();
    }
}

/** Subtract one local sphere octant; its circular boundaries are tangent to the adjacent planes and end on the incident edges. */
export function evaluateVertexRounding(base: THREE.BufferGeometry, radius: number, corner: Vec3, adjacentNormals: Vec3[]) {
    if (radius <= 0 || adjacentNormals.length !== 3) return null;
    const { Manifold } = getManifold();
    let baseSolid: InstanceType<typeof Manifold> | null = null;
    let sphere: InstanceType<typeof Manifold> | null = null;
    let centered: InstanceType<typeof Manifold> | null = null;
    let result: InstanceType<typeof Manifold> | null = null;
    try {
        baseSolid = new Manifold(inputMesh(base));
        if (baseSolid.status() !== 'NoError') throw new Error(`目标实体无效：${baseSolid.status()}`);
        const simplifiedBase = baseSolid.simplify();
        baseSolid.delete();
        baseSolid = simplifiedBase;
        centered = Manifold.sphere(radius, 64);
        sphere = centered.translate(...corner);
        centered.delete();
        centered = null;
        result = baseSolid.subtract(sphere);
        if (result.status() !== 'NoError') throw new Error(`顶点圆滑化失败：${result.status()}`);
        if (result.isEmpty()) return new THREE.BufferGeometry();
        const simplified = result.asOriginal().simplify();
        result.delete();
        result = simplified;
        const shaded = result.calculateNormals(0, 60);
        result.delete();
        result = shaded;
        return outputGeometry(result.getMesh(0));
    } finally {
        result?.delete();
        centered?.delete();
        sphere?.delete();
        baseSolid?.delete();
    }
}

/** Restores sharp render normals through the same owned kernel representation used by Boolean operations. */
export function normalizeBakedGeometryNormals(geometry: THREE.BufferGeometry) {
    if (!geometry.attributes.position?.count) return geometry;
    const { Manifold } = getManifold();
    const mesh = inputMesh(geometry);
    let solid: InstanceType<typeof Manifold> | null = null;
    let shaded: InstanceType<typeof Manifold> | null = null;
    try {
        solid = new Manifold(mesh);
        if (solid.status() !== 'NoError') throw new Error(`烘焙实体无效：${solid.status()}`);
        shaded = solid.calculateNormals(0, 60);
        return outputGeometry(shaded.getMesh(0));
    } finally {
        shaded?.delete();
        solid?.delete();
    }
}
