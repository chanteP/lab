import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SKETCH_COLORS } from '../../config/colors';
import { SKETCH_STYLE } from '../../config/const';

/** CSG may reverse adjacent winding; absolute dihedral comparison avoids false internal creases. */
export function createDisplayEdgeGeometry(geometry: THREE.BufferGeometry, thresholdDeg = 60) {
    const positions = geometry.attributes.position;
    const index = geometry.index;
    const edges = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; normals: THREE.Vector3[] }>();
    const count = index?.count || positions.count;
    for (let triangle = 0; triangle < count; triangle += 3) {
        const vertices = [0, 1, 2].map((corner) => index ? index.getX(triangle + corner) : triangle + corner);
        const points = vertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(positions, vertex));
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        if (normal.lengthSq() < 1e-12) continue;
        normal.normalize();
        [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
            const key = [points[a].toArray().map((value) => value.toFixed(4)).join(','), points[b].toArray().map((value) => value.toFixed(4)).join(',')].sort().join('|');
            const edge = edges.get(key);
            if (edge) edge.normals.push(normal);
            else edges.set(key, { a: points[a], b: points[b], normals: [normal] });
        });
    }
    const threshold = Math.cos(THREE.MathUtils.degToRad(thresholdDeg));
    const lines: THREE.Vector3[] = [];
    edges.forEach((edge) => {
        const sharp = edge.normals.every((normal, index) => edge.normals.slice(index + 1).every((other) => Math.abs(normal.dot(other)) < threshold));
        if (edge.normals.length > 1 && sharp) lines.push(edge.a, edge.b);
    });
    return new THREE.BufferGeometry().setFromPoints(lines);
}

export function clearGroup(group: THREE.Group) {
    group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
            object.geometry?.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material?.dispose());
        }
    });
    group.clear();
}

export function createFatLine(points: THREE.Vector3[], width: number, height: number, closed = false, segmentIndex?: number) {
    const vertices = closed && points.length > 1 ? [...points, points[0].clone()] : points;
    const geometry = new LineGeometry();
    geometry.setPositions(vertices.flatMap((point) => point.toArray()));
    const material = new LineMaterial({ color: SKETCH_COLORS.edge, linewidth: SKETCH_STYLE.borderWidthPx, depthTest: false });
    material.resolution.set(width, height);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    if (segmentIndex !== undefined) line.userData.segmentIndex = segmentIndex;
    line.renderOrder = 5;
    return line;
}
