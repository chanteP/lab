import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { Vec3 } from '../../types';

/** Solve an inward sphere center with equal perpendicular distance to the three source planes. */
export function vertexRoundingCenter(radius: number, corner: Vec3, adjacentNormals: Vec3[]) {
    const normals = adjacentNormals.map((normal) => new THREE.Vector3(...normal).normalize());
    const normalMatrix = new THREE.Matrix3().set(
        normals[0].x, normals[0].y, normals[0].z,
        normals[1].x, normals[1].y, normals[1].z,
        normals[2].x, normals[2].y, normals[2].z,
    );
    if (Math.abs(normalMatrix.determinant()) < 1e-8) throw new Error('圆角角的三个相邻面不能共线');
    return new THREE.Vector3(1, 1, 1).applyMatrix3(normalMatrix.invert()).multiplyScalar(-radius * 2 / 3).add(new THREE.Vector3(...corner));
}

/** The source-plane tetrahedron minus this sphere is the corner cutter. */
export function buildVertexRoundingTools(radius: number, corner: Vec3, adjacentNormals: Vec3[]) {
    const normals = adjacentNormals.map((normal) => new THREE.Vector3(...normal).normalize());
    const sourceCorner = new THREE.Vector3(...corner);
    const center = vertexRoundingCenter(radius, corner, adjacentNormals);
    const relativeCenter = center.clone().sub(sourceCorner);
    const edgePoints = normals.map((_, index) => {
        const j = (index + 1) % 3, k = (index + 2) % 3;
        const direction = normals[j].clone().cross(normals[k]).normalize();
        let axial = relativeCenter.dot(direction);
        if (axial < 0) { direction.negate(); axial = -axial; }
        const perpendicularSquared = Math.max(0, relativeCenter.lengthSq() - axial * axial);
        const distance = axial + Math.sqrt(Math.max(0, radius * radius - perpendicularSquared));
        return sourceCorner.clone().addScaledVector(direction, distance);
    });
    const outerDirection = normals.reduce((sum, normal) => sum.add(normal), new THREE.Vector3()).normalize();
    const outer = sourceCorner.clone().addScaledVector(outerDirection, Math.min(0.1, radius * 0.05));
    const cap = new ConvexGeometry([outer, ...edgePoints]);
    const sphere = new THREE.SphereGeometry(radius, 64, 32).translate(center.x, center.y, center.z);
    return { cap, sphere, center };
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
