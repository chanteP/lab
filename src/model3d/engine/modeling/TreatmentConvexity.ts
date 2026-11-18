import * as THREE from 'three';
import type { EdgeTreatment, Vec3 } from '../../types';

/** Use the triangle extending from either source face: its sign against the other outward normal identifies a reentrant edge. */
export function isConcaveEdge(base: THREE.BufferGeometry, treatment: EdgeTreatment) {
    const a = new THREE.Vector3(...treatment.edge.a), b = new THREE.Vector3(...treatment.edge.b);
    const tangent = b.clone().sub(a);
    const length = tangent.length();
    if (length < 1e-7) return false;
    tangent.divideScalar(length);
    if (treatment.edge.normals.length < 2) return false;
    const normals = treatment.edge.normals.slice(0, 2).map((normal) => new THREE.Vector3(...normal).normalize());
    const position = base.attributes.position, index = base.index;
    const tolerance = Math.max(1, length) * 1e-4;
    const triangleCount = (index?.count || position.count) / 3;

    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const points = [0, 1, 2].map((corner) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner));
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
        const normalIndex = normals.findIndex((candidate) => normal.dot(candidate) > 0.999);
        if (normalIndex < 0) continue;
        const onEdge = points.map((point) => {
            const relative = point.clone().sub(a);
            const axial = relative.dot(tangent);
            return axial >= -tolerance && axial <= length + tolerance
                && relative.addScaledVector(tangent, -axial).length() < tolerance;
        });
        if (onEdge.filter(Boolean).length !== 2) continue;
        const outside = points[onEdge.findIndex((value) => !value)].clone().sub(a);
        const side = outside.dot(normals[1 - normalIndex]);
        if (Math.abs(side) > tolerance) return side > 0;
    }
    return false;
}


/** A Boolean step corner may mix concave base edges with a convex upright edge; any concave incident edge needs weld material. */
export function hasConcaveVertexEdge(base: THREE.BufferGeometry, corner: Vec3, adjacentNormals: Vec3[]) {
    const sourceCorner = new THREE.Vector3(...corner);
    const normals = adjacentNormals.slice(0, 3).map((normal) => new THREE.Vector3(...normal).normalize());
    if (normals.length < 3) return false;
    const position = base.attributes.position, index = base.index;
    base.computeBoundingBox();
    const tolerance = Math.max(1, base.boundingBox!.getSize(new THREE.Vector3()).length()) * 1e-5;
    const triangleCount = (index?.count || position.count) / 3;

    for (let first = 0; first < 3; first++) for (let second = first + 1; second < 3; second++) {
        for (let triangle = 0; triangle < triangleCount; triangle++) {
            const points = [0, 1, 2].map((cornerIndex) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(triangle * 3 + cornerIndex) : triangle * 3 + cornerIndex));
            const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
            const normalIndex = [first, second].find((candidate) => normal.dot(normals[candidate]) > 0.999);
            if (normalIndex === undefined || !points.some((point) => point.distanceTo(sourceCorner) < tolerance)) continue;
            const onEdge = points.map((point) => {
                const relative = point.clone().sub(sourceCorner);
                return Math.abs(relative.dot(normals[first])) < tolerance && Math.abs(relative.dot(normals[second])) < tolerance;
            });
            if (onEdge.filter(Boolean).length !== 2) continue;
            const outside = points[onEdge.findIndex((value) => !value)].clone().sub(sourceCorner);
            const otherNormal = normals[first === normalIndex ? second : first];
            if (outside.dot(otherNormal) > tolerance) return true;
        }
    }
    return false;
}
