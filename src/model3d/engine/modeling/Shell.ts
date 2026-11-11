import * as THREE from 'three';
import type { Vec3 } from '../../types';
import { getManifold, inputMesh, outputGeometry } from './ManifoldKernel';
import { assertValidSolid } from './GeometryValidator';

export type ShellOpening = {
    /** Planar face triangles and outward normal in body-local coordinates. */
    vertices: Vec3[];
    indices: number[];
    normal: Vec3;
};

function openingShape(opening: ShellOpening) {
    const normal = new THREE.Vector3(...opening.normal).normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(u.dot(normal)) > 0.9) u.set(0, 1, 0);
    u.addScaledVector(normal, -u.dot(normal)).normalize();
    const v = normal.clone().cross(u).normalize();
    const points = opening.vertices.map((point) => new THREE.Vector3(...point));
    const welded: number[] = [];
    const unique: THREE.Vector3[] = [];
    const keys = new Map<string, number>();
    points.forEach((point) => {
        const key = point.toArray().map((value) => Math.round(value * 1e6)).join(',');
        if (!keys.has(key)) { keys.set(key, unique.length); unique.push(point); }
        welded.push(keys.get(key)!);
    });
    const edges = new Map<string, { a: number; b: number; count: number }>();
    for (let index = 0; index < opening.indices.length; index += 3) {
        const triangle = [opening.indices[index], opening.indices[index + 1], opening.indices[index + 2]];
        for (let corner = 0; corner < 3; corner++) {
            const a = welded[triangle[corner]], b = welded[triangle[(corner + 1) % 3]];
            const key = [a, b].sort((x, y) => x - y).join(':');
            const edge = edges.get(key);
            if (edge) edge.count++;
            else edges.set(key, { a, b, count: 1 });
        }
    }
    const adjacency = new Map<number, number[]>();
    edges.forEach((edge) => {
        if (edge.count !== 1) return;
        adjacency.set(edge.a, [...adjacency.get(edge.a) || [], edge.b]);
        adjacency.set(edge.b, [...adjacency.get(edge.b) || [], edge.a]);
    });
    const visited = new Set<string>();
    const loops: number[][] = [];
    adjacency.forEach((_, start) => {
        if (visited.has(`${start}:${adjacency.get(start)![0]}`)) return;
        const loop: number[] = [];
        let previous = -1, current = start;
        do {
            const next = adjacency.get(current)?.find((candidate) => candidate !== previous && !visited.has(`${current}:${candidate}`));
            if (next === undefined) break;
            visited.add(`${current}:${next}`); visited.add(`${next}:${current}`);
            loop.push(current); previous = current; current = next;
        } while (current !== start);
        if (current === start && loop.length >= 3) loops.push(loop);
    });
    if (!loops.length) throw new Error('无法识别开口面的边界');
    const project = (index: number) => new THREE.Vector2(unique[index].dot(u), unique[index].dot(v));
    loops.sort((a, b) => Math.abs(THREE.ShapeUtils.area(b.map(project))) - Math.abs(THREE.ShapeUtils.area(a.map(project))));
    const outer = loops[0].map(project);
    if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
    const shape = new THREE.Shape(outer);
    loops.slice(1).forEach((loop) => {
        const hole = loop.map(project);
        if (!THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
        shape.holes.push(new THREE.Path(hole));
    });
    const matrix = new THREE.Matrix4().makeBasis(u, v, normal);
    matrix.setPosition(normal.clone().multiplyScalar(points[0].dot(normal)));
    return { shape, matrix };
}

/** Extend the inset cavity through the opening without shortening adjacent outer walls. */
function openingCutter(opening: ShellOpening, thickness: number) {
    const { shape, matrix } = openingShape(opening);
    const { CrossSection } = getManifold();
    const contours = [shape, ...shape.holes].map((path) => path.getPoints(12).map((point) => [point.x, point.y] as [number, number]));
    const section = new CrossSection(contours);
    let inset: InstanceType<typeof CrossSection> | null = null;
    let extruded: ReturnType<InstanceType<typeof CrossSection>['extrude']> | null = null;
    try {
        inset = section.offset(-thickness, 'Miter', 4, 32);
        if (inset.isEmpty()) throw new Error('壁厚过大，开口面没有可贯通的内部区域');
        extruded = inset.extrude(thickness + 0.02);
        const normal = new THREE.Vector3(...opening.normal).normalize();
        matrix.setPosition(new THREE.Vector3().setFromMatrixPosition(matrix).addScaledVector(normal, -thickness));
        return outputGeometry(extruded.getMesh(0)).applyMatrix4(matrix);
    } finally {
        extruded?.delete();
        inset?.delete();
        section.delete();
    }
}

/** Uniform inward erosion followed by one independent opening cutter per selected face. */
export function evaluateShell(base: THREE.BufferGeometry, openings: ShellOpening[], thickness: number) {
    if (!(thickness > 0) || !Number.isFinite(thickness)) throw new Error('壁厚必须大于 0');
    if (!openings.length) throw new Error('请至少选择一个开口面');
    const { Manifold } = getManifold();
    let solid: InstanceType<typeof Manifold> | null = null;
    let sphere: InstanceType<typeof Manifold> | null = null;
    let cavity: InstanceType<typeof Manifold> | null = null;
    let result: InstanceType<typeof Manifold> | null = null;
    try {
        solid = new Manifold(inputMesh(base));
        if (solid.status() !== 'NoError') throw new Error(`实体无效：${solid.status()}`);
        sphere = Manifold.sphere(thickness, 32);
        cavity = solid.minkowskiDifference(sphere);
        if (cavity.status() !== 'NoError' || cavity.isEmpty()) throw new Error('壁厚过大，实体内部没有可用空间');
        result = solid.subtract(cavity);
        for (const opening of openings) {
            const cutterGeometry = openingCutter(opening, thickness);
            let cutter: InstanceType<typeof Manifold> | null = null;
            let next: InstanceType<typeof Manifold> | null = null;
            try {
                cutter = new Manifold(inputMesh(cutterGeometry));
                if (cutter.status() !== 'NoError') throw new Error(`开口面无法生成切割体：${cutter.status()}`);
                next = result.subtract(cutter);
                result.delete();
                result = next;
                next = null;
            } finally {
                cutterGeometry.dispose();
                cutter?.delete();
                next?.delete();
            }
        }
        if (result.status() !== 'NoError' || result.isEmpty()) throw new Error('抽壳结果为空，请减小壁厚');
        const simplified = result.asOriginal().simplify();
        result.delete();
        result = simplified;
        const shaded = result.calculateNormals(0, 60);
        result.delete();
        result = shaded;
        const geometry = outputGeometry(result.getMesh(0));
        assertValidSolid(geometry, false);
        return geometry;
    } finally {
        result?.delete();
        cavity?.delete();
        sphere?.delete();
        solid?.delete();
    }
}
