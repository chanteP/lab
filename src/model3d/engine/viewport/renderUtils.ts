import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SKETCH_COLORS } from '../../config/colors';
import { SKETCH_STYLE } from '../../config/const';

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
