import { MathUtils, Quaternion, Spherical, Vector3 } from 'three';

export type GizmoAxis = 'posX' | 'posY' | 'posZ' | 'negX' | 'negY' | 'negZ';

/** Resolve the clicked gizmo ball in the gizmo's world-space orientation. */
export function gizmoAxisDirection(axis: GizmoAxis, orientation = new Quaternion()) {
    const direction = new Vector3(
        axis.endsWith('X') ? (axis.startsWith('neg') ? -1 : 1) : 0,
        axis.endsWith('Y') ? (axis.startsWith('neg') ? -1 : 1) : 0,
        axis.endsWith('Z') ? (axis.startsWith('neg') ? -1 : 1) : 0,
    );
    return direction.applyQuaternion(orientation).normalize();
}

/** Advance only the persistent, unsnapped drag orbit; rendered snapping must not reset this state. */
export function advanceGizmoOrbit(spherical: Spherical, dx: number, dy: number) {
    spherical.theta -= dx * 0.009;
    spherical.phi = MathUtils.clamp(spherical.phi - dy * 0.009, 0.015, Math.PI - 0.015);
    return spherical;
}
