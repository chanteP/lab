import * as THREE from 'three';
import { INTERACTION } from '../../config/const';
import type { ModelDocument, Point2, SketchPlane } from '../../types';
import { matchSketchGuide } from '../sketchGuides';
import type { SketchRenderer } from './SketchRenderer';

export type SketchGuideOptions = {
    edgeStart?: Point2;
    excludeEntityId?: string;
    excludeEntityIds?: string[];
    excludePointIndex?: number;
    disabled?: boolean;
};

interface SketchGuideControllerOptions {
    sketchRenderer: SketchRenderer;
    getDocument: () => ModelDocument | null;
    getActivePlane: () => SketchPlane | null;
    getEditingSketchId: () => string | null;
    getProfileType: () => string;
}

/** Plane-space point projection, reference matching and guide feedback. */
export class SketchGuideController {
    private snapEnabled = true;

    constructor(private readonly options: SketchGuideControllerOptions) {}

    setSnapEnabled(active: boolean) { this.snapEnabled = active; }

    operation(source: Point2 | null, options: SketchGuideOptions = {}) {
        const document = this.options.getDocument(), activePlane = this.options.getActivePlane();
        if (!source || options.disabled || !document || !activePlane) {
            this.options.sketchRenderer.clearReferences();
            return source;
        }
        const editingSketchId = this.options.getEditingSketchId();
        const match = matchSketchGuide({
            entities: document.entities.filter((item) => ['sketch', 'image'].includes(item.kind) && item.planeId === activePlane.id),
            folders: document.folders.filter((item) => item.kind === 'svg' && item.planeId === activePlane.id),
            point: source,
            guides: activePlane.guides || [],
            origins: [
                { id: 'plane', point: [0, 0] },
                { id: 'world', point: (() => {
                    const offset = new THREE.Vector3(...activePlane.origin).negate();
                    return [offset.dot(new THREE.Vector3(...activePlane.u)), offset.dot(new THREE.Vector3(...activePlane.v))];
                })() },
            ],
            edgeStart: options.edgeStart,
            excludeEntityIds: options.excludeEntityIds,
            excludeEntityId: options.excludeEntityId || (!['polygon', 'line', 'arc'].includes(this.options.getProfileType()) ? editingSketchId || undefined : undefined),
            excludePoint: options.excludePointIndex !== undefined && editingSketchId ? { entityId: editingSketchId, index: options.excludePointIndex } : undefined,
            threshold: this.options.sketchRenderer.unitsPerPixel() * INTERACTION.sketchGuideSnapPx,
        });
        if (match) this.options.sketchRenderer.renderReference(match);
        else this.options.sketchRenderer.clearReferences();
        return match && this.snapEnabled ? match.point : source;
    }
}
