import * as THREE from 'three';
import { canonicalRenderVertices } from '../topology/RenderVertices';

export interface GeometryValidation {
    valid: boolean;
    empty: boolean;
    triangles: number;
    components: number;
    volume: number;
    errors: string[];
}

/** Validates one complete result before it can replace the committed body. */
export function validateSolidGeometry(geometry: THREE.BufferGeometry, allowEmpty = true): GeometryValidation {
    const errors: string[] = [];
    const position = geometry.attributes.position;
    if (!position) return { valid: allowEmpty, empty: true, triangles: 0, components: 0, volume: 0, errors: allowEmpty ? [] : ['缺少有效的 position 属性'] };
    if (position.itemSize !== 3) return { valid: false, empty: false, triangles: 0, components: 0, volume: 0, errors: ['position.itemSize 必须为 3'] };
    for (let index = 0; index < position.array.length; index++) if (!Number.isFinite(position.array[index])) errors.push('position 包含非有限坐标');
    ['normal', 'uv'].forEach((name) => {
        const attribute = geometry.attributes[name];
        if (attribute && attribute.count !== position.count) errors.push(`${name} 与 position 不属于同一顶点版本`);
    });
    const indexAttribute = geometry.index;
    if (indexAttribute && indexAttribute.count % 3 !== 0) errors.push('索引数量不是 3 的倍数');
    const count = indexAttribute?.count || position.count;
    if (!indexAttribute && count % 3 !== 0) errors.push('非索引顶点数量不是 3 的倍数');
    if (indexAttribute) for (let index = 0; index < indexAttribute.count; index++) {
        const value = indexAttribute.getX(index);
        if (!Number.isInteger(value) || value < 0 || value >= position.count) errors.push('索引越界');
    }
    geometry.groups.forEach((group) => { if (group.start < 0 || group.count < 0 || group.start + group.count > count) errors.push('geometry group 越界'); });
    const drawCount = Number.isFinite(geometry.drawRange.count) ? count : Math.min(count, geometry.drawRange.start + geometry.drawRange.count) - geometry.drawRange.start;
    if (drawCount < 0 || geometry.drawRange.start < 0 || drawCount > count) errors.push('drawRange 越界');
    const triangles = Math.floor(count / 3);
    if (!triangles) return { valid: allowEmpty && !errors.length, empty: true, triangles: 0, components: 0, volume: 0, errors };

    const canonical = canonicalRenderVertices(geometry);
    const vertices = new Map<string, number>();
    const triangleVertices: [number, number, number][] = [];
    const edges = new Map<string, { count: number; triangles: number[]; directions: number[] }>();
    let volume = 0;
    let degenerate = 0;
    for (let triangle = 0; triangle < triangles; triangle++) {
        const ids = [0, 1, 2].map((corner) => indexAttribute ? indexAttribute.getX(triangle * 3 + corner) : triangle * 3 + corner);
        const points = ids.map((id) => new THREE.Vector3().fromBufferAttribute(position, id));
        if (points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).lengthSq() === 0) degenerate++;
        volume += points[0].dot(points[1].clone().cross(points[2])) / 6;
        const welded = points.map((point, corner) => {
            const key = canonical ? `v${canonical[ids[corner]]}` : point.toArray().join(',');
            if (!vertices.has(key)) vertices.set(key, vertices.size);
            return vertices.get(key)!;
        }) as [number, number, number];
        const triangleId = triangleVertices.length;
        triangleVertices.push(welded);
        for (let corner = 0; corner < 3; corner++) {
            const a = welded[corner], b = welded[(corner + 1) % 3];
            const key = [a, b].sort((x, y) => x - y).join(':');
            const edge = edges.get(key) || { count: 0, triangles: [], directions: [] };
            edge.count++;
            edge.directions.push(a < b ? 1 : -1);
            edge.triangles.push(triangleId);
            edges.set(key, edge);
        }
    }
    if (degenerate) errors.push(`结果包含 ${degenerate} 个退化三角形`);
    if ([...edges.values()].some((edge) => edge.count !== 2)) errors.push('结果不是闭合二流形实体');
    if ([...edges.values()].some((edge) => edge.count === 2 && edge.directions[0] === edge.directions[1])) errors.push('结果共享边方向不一致');
    if (Math.abs(volume) < 1e-10) errors.push('结果体积为零');

    const triangleAdjacency = new Map<number, number[]>();
    edges.forEach((edge) => edge.triangles.forEach((triangle) => triangleAdjacency.set(triangle, [...triangleAdjacency.get(triangle) || [], ...edge.triangles.filter((id) => id !== triangle)])));
    const visited = new Set<number>();
    let components = 0;
    for (let start = 0; start < triangleVertices.length; start++) {
        if (visited.has(start)) continue;
        components++;
        const queue = [start];
        visited.add(start);
        while (queue.length) (triangleAdjacency.get(queue.shift()!) || []).forEach((neighbor) => { if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); } });
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { valid: !errors.length, empty: false, triangles, components, volume, errors };
}

export function assertValidSolid(geometry: THREE.BufferGeometry, allowEmpty = true) {
    const result = validateSolidGeometry(geometry, allowEmpty);
    if (!result.valid) throw new Error(result.errors.join('；'));
    return result;
}
