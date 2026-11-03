import { MathUtils, Spherical } from 'three';

/** Advance only the persistent, unsnapped drag orbit; rendered snapping must not reset this state. */
export function advanceGizmoOrbit(spherical: Spherical, dx: number, dy: number) {
    spherical.theta -= dx * 0.009;
    spherical.phi = MathUtils.clamp(spherical.phi - dy * 0.009, 0.015, Math.PI - 0.015);
    return spherical;
}
