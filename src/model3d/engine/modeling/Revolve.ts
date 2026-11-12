import * as THREE from 'three';
import { profileShape } from '../profiles';
import type { ModelDocument, ModelEntity, Point2 } from '../../types';
import { getManifold, outputGeometry } from './ManifoldKernel';
import { assertValidSolid } from './GeometryValidator';

function contours(entity: ModelEntity) {
    if (entity.parts?.length) return entity.parts.filter((part) => part.closed).map((part) => [part.points.map((point) => [...point] as Point2)]);
    const shape = profileShape(entity.profileType || 'polygon', entity.points || [], 64, entity.curves, entity.sides, entity.sectorAngle, entity.open, entity.profileStartAngle, entity.analyticCurves);
    return (Array.isArray(shape) ? shape : [shape]).map((item) => {
        const paths = [item, ...item.holes];
        return paths.map((path) => path.getPoints(12).map((point) => [point.x, point.y] as Point2));
    });
}

/** Revolve semantic sketch coordinates around a sketch-local axis, then map into the owning plane. */
export function evaluateRevolve(profile: ModelEntity, document: ModelDocument, axis: 'x' | 'y', degrees = 360) {
    if (!(Math.abs(degrees) > 0.001 && Math.abs(degrees) <= 360)) throw new Error('车削角度必须在 -360 到 360 之间且不为 0');
    const { CrossSection } = getManifold();
    const section = new CrossSection(contours(profile).flat());
    let oriented: InstanceType<typeof CrossSection> | null = null;
    let mirrored: InstanceType<typeof CrossSection> | null = null;
    let solid: ReturnType<InstanceType<typeof CrossSection>['revolve']> | null = null;
    try {
        // The kernel revolves the positive radial side only; reject ambiguous profiles instead of clipping them.
        const values = contours(profile).flat(2) as number[];
        const coordinates = values.filter((_, index) => index % 2 === (axis === 'x' ? 1 : 0));
        if (Math.min(...coordinates) < 0 && Math.max(...coordinates) > 0) throw new Error('车削轮廓不能跨过旋转轴');
        const negative = Math.max(...coordinates) <= 0;
        if (axis === 'y' && negative) mirrored = section.mirror([0, 1]);
        oriented = axis === 'x' ? section.rotate(negative ? 90 : -90) : mirrored || section;
        solid = oriented.revolve(48, negative ? -degrees : degrees);
        if (solid.status() !== 'NoError' || solid.isEmpty()) throw new Error('车削轮廓无法形成实体');
        const geometry = outputGeometry(solid.getMesh(0));
        if (axis === 'x') geometry.rotateZ((coordinates[0] < 0 ? -1 : 1) * Math.PI / 2);
        const plane = document.planes.find((item) => item.id === profile.planeId);
        if (plane) geometry.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal)).setPosition(new THREE.Vector3(...plane.origin)));
        assertValidSolid(geometry, false);
        return geometry;
    } finally {
        solid?.delete();
        if (oriented !== section && oriented !== mirrored) oriented?.delete();
        mirrored?.delete();
        section.delete();
    }
}
