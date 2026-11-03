import * as THREE from 'three';
import { evaluateBoolean, getManifold } from './ManifoldKernel';
import type { ModelEntity, Vec3 } from '../../types';
import { assertValidSolid, type GeometryValidation } from './GeometryValidator';

export type FaceOffset = NonNullable<ModelEntity['faceOffset']>;
export interface FaceExtrusionResult { geometry: THREE.BufferGeometry; validation: GeometryValidation; operation: 'union' | 'subtract' | 'none' }


function triangulateBoundary(
    boundary: Map<string, { a: number; b: number; count: number }>,
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
) {
    const outgoing = new Map<number, number[]>();
    boundary.forEach((edge) => {
        if (edge.count !== 1) return;
        outgoing.set(edge.a, [...outgoing.get(edge.a) || [], edge.b]);
    });
    const unused = new Set([...boundary.values()].filter((edge) => edge.count === 1).map((edge) => `${edge.a}:${edge.b}`));
    const loops: number[][] = [];
    while (unused.size) {
        const first = [...unused][0];
        const [start, following] = first.split(':').map(Number);
        const loop = [start];
        let current = start, next = following;
        while (true) {
            const key = `${current}:${next}`;
            if (!unused.has(key)) throw new Error('选中面的边界环不完整');
            unused.delete(key);
            loop.push(next);
            current = next;
            if (current === start) break;
            const candidates = (outgoing.get(current) || []).filter((target) => unused.has(`${current}:${target}`));
            if (candidates.length !== 1) throw new Error('选中面的边界存在分叉');
            next = candidates[0];
        }
        loop.pop();
        if (loop.length < 3) throw new Error('选中面的边界环点数不足');
        loops.push(loop);
    }

    const origin = vertices[0];
    const u = vertices[1].clone().sub(origin).normalize();
    const v = normal.clone().cross(u).normalize();
    const project = (id: number) => {
        const point = vertices[id].clone().sub(origin);
        return new THREE.Vector2(point.dot(u), point.dot(v));
    };
    const projected = loops.map((loop) => loop.map(project));
    const area = (loop: THREE.Vector2[]) => Math.abs(THREE.ShapeUtils.area(loop));
    const outerIndex = projected.reduce((best, _, index) => area(projected[index]) > area(projected[best]) ? index : best, 0);
    const ordered = [loops[outerIndex], ...loops.filter((_, index) => index !== outerIndex)];
    const orderedProjected = [projected[outerIndex], ...projected.filter((_, index) => index !== outerIndex)];
    const flatIds = ordered.flat();
    const polygons = orderedProjected.map((loop) => loop.map((point) => [point.x, point.y] as [number, number]));
    return getManifold().triangulate(polygons, 1e-9, false).map((triangle) => {
        const ids = triangle.map((index) => flatIds[index]) as [number, number, number];
        const [a, b, c] = ids.map((id) => vertices[id]);
        return b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) < 0 ? [ids[0], ids[2], ids[1]] : ids;
    }) as [number, number, number][];
}

/** Builds one closed, oriented sweep from real boundary loops, excluding patch-internal triangulation edges. */
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
    // Real penetration into S0 avoids coplanar-only CSG at curved trim edges; the final cap remains exactly at d.
    const overlap = Math.min(1e-3, Math.abs(offset.distance) / 2);
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
    const capTriangles = triangulateBoundary(boundary, vertices, normal);
    capTriangles.forEach((triangle) => {
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
