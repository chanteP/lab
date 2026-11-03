import * as THREE from 'three';
import { evaluateBoolean } from './ManifoldKernel';
import type { ModelEntity, Vec3 } from '../../types';
import { assertValidSolid, type GeometryValidation } from './GeometryValidator';

export type FaceOffset = NonNullable<ModelEntity['faceOffset']>;
export interface FaceExtrusionResult { geometry: THREE.BufferGeometry; validation: GeometryValidation; operation: 'union' | 'subtract' | 'none' }

function reverseTriangle(points: THREE.Vector3[]) { return [points[0], points[2], points[1]]; }

/** Builds one closed, oriented sweep from the complete face triangulation, including inner loops. */
export function buildFaceExtrusionTool(offset: FaceOffset, zeroTolerance = 1e-7) {
    const source = offset.vertices || [], sourceIndices = offset.indices || [];
    if (source.length < 3 || sourceIndices.length < 3 || sourceIndices.length % 3 !== 0) throw new Error('选中面缺少完整三角面片');
    if (Math.abs(offset.distance) <= zeroTolerance) return new THREE.BufferGeometry();
    const vertices: THREE.Vector3[] = [];
    const vertexMap = new Map<string, number>();
    const resolve = (point: Vec3) => {
        const key = point.map((value) => Number(value.toFixed(5))).join(',');
        let index = vertexMap.get(key);
        if (index === undefined) {
            index = vertices.length;
            vertexMap.set(key, index);
            vertices.push(new THREE.Vector3(...point));
        }
        return index;
    };
    source.forEach(resolve);
    const normal = new THREE.Vector3(...offset.normal).normalize();
    const direction = normal.clone().multiplyScalar(Math.sign(offset.distance));
    const orientedTriangles: [number, number, number][] = [];
    for (let cursor = 0; cursor < sourceIndices.length; cursor += 3) {
        const triangle = sourceIndices.slice(cursor, cursor + 3).map((index) => resolve(source[index])) as [number, number, number];
        const [a, b, c] = triangle.map((index) => vertices[index]);
        const triangleNormal = b.clone().sub(a).cross(c.clone().sub(a));
        if (triangleNormal.lengthSq() < 1e-16) throw new Error('选中面包含退化三角形');
        orientedTriangles.push(triangleNormal.dot(normal) < 0 ? [triangle[0], triangle[2], triangle[1]] : triangle);
    }
    const boundary = new Map<string, { a: number; b: number; count: number }>();
    orientedTriangles.forEach((triangle) => {
        for (let corner = 0; corner < 3; corner++) {
            const a = triangle[corner], b = triangle[(corner + 1) % 3];
            const key = [a, b].sort((x, y) => x - y).join(':');
            const edge = boundary.get(key);
            if (edge) { edge.count++; continue; }
            boundary.set(key, { a, b, count: 1 });
        }
    });
    if (![...boundary.values()].some((edge) => edge.count === 1)) throw new Error('选中面没有可用边界环');
    if ([...boundary.values()].some((edge) => edge.count > 2)) throw new Error('选中面不是可拉伸的平面区域');

    const origin = vertices[0];
    const u = vertices[1].clone().sub(origin).normalize();
    if (u.lengthSq() < 0.5 || Math.abs(u.dot(direction)) > 0.999) throw new Error('选中面坐标系退化');
    const overlap = Math.min(1e-4, Math.abs(offset.distance) * 1e-3);
    const depth = Math.abs(offset.distance) + overlap;
    const positions: number[] = [];
    const push = (vertex: number, z: number) => {
        // Keep original coordinates on the shared face; a local-basis round trip creates coplanar slivers.
        const point = vertices[vertex].clone().addScaledVector(direction, z - overlap);
        positions.push(...point.toArray());
    };
    const emit = (triangle: number[], z: number, reverse = false) => {
        const oriented = reverse ? [triangle[0], triangle[2], triangle[1]] : triangle;
        oriented.forEach((vertex) => push(vertex, z));
    };
    const positive = offset.distance > 0;
    orientedTriangles.forEach((triangle) => {
        emit(triangle, 0, positive);
        emit(triangle, depth, !positive);
    });
    boundary.forEach((edge) => {
        if (edge.count !== 1) return;
        const [a, b] = positive ? [edge.a, edge.b] : [edge.b, edge.a];
        // Cap and side coordinates use the same local z values so Float32 conversion cannot open seams.
        push(a, 0); push(b, 0); push(b, depth);
        push(a, 0); push(b, depth); push(a, depth);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
    geometry.computeVertexNormals();
    assertValidSolid(geometry, false);
    return geometry;
}

/** Evaluates against S0 in one coordinate system; all kernel buffers are copied before release. */
export function evaluateFaceExtrusion(base: THREE.BufferGeometry, offset: FaceOffset): FaceExtrusionResult {
    if (Math.abs(offset.distance) <= 1e-7) {
        const geometry = base.clone();
        return { geometry, validation: assertValidSolid(geometry), operation: 'none' };
    }
    const tool = buildFaceExtrusionTool(offset);
    try {
        const operation = offset.distance > 0 ? 'union' : 'subtract';
        const geometry = evaluateBoolean(base, tool, operation);
        return { geometry, validation: assertValidSolid(geometry), operation };
    } finally {
        tool.dispose();
    }
}
