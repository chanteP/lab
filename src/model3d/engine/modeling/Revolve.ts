import * as THREE from 'three';
import { profileShape } from '../profiles';
import type { ModelDocument, ModelEntity, Point2 } from '../../types';
import { getManifold, inputMesh, outputGeometry } from './ManifoldKernel';
import { assertValidSolid } from './GeometryValidator';

function contours(entity: ModelEntity) {
    if (entity.parts?.length) return entity.parts.filter((part) => part.closed).map((part) => [part.points.map((point) => [...point] as Point2)]);
    const shape = profileShape(entity.profileType || 'polygon', entity.points || [], 64, entity.curves, entity.sides, entity.sectorAngle, entity.open, entity.profileStartAngle, entity.analyticCurves);
    return (Array.isArray(shape) ? shape : [shape]).map((item) => [item, ...item.holes].map((path) => path.getPoints(12).map((point) => [point.x, point.y] as Point2)));
}

/** Revolve a sketch profile, optionally translating along its axis to create a helical body. */
export function evaluateRevolve(profile: ModelEntity, document: ModelDocument, axis: 'x' | 'y', degrees = 360, elevation = 0) {
    if (!(Math.abs(degrees) > 0.001)) throw new Error('车削角度不能为 0');
    const paths = contours(profile).flat();
    const coordinates = paths.flatMap((path) => path.map((point) => point[axis === 'x' ? 1 : 0]));
    if (Math.min(...coordinates) < 0 && Math.max(...coordinates) > 0) throw new Error('车削轮廓不能跨过旋转轴');
    const negative = Math.max(...coordinates) <= 0;
    const { CrossSection, Manifold } = getManifold();
    const section = new CrossSection(paths);
    let oriented: InstanceType<typeof CrossSection> | null = null;
    let mirrored: InstanceType<typeof CrossSection> | null = null;
    let result: InstanceType<typeof Manifold> | null = null;
    try {
        if (axis === 'y' && negative) mirrored = section.mirror([0, 1]);
        oriented = axis === 'x' ? section.rotate(negative ? 90 : -90) : mirrored || section;
        const signedDegrees = negative ? -degrees : degrees;
        if (elevation || Math.abs(degrees) > 360) {
            // The kernel clamps angles above one turn; join transformed wedges to preserve every turn and elevation.
            const sign = Math.sign(signedDegrees) || 1;
            for (let covered = 0; covered < Math.abs(signedDegrees); covered += 360) {
                const segmentDegrees = Math.min(360, Math.abs(signedDegrees) - covered) * sign;
                const wedge = oriented.revolve(48, segmentDegrees);
                const geometry = outputGeometry(wedge.getMesh(0));
                wedge.delete();
                const positions = geometry.attributes.position;
                for (let index = 0; index < positions.count; index++) {
                    const theta = Math.atan2(positions.getY(index), positions.getX(index));
                    const segmentRadians = Math.abs(segmentDegrees) * Math.PI / 180;
                    let normalized = (sign > 0 ? theta + Math.PI * 2 : -theta + Math.PI * 2) % (Math.PI * 2);
                    if (normalized < 1e-5 || Math.abs(normalized - Math.PI * 2) < 1e-5) normalized = 0;
                    if (Math.abs(normalized - segmentRadians) < 1e-5) normalized = segmentRadians;
                    const fraction = THREE.MathUtils.clamp(normalized / segmentRadians, 0, 1);
                    positions.setZ(index, positions.getZ(index) + elevation * (covered + Math.abs(segmentDegrees) * fraction) / Math.abs(signedDegrees));
                }
                geometry.rotateZ(covered * sign * Math.PI / 180);
                const part = new Manifold(inputMesh(geometry));
                geometry.dispose();
                const next = result ? result.add(part) : part;
                if (result) { result.delete(); part.delete(); }
                result = next;
            }
        } else result = oriented.revolve(48, signedDegrees);
        if (result.status() !== 'NoError' || result.isEmpty()) throw new Error('车削轮廓无法形成实体');
        const simplified = result.asOriginal().simplify();
        result.delete();
        result = simplified;
        const geometry = outputGeometry(result.getMesh(0));
        if (axis === 'x') geometry.rotateZ((coordinates[0] < 0 ? -1 : 1) * Math.PI / 2);
        const plane = document.planes.find((item) => item.id === profile.planeId);
        if (plane) geometry.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal)).setPosition(new THREE.Vector3(...plane.origin)));
        assertValidSolid(geometry, false);
        return geometry;
    } finally {
        result?.delete();
        if (oriented !== section && oriented !== mirrored) oriented?.delete();
        mirrored?.delete();
        section.delete();
    }
}
