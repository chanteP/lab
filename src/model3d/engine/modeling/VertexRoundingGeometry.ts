import * as THREE from 'three';
import type { Vec3 } from '../../types';

const PATCH_SEGMENTS = 36;
const ARC_CONTROL = 4 / Math.SQRT2 - 2.5;
// Symmetry-profile regression: 0.86 still creates 6 concave intervals; 0.87 is the first ratio with none.
export const VERTEX_ROUNDING_CENTER_RATIO = 0.87;

type PositionAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function signedVolume(position: PositionAttribute, indices: number[]) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let volume = 0;
    for (let offset = 0; offset < indices.length; offset += 3) {
        a.fromBufferAttribute(position, indices[offset]);
        b.fromBufferAttribute(position, indices[offset + 1]);
        c.fromBufferAttribute(position, indices[offset + 2]);
        volume += a.dot(b.cross(c)) / 6;
    }
    return volume;
}

function orientClosedMesh(position: PositionAttribute, indices: number[]) {
    type EdgeUse = { triangle: number; from: number; to: number };
    const edges = new Map<string, EdgeUse[]>();
    const sharedEdges = new Map<string, { first: EdgeUse; second: EdgeUse }>();
    const adjacent: number[][] = Array.from({ length: indices.length / 3 }, () => []);
    for (let triangle = 0; triangle < indices.length / 3; triangle++) for (let corner = 0; corner < 3; corner++) {
        const from = indices[triangle * 3 + corner], to = indices[triangle * 3 + (corner + 1) % 3];
        const key = [from, to].sort((a, b) => a - b).join(':');
        const uses = edges.get(key) || [];
        uses.forEach((use) => {
            adjacent[triangle].push(use.triangle); adjacent[use.triangle].push(triangle);
            sharedEdges.set([use.triangle, triangle].sort((a, b) => a - b).join(':'), { first: use, second: { triangle, from, to } });
        });
        uses.push({ triangle, from, to });
        edges.set(key, uses);
    }

    const flipped = new Set<number>(), visited = new Set<number>();
    for (let seed = 0; seed < adjacent.length; seed++) {
        if (visited.has(seed)) continue;
        const queue = [seed];
        visited.add(seed);
        while (queue.length) {
            const triangle = queue.shift()!;
            const direction = flipped.has(triangle) ? -1 : 1;
            adjacent[triangle].forEach((neighbor) => {
                if (visited.has(neighbor)) return;
                const shared = sharedEdges.get([triangle, neighbor].sort((a, b) => a - b).join(':'))!;
                const current = shared.first.triangle === triangle ? shared.first : shared.second;
                const other = shared.first.triangle === neighbor ? shared.first : shared.second;
                const currentSign = current.from === other.from ? direction : -direction;
                if (currentSign > 0) flipped.add(neighbor);
                visited.add(neighbor);
                queue.push(neighbor);
            });
        }
    }
    flipped.forEach((triangle) => {
        const offset = triangle * 3;
        [indices[offset + 1], indices[offset + 2]] = [indices[offset + 2], indices[offset + 1]];
    });
    if (signedVolume(position, indices) < 0) {
        for (let offset = 0; offset < indices.length; offset += 3) [indices[offset + 1], indices[offset + 2]] = [indices[offset + 2], indices[offset + 1]];
    }
}

function factorial(value: number): number {
    return value <= 1 ? 1 : value * factorial(value - 1);
}

/** One continuous quartic triangular patch; inner control rows keep it tangent to all three original planes. */
export function buildVertexRoundingCutter(radius: number, corner: Vec3, adjacentNormals: Vec3[], centerRatio = VERTEX_ROUNDING_CENTER_RATIO) {
    const normals = adjacentNormals.map((normal) => new THREE.Vector3(...normal).normalize());
    const sourceCorner = new THREE.Vector3(...corner);
    const center = normals.reduce((point, normal) => point.addScaledVector(normal, -radius), sourceCorner.clone());
    const toWorld = (point: THREE.Vector3) => {
        const result = center.clone();
        result.addScaledVector(normals[0], point.x).addScaledVector(normals[1], point.y).addScaledVector(normals[2], point.z);
        return result;
    };

    const r = radius, a = r * ARC_CONTROL, h = r * (81 * centerRatio - 60 - 8 * ARC_CONTROL) / 12;
    const controls = [
        { i: 4, j: 0, k: 0, p: new THREE.Vector3(0, r, r) },
        { i: 0, j: 4, k: 0, p: new THREE.Vector3(r, 0, r) },
        { i: 0, j: 0, k: 4, p: new THREE.Vector3(r, r, 0) },
        { i: 3, j: 1, k: 0, p: new THREE.Vector3(a, r, r) },
        { i: 3, j: 0, k: 1, p: new THREE.Vector3(a, r, r) },
        { i: 1, j: 3, k: 0, p: new THREE.Vector3(r, a, r) },
        { i: 0, j: 3, k: 1, p: new THREE.Vector3(r, a, r) },
        { i: 1, j: 0, k: 3, p: new THREE.Vector3(r, r, a) },
        { i: 0, j: 1, k: 3, p: new THREE.Vector3(r, r, a) },
        { i: 2, j: 2, k: 0, p: new THREE.Vector3(r, r, r) },
        { i: 2, j: 0, k: 2, p: new THREE.Vector3(r, r, r) },
        { i: 0, j: 2, k: 2, p: new THREE.Vector3(r, r, r) },
        { i: 2, j: 1, k: 1, p: new THREE.Vector3(h, r, r) },
        { i: 1, j: 2, k: 1, p: new THREE.Vector3(r, h, r) },
        { i: 1, j: 1, k: 2, p: new THREE.Vector3(r, r, h) },
    ];
    const evaluate = (i: number, j: number, k: number) => {
        const point = new THREE.Vector3();
        controls.forEach((control) => {
            const weight = factorial(4) / factorial(control.i) / factorial(control.j) / factorial(control.k)
                * (i / 4) ** control.i * (j / 4) ** control.j * (k / 4) ** control.k;
            point.addScaledVector(control.p, weight);
        });
        return point;
    };

    const positions: number[] = [], indices: number[] = [];
    const vertices = new Map<string, number>();
    const addVertex = (local: THREE.Vector3) => {
        const key = local.toArray().map((value) => Number(value.toFixed(7))).join(',');
        const existing = vertices.get(key);
        if (existing !== undefined) return existing;
        const index = positions.length / 3;
        positions.push(...toWorld(local).toArray());
        vertices.set(key, index);
        return index;
    };
    const addTriangle = (a: number, b: number, c: number) => {
        if (a !== b && b !== c && c !== a) indices.push(a, b, c);
    };

    const grid = new Map<string, number>();
    for (let i = 0; i <= PATCH_SEGMENTS; i++) for (let j = 0; j <= PATCH_SEGMENTS - i; j++) {
        const k = PATCH_SEGMENTS - i - j;
        grid.set(`${i}:${j}`, addVertex(evaluate(i / PATCH_SEGMENTS * 4, j / PATCH_SEGMENTS * 4, k / PATCH_SEGMENTS * 4)));
    }
    for (let i = 0; i < PATCH_SEGMENTS; i++) for (let j = 0; j < PATCH_SEGMENTS - i; j++) {
        const a = grid.get(`${i}:${j}`)!, b = grid.get(`${i + 1}:${j}`)!, c = grid.get(`${i}:${j + 1}`)!;
        addTriangle(a, b, c);
        if (j < PATCH_SEGMENTS - i - 1) addTriangle(b, grid.get(`${i + 1}:${j + 1}`)!, c);
    }

    const outer = addVertex(new THREE.Vector3(r, r, r));
    for (let side = 0; side < 3; side++) {
        const boundary: number[] = [];
        for (let step = 0; step <= PATCH_SEGMENTS; step++) {
            const i = side === 0 ? PATCH_SEGMENTS - step : side === 1 ? PATCH_SEGMENTS - step : 0;
            const j = side === 0 ? step : side === 1 ? 0 : PATCH_SEGMENTS - step;
            boundary.push(grid.get(`${i}:${j}`)!);
        }
        for (let step = 0; step < PATCH_SEGMENTS; step++) addTriangle(outer, boundary[step], boundary[step + 1]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    orientClosedMesh(geometry.attributes.position, indices);
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

/** Keep planar normals exact at the three singular points where the original sharp edges terminate. */
export function normalizeVertexRoundingNormals(geometry: THREE.BufferGeometry, corner: Vec3, adjacentNormals: Vec3[]) {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const index = geometry.index;
    if (!position || !normal || !index) return geometry;
    const sourceCorner = new THREE.Vector3(...corner);
    const normals = adjacentNormals.map((value) => new THREE.Vector3(...value).normalize());
    const triangleCount = index.count / 3;
    const trianglePlanes = Array.from({ length: triangleCount }, () => -1);
    const vertexUses = new Map<number, Set<number>>();
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const ids = [0, 1, 2].map((cornerIndex) => index.getX(triangle * 3 + cornerIndex));
        ids.forEach((id, cornerIndex) => points[cornerIndex].fromBufferAttribute(position, id));
        const faceNormal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
        const plane = normals.findIndex((normal) => faceNormal.dot(normal) > 0.999
            && points.every((point) => Math.abs(normal.dot(point.clone().sub(sourceCorner))) < 1e-4));
        trianglePlanes[triangle] = plane;
        ids.forEach((id) => {
            const uses = vertexUses.get(id) || new Set<number>();
            uses.add(plane);
            vertexUses.set(id, uses);
        });
    }

    const positions = Array.from(position.array), normalValues = Array.from(normal.array);
    const uv = geometry.attributes.uv ? Array.from(geometry.attributes.uv.array) : [];
    const indices = Array.from(index.array);
    const mergeFrom = Array.from(geometry.userData.mergeFromVert || []) as number[];
    const mergeTo = Array.from(geometry.userData.mergeToVert || []) as number[];
    const duplicates = new Map<string, number>();
    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const plane = trianglePlanes[triangle];
        if (plane < 0) continue;
        for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
            const offset = triangle * 3 + cornerIndex;
            const original = indices[offset];
            const uses = vertexUses.get(original)!;
            let target = original;
            if (uses.size > 1) {
                const key = `${original}:${plane}`;
                target = duplicates.get(key) ?? positions.length / 3;
                if (!duplicates.has(key)) {
                    duplicates.set(key, target);
                    positions.push(...new THREE.Vector3().fromBufferAttribute(position, original).toArray());
                    normalValues.push(0, 0, 0);
                    if (uv.length) uv.push(uv[original * 2], uv[original * 2 + 1]);
                    mergeFrom.push(target); mergeTo.push(original);
                }
                indices[offset] = target;
            }
            normals[plane].toArray(normalValues, target * 3);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalValues, 3));
    if (uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.userData.mergeFromVert = new Uint32Array(mergeFrom);
    geometry.userData.mergeToVert = new Uint32Array(mergeTo);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}
