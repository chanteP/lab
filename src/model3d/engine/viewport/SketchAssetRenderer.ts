import * as THREE from 'three';
import { SKETCH_COLORS } from '../../config/colors';
import { SKETCH_STYLE } from '../../config/const';
import type { LengthUnit, ModelDocument, Point2, SketchPlane } from '../../types';
import { sketchAssetTarget } from '../sketchAssets';
import type { SketchDimension } from '../Viewport';
import type { OverlayController } from './OverlayController';
import { clearGroup, createFatLine } from './renderUtils';

interface SketchAssetRendererOptions {
    renderer: THREE.WebGLRenderer;
    overlay: OverlayController;
    getCamera: () => THREE.Camera;
    getDocument: () => ModelDocument | null;
    getActivePlane: () => SketchPlane | null;
    getSelectedAssetId: () => string | null;
    getLengthUnit: () => LengthUnit;
    isSketchMode: () => boolean;
}

/** Selected raster/SVG asset outline, viewBox corners and width/height inputs. */
export class SketchAssetRenderer {
    readonly group = new THREE.Group();
    private readonly handles: THREE.Mesh[] = [];

    constructor(private readonly options: SketchAssetRendererOptions) {}

    private world(point: Point2, offset = 0.34) {
        const plane = this.options.getActivePlane();
        if (!plane) return new THREE.Vector3(point[0], offset, point[1]);
        return new THREE.Vector3(...plane.origin)
            .add(new THREE.Vector3(...plane.u).multiplyScalar(point[0]))
            .add(new THREE.Vector3(...plane.v).multiplyScalar(point[1]))
            .add(new THREE.Vector3(...plane.normal).multiplyScalar(offset));
    }

    private unitsPerPixel() {
        const canvas = this.options.renderer.domElement;
        const camera = this.options.getCamera();
        if (camera instanceof THREE.OrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / Math.max(1, canvas.clientHeight);
        return 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2)) / Math.max(1, canvas.clientHeight);
    }

    private angle(a: Point2, b: Point2) {
        const from = this.world(a).project(this.options.getCamera()), to = this.world(b).project(this.options.getCamera());
        let angle = Math.atan2(-(to.y - from.y), to.x - from.x) * 180 / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        return angle;
    }

    private dimension(id: string, position: Point2, target: SketchDimension, value: number, direction: [Point2, Point2]) {
        this.options.overlay.set({
            id: `sketch-asset-dimension:${id}:${target.kind}`,
            kind: 'dimension', position: this.world(position, 0.4).toArray(), target, value,
            unit: this.options.getLengthUnit(), angle: this.angle(...direction),
        });
    }

    update() {
        clearGroup(this.group);
        this.handles.length = 0;
        this.options.overlay.clear('sketch-asset-dimension:');
        const document = this.options.getDocument(), id = this.options.getSelectedAssetId();
        if (!this.options.isSketchMode() || !document || !id) return;
        const asset = sketchAssetTarget(document, id);
        if (!asset) return;
        const corners = asset.corners;
        const canvas = this.options.renderer.domElement;
        const outline = createFatLine(corners.map((point) => this.world(point, 0.3)), canvas.clientWidth, canvas.clientHeight, true);
        outline.renderOrder = 1005;
        this.group.add(outline);
        corners.forEach((point, index) => {
            const outer = new THREE.Mesh(
                new THREE.SphereGeometry(SKETCH_STYLE.markerOuterRadius, 16, 12),
                new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.border, depthTest: false, depthWrite: false }),
            );
            const inner = new THREE.Mesh(
                new THREE.SphereGeometry(SKETCH_STYLE.markerInnerRadius, 16, 12),
                new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.active, depthTest: false, depthWrite: false }),
            );
            outer.position.copy(this.world(point, 0.36));
            inner.position.copy(this.world(point, 0.38));
            outer.userData.screenRadius = { radius: SKETCH_STYLE.markerOuterRadius, pixels: SKETCH_STYLE.markerOuterPx };
            inner.userData.screenRadius = { radius: SKETCH_STYLE.markerInnerRadius, pixels: SKETCH_STYLE.markerInnerPx };
            outer.userData.assetCorner = { id, index };
            inner.userData.assetCorner = { id, index };
            outer.renderOrder = inner.renderOrder = 1007;
            this.handles.push(outer, inner);
            this.group.add(outer, inner);
        });
        const midpoint = (a: Point2, b: Point2): Point2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.dimension(id, midpoint(corners[3], corners[2]), { kind: 'width', assetId: id }, Math.abs(corners[1][0] - corners[0][0]), [corners[3], corners[2]]);
        this.dimension(id, midpoint(corners[1], corners[2]), { kind: 'height', assetId: id }, Math.abs(corners[2][1] - corners[1][1]), [corners[1], corners[2]]);
        this.updateScreenSpaceMarkers();
    }

    markers() { return this.handles; }

    updateScreenSpaceMarkers() {
        this.group.traverse((object) => {
            const data = object.userData.screenRadius as { radius: number; pixels: number } | undefined;
            if (data) object.scale.setScalar(this.unitsPerPixel() * data.pixels / data.radius);
        });
    }

    dispose() {
        clearGroup(this.group);
        this.handles.length = 0;
        this.options.overlay.clear('sketch-asset-dimension:');
    }
}
