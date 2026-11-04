import * as THREE from 'three';
import { computeSketchFaces } from '../sketchFaces';
import { entityProfileClosed } from '../profiles';
import { SKETCH_COLORS } from '../../config/colors';
import type { ModelDocument, SketchPlane } from '../../types';

function planeMatrix(plane: SketchPlane) {
    return new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal)).setPosition(new THREE.Vector3(...plane.origin));
}

/** Viewport-only fills for closed loops assembled from independent open sketch lines. */
export function buildSketchRegionPreviews(document: ModelDocument) {
    const open = document.entities.filter((entity) => entity.kind === 'sketch' && entity.visible && !entityProfileClosed(entity));
    const planeIds = new Set(open.map((entity) => entity.planeId).filter(Boolean));
    const previews: THREE.Mesh[] = [];
    planeIds.forEach((planeId) => {
        const plane = document.planes.find((item) => item.id === planeId && item.visible);
        if (!plane) return;
        const entities = open.filter((entity) => entity.planeId === planeId);
        computeSketchFaces(entities, planeId!).forEach((face) => {
            const shape = new THREE.Shape(face.points.map(([x, y]) => new THREE.Vector2(x, y)));
            const geometry = new THREE.ShapeGeometry(shape);
            geometry.applyMatrix4(planeMatrix(plane));
            const material = new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.fill, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
            material.userData.sketchBaseColor = material.color.getHex();
            material.userData.sketchBaseOpacity = material.opacity;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.entityId = entities[0].id;
            mesh.userData.regionProfile = true;
            mesh.userData.regionEntityIds = entities.map((entity) => entity.id);
            mesh.userData.profilePoints = face.points.map((point) => [...point]);
            previews.push(mesh);
        });
    });
    return previews;
}
