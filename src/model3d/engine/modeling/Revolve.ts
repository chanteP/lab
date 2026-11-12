import * as THREE from 'three';
import { profileShape } from '../profiles';
import type { ModelDocument, ModelEntity, Point2, Vec3 } from '../../types';
import { getManifold, inputMesh, outputGeometry } from './ManifoldKernel';
import { assertValidSolid } from './GeometryValidator';

function contourArea(points: Point2[]) {
    return points.reduce((area, point, index) => {
        const next = points[(index + 1) % points.length];
        return area + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2;
}

function normalizeContour(points: Point2[], hole: boolean) {
    const normalized = points.map((point) => [...point] as Point2);
    return (contourArea(normalized) < 0) !== hole ? normalized.reverse() : normalized;
}

function contours(entity: ModelEntity) {
    if (entity.parts?.length) return entity.parts.filter((part) => part.closed).map((part) => [normalizeContour(part.points, false)]);
    const shape = profileShape(entity.profileType || 'polygon', entity.points || [], 64, entity.curves, entity.sides, entity.sectorAngle, entity.open, entity.profileStartAngle, entity.analyticCurves);
    return (Array.isArray(shape) ? shape : [shape]).map((item) => [item, ...item.holes].map((path, index) => normalizeContour(path.getPoints(12).map((point) => [point.x, point.y] as Point2), index > 0)));
}

export interface LocalRevolveAxis { origin: Point2; direction: Point2 }
export interface RevolveAxis { point: Vec3; direction: Vec3; label: string }

/** Revolve a sketch profile around an explicit in-plane axis, optionally adding axial elevation. */
export function evaluateRevolve(profile: ModelEntity, document: ModelDocument, axis: 'x' | 'y' | LocalRevolveAxis, degrees = 360, elevation = 0) {
    if (!(Math.abs(degrees) > 0.001)) throw new Error('车削角度不能为 0');
    const paths = contours(profile).flat();
    const customAxis = typeof axis === 'object' ? axis : null;
    const kernelAxis = customAxis ? 'y' : axis;
    const axisDirection = customAxis ? new THREE.Vector2(...customAxis.direction).normalize() : null;
    let axisRotation = axisDirection ? THREE.MathUtils.radToDeg(Math.atan2(axisDirection.y, axisDirection.x)) : 0;
    let sectionRotation = axisRotation - 90;
    const radialDirection = customAxis ? new THREE.Vector2(-axisDirection!.y, axisDirection!.x) : null;
    if (radialDirection?.x < 0) radialDirection.negate();
    let coordinates = paths.flatMap((path) => path.map((point) => customAxis
        ? (point[0] - customAxis.origin[0]) * radialDirection!.x + (point[1] - customAxis.origin[1]) * radialDirection!.y
        : point[kernelAxis === 'x' ? 1 : 0]));
    const crossing = Math.min(...coordinates) < 0 && Math.max(...coordinates) > 0;
    if (crossing && Math.abs(degrees) !== 360) throw new Error('部分车削轮廓不能跨过旋转轴，请使用 360° 或调整轴向');
    let negative = Math.max(...coordinates) <= 0;
    if (customAxis && negative) {
        axisDirection!.negate();
        axisRotation += 180;
        sectionRotation += 180;
        coordinates = coordinates.map((value) => -value);
        elevation = -elevation;
        negative = false;
    }
    const { CrossSection, Manifold } = getManifold();
    const section = new CrossSection(paths);
    let oriented: InstanceType<typeof CrossSection> | null = null;
    let mirrored: InstanceType<typeof CrossSection> | null = null;
    let result: InstanceType<typeof Manifold> | null = null;
    try {
        let positioned = section;
        if (customAxis && (customAxis.origin[0] || customAxis.origin[1] || sectionRotation)) {
            positioned = section.translate([-customAxis.origin[0], -customAxis.origin[1]]);
            if (sectionRotation) {
                const translated = positioned;
                positioned = translated.rotate(sectionRotation);
                if (positioned !== translated) translated.delete();
            }
        }
        if (kernelAxis === 'y' && negative && !customAxis) mirrored = positioned.mirror([0, 1]);
        oriented = kernelAxis === 'x' ? positioned.rotate(negative ? 90 : -90) : mirrored || positioned;
        if (positioned !== section && positioned !== oriented) positioned.delete();
        let kernelNegative = negative;
        if (crossing) {
            const previous = oriented;
            oriented = oriented.warp((point) => { point[0] = Math.abs(point[0]); });
            if (previous !== section && previous !== mirrored) previous.delete();
            kernelNegative = false;
        }
        const signedDegrees = kernelNegative ? -degrees : degrees;
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
        if (customAxis) {
            // Manifold CrossSection rotates clockwise; Three.js applies the inverse CCW rotation here.
            geometry.rotateZ(THREE.MathUtils.degToRad(-sectionRotation));
            geometry.translate(customAxis.origin[0], customAxis.origin[1], 0);
        } else if (axis === 'x') geometry.rotateZ((coordinates[0] < 0 ? -1 : 1) * Math.PI / 2);
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
