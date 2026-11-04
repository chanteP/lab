import * as THREE from 'three';
import type { ModelDocument, ModelEntity, Vec3 } from '../../types';
import type { SurfaceDomain, TopologicalTriangle } from './types';

const LENGTH_TOLERANCE = 1e-3;
const ANGLE_TOLERANCE = 1e-4;

function vec(value: Vec3) { return new THREE.Vector3(...value); }

export function planesEqual(a: Extract<SurfaceDomain, { kind: 'plane' }>, b: Extract<SurfaceDomain, { kind: 'plane' }>) {
    return vec(a.normal).dot(vec(b.normal)) > 1 - ANGLE_TOLERANCE && Math.abs(a.offset - b.offset) <= LENGTH_TOLERANCE;
}

export function domainsEqual(a: SurfaceDomain, b: SurfaceDomain) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'plane' && b.kind === 'plane') return planesEqual(a, b);
    if (a.kind === 'sphere' && b.kind === 'sphere') return Math.abs(a.radius - b.radius) <= LENGTH_TOLERANCE && vec(a.center).distanceTo(vec(b.center)) <= LENGTH_TOLERANCE;
    if (a.kind === 'cylinder' && b.kind === 'cylinder') {
        const parallel = Math.abs(vec(a.axis).dot(vec(b.axis))) > 1 - ANGLE_TOLERANCE;
        const delta = vec(a.origin).sub(vec(b.origin));
        const perpendicular = delta.addScaledVector(vec(a.axis), -delta.dot(vec(a.axis))).length();
        return parallel && perpendicular <= LENGTH_TOLERANCE && Math.abs(a.radius - b.radius) <= LENGTH_TOLERANCE;
    }
    return a.kind === 'smooth' && b.kind === 'smooth';
}

export function analyticTriangleDomain(
    triangle: TopologicalTriangle,
    vertexPoints: Map<string, THREE.Vector3>,
    entity: ModelEntity,
    document: ModelDocument,
): SurfaceDomain | null {
    if (entity.compositeGeometry) return null;
    const points = triangle.vertexIds.map((id) => vertexPoints.get(id)!);
    const radius = entity.radius || 0;
    if (entity.kind === 'cylinder' && radius > 0 && points.every((point) => Math.abs(Math.hypot(point.x, point.z) - radius) <= LENGTH_TOLERANCE)) {
        return { kind: 'cylinder', axis: [0, 1, 0], origin: [0, 0, 0], radius, analytic: true };
    }
    if (entity.kind === 'sphere' && radius > 0 && points.every((point) => Math.abs(point.length() - radius) <= LENGTH_TOLERANCE)) {
        return { kind: 'sphere', center: [0, 0, 0], radius, analytic: true };
    }

    const profile = entity.profileId ? document.entities.find((item) => item.id === entity.profileId) : entity;
    const plane = profile?.planeId ? document.planes.find((item) => item.id === profile.planeId) : null;
    const ellipse = Object.values(profile?.analyticCurves || {}).find((curve) => curve.kind === 'ellipse');
    if (ellipse && plane) {
        const origin = vec(plane.origin).addScaledVector(vec(plane.u), ellipse.center[0]).addScaledVector(vec(plane.v), ellipse.center[1]);
        const cosine = Math.cos(ellipse.rotation), sine = Math.sin(ellipse.rotation);
        const onEllipse = points.every((point) => {
            const delta = point.clone().sub(origin);
            const x = delta.dot(vec(plane.u)), y = delta.dot(vec(plane.v));
            const localX = x * cosine + y * sine, localY = -x * sine + y * cosine;
            const radius = Math.hypot(localX / ellipse.radiusX, localY / ellipse.radiusY);
            return Math.abs(radius - 1) <= LENGTH_TOLERANCE;
        });
        // A nearly flat ellipse segment is still curved; treating it as a plane creates sliver CSG tools.
        if (onEllipse) return { kind: 'smooth', analytic: false };
    }
    if (profile?.profileType !== 'circle' || !plane || (profile.sectorAngle ?? 360) < 360 || !profile.points?.length) return null;
    const [center2, edge2] = profile.points;
    if (!center2 || !edge2) return null;
    const origin = vec(plane.origin).addScaledVector(vec(plane.u), center2[0]).addScaledVector(vec(plane.v), center2[1]);
    const axis = vec(plane.normal).normalize();
    const circleRadius = Math.hypot(edge2[0] - center2[0], edge2[1] - center2[1]);
    const onCylinder = points.every((point) => {
        const delta = point.clone().sub(origin);
        const radial = delta.addScaledVector(axis, -delta.dot(axis)).length();
        return Math.abs(radial - circleRadius) <= LENGTH_TOLERANCE;
    });
    return onCylinder ? { kind: 'cylinder', axis: axis.toArray(), origin: origin.toArray(), radius: circleRadius, analytic: true } : null;
}
