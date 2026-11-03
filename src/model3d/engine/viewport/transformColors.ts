import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { AXIS_COLORS } from '../../config/colors';

type Axis = keyof typeof AXIS_COLORS;
type TransformMaterial = THREE.Material & { color?: THREE.Color; _color?: THREE.Color };
type TransformGizmo = { gizmo: Record<string, THREE.Object3D>; helper: Record<string, THREE.Object3D> };

function handleAxis(name: string): Axis | null {
    if (name === 'X' || name === 'YZ') return 'x';
    if (name === 'Y' || name === 'XZ') return 'y';
    if (name === 'Z' || name === 'XY') return 'z';
    return null;
}

/** Recolor every visible transform handle and its per-frame cached color used by TransformControls. */
export function applyTransformControlColors(transform: TransformControls) {
    const control = transform as unknown as { _gizmo: TransformGizmo };
    // Pickers share one invisible material across axes; recolor only visible gizmos and their helper lines.
    [...Object.values(control._gizmo.gizmo), ...Object.values(control._gizmo.helper)].forEach((group) => {
        group.traverse((object) => {
            const axis = handleAxis(object.name);
            if (!axis) return;
            const material = (object as THREE.Mesh).material as TransformMaterial | TransformMaterial[] | undefined;
            if (!material) return;
            (Array.isArray(material) ? material : [material]).forEach((item) => {
                item.color?.set(AXIS_COLORS[axis]);
                // TransformControls restores _color on every update, so changing color alone lasts one frame.
                if (item.color) item._color = item.color.clone();
            });
        });
    });
}
