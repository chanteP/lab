import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OrientationGizmo } from '../OrientationGizmo';
import { GIZMO_COLORS, VIEWPORT_COLORS } from '../../config/colors';
import { INTERACTION } from '../../config/const';
import type { LengthUnit, SketchPlane } from '../../types';
import type { ViewportEngine } from './ViewportEngine';
import { gizmoAxisDirection } from './gizmoOrbit';
import { gridStepForUnitsPerPixel, scaleBarForGrid } from './gridScale';

export type CameraView = 'perspective' | 'front' | 'top' | 'right';
export type ProjectionMode = 'perspective' | 'orthographic';
export type FitAnimation = { started: number; fromPosition: THREE.Vector3; toPosition: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 };
export type CameraTransition = { started: number; fromPosition: THREE.Vector3; toPosition: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; fromQuaternion: THREE.Quaternion; toQuaternion: THREE.Quaternion; fromUp: THREE.Vector3; toUp: THREE.Vector3; fromColor: THREE.Color; toColor: THREE.Color; fromAlpha: number; toAlpha: number };
export type SketchViewState = { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; projection: ProjectionMode; orthoHeight: number; color: THREE.Color; alpha: number };

/** Camera projection, navigation, transitions and scale readout. */
export class CameraController {
    readonly perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    readonly orthographicCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.05, 5000);
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspectiveCamera;
    readonly controls: OrbitControls;
    readonly viewHelper: OrientationGizmo;
    readonly planeGizmo: OrientationGizmo;
    orthoHeight = 200;
    projectionMode: ProjectionMode = 'perspective';
    projectionBeforeSketch: ProjectionMode = 'perspective';
    beforeSketchView: SketchViewState | null = null;
    fitAnimation: FitAnimation | null = null;
    cameraTransition: CameraTransition | null = null;
    readonly clearColor = new THREE.Color(VIEWPORT_COLORS.background);
    clearAlpha = 1;

    private lastScale = '';

    constructor(
        private readonly engine: ViewportEngine,
        private readonly getLengthUnit: () => LengthUnit,
        private readonly onScale: (scale: { width: number; value: number; segments: number; gridSize: number }) => void,
    ) {
        this.perspectiveCamera.position.set(115, 95, 135);
        this.controls = new OrbitControls(this.camera, engine.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 15, 0);
        this.controls.minDistance = 5;
        this.controls.maxDistance = 1400;
        this.controls.zoomToCursor = true;
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        this.controls.update();

        this.viewHelper = new OrientationGizmo(this.camera, engine.renderer.domElement, 12);
        this.viewHelper.setLabels('X', 'Y', 'Z');
        this.viewHelper.setLabelStyle('bold 22px Arial', GIZMO_COLORS.label, 15);
        this.planeGizmo = new OrientationGizmo(this.orthographicCamera, engine.renderer.domElement, 12);
        this.planeGizmo.setLabels('U', 'V', 'N');
        this.planeGizmo.setLabelStyle('bold 22px Arial', GIZMO_COLORS.label, 15);
    }

    get renderer() { return this.engine.renderer; }

    resize() {
        const { width, height } = this.engine.renderer.domElement.parentElement!.getBoundingClientRect();
        if (!width || !height) return;
        if (this.camera instanceof THREE.PerspectiveCamera) this.camera.aspect = width / height;
        else {
            const aspect = width / height;
            this.camera.left = -this.orthoHeight * aspect / 2;
            this.camera.right = this.orthoHeight * aspect / 2;
            this.camera.top = this.orthoHeight / 2;
            this.camera.bottom = -this.orthoHeight / 2;
        }
        this.camera.updateProjectionMatrix();
        this.engine.resize();
    }

    cancelTransitions() {
        this.fitAnimation = null;
        this.cameraTransition = null;
        this.controls.enabled = true;
    }

    setContentRadius(radius: number) {
        // Both projection modes retain 20x full-content framing while allowing close inspection.
        this.controls.minDistance = Math.max(0.05, radius * 0.03);
        this.controls.maxDistance = Math.max(100, radius * 20);
        this.orthographicCamera.minZoom = 0.05;
        this.orthographicCamera.maxZoom = Math.max(20, 100 / radius);
    }

    update(delta: number, onTransitionEnd: () => void) {
        if (this.cameraTransition) {
            const transition = this.cameraTransition;
            const t = Math.min(1, (performance.now() - transition.started) / INTERACTION.cameraTransitionMs);
            const eased = t * t * (3 - 2 * t);
            this.camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
            this.controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
            this.camera.quaternion.slerpQuaternions(transition.fromQuaternion, transition.toQuaternion, eased);
            this.camera.up.lerpVectors(transition.fromUp, transition.toUp, eased).normalize();
            this.clearColor.lerpColors(transition.fromColor, transition.toColor, eased);
            this.clearAlpha = THREE.MathUtils.lerp(transition.fromAlpha, transition.toAlpha, eased);
            this.engine.renderer.setClearColor(this.clearColor, this.clearAlpha);
            if (t === 1) { this.cameraTransition = null; this.controls.enabled = true; onTransitionEnd(); }
        }
        if (this.fitAnimation) {
            const t = Math.min(1, (performance.now() - this.fitAnimation.started) / 420);
            const eased = 1 - Math.pow(1 - t, 3);
            this.camera.position.lerpVectors(this.fitAnimation.fromPosition, this.fitAnimation.toPosition, eased);
            this.controls.target.lerpVectors(this.fitAnimation.fromTarget, this.fitAnimation.toTarget, eased);
            if (t === 1) this.fitAnimation = null;
        }
        this.controls.update();
        if (this.viewHelper.animating) this.viewHelper.update(delta);
        this.updateScaleBar();
    }

    private updateScaleBar() {
        const height = Math.max(1, this.engine.renderer.domElement.clientHeight);
        const distance = this.camera.position.distanceTo(this.controls.target);
        const unitsPerPixel = this.camera instanceof THREE.OrthographicCamera
            ? (this.camera.top - this.camera.bottom) / this.camera.zoom / height
            : 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / height;
        const gridSize = gridStepForUnitsPerPixel(unitsPerPixel);
        this.engine.setGridSize(gridSize);
        const viewportWidth = Math.max(1, this.engine.renderer.domElement.clientWidth);
        this.engine.setGridFade(this.controls.target, unitsPerPixel * viewportWidth / 2);
        const scale = scaleBarForGrid(unitsPerPixel, gridSize);
        const key = `${scale.width}/${scale.value}/${scale.segments}/${gridSize}/${this.getLengthUnit()}`;
        if (key !== this.lastScale) {
            this.lastScale = key;
            this.onScale(scale);
        }
    }

    setProjection(mode: ProjectionMode, transform: TransformControls) {
        const previous = this.camera;
        if (mode === 'orthographic') {
            const distance = previous.position.distanceTo(this.controls.target);
            if (previous instanceof THREE.PerspectiveCamera) this.orthoHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(previous.fov / 2));
            this.orthographicCamera.position.copy(previous.position);
            this.orthographicCamera.quaternion.copy(previous.quaternion);
            this.camera = this.orthographicCamera;
        } else {
            const target = this.controls.target.clone();
            const direction = previous.position.clone().sub(target).normalize();
            const distance = this.orthoHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera.fov / 2)));
            this.perspectiveCamera.position.copy(target).add(direction.multiplyScalar(distance));
            this.perspectiveCamera.quaternion.copy(previous.quaternion);
            this.camera = this.perspectiveCamera;
        }
        this.projectionMode = mode;
        this.controls.object = this.camera;
        transform.camera = this.camera;
        this.viewHelper.camera = this.camera;
        this.planeGizmo.camera = this.camera;
        this.resize();
        this.controls.update();
    }

    startCameraTransition(position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3, projection: ProjectionMode, color: string, alpha: number, transform: TransformControls, orthoHeight?: number) {
        this.setProjection(projection, transform);
        if (orthoHeight !== undefined) { this.orthoHeight = orthoHeight; this.resize(); }
        this.fitAnimation = null;
        const orientationCamera = new THREE.PerspectiveCamera();
        orientationCamera.position.copy(position);
        orientationCamera.up.copy(up);
        orientationCamera.lookAt(target);
        this.cameraTransition = {
            started: performance.now(), fromPosition: this.camera.position.clone(), toPosition: position,
            fromTarget: this.controls.target.clone(), toTarget: target, fromQuaternion: this.camera.quaternion.clone(), toQuaternion: orientationCamera.quaternion.clone(),
            fromUp: this.camera.up.clone(), toUp: up.clone(),
            fromColor: this.clearColor.clone(), toColor: new THREE.Color(color), fromAlpha: this.clearAlpha, toAlpha: alpha,
        };
        this.controls.enabled = false;
    }

    snapGizmoCamera(event: PointerEvent, sketchMode: boolean, plane: SketchPlane | null) {
        const helper = sketchMode ? this.planeGizmo : this.viewHelper;
        const axis = helper.getAxisAt(event);
        if (!axis) return false;
        if (sketchMode && axis.userData.type !== 'posZ') return false;

        const direction = sketchMode && plane ? new THREE.Vector3(...plane.normal).normalize() : gizmoAxisDirection(axis.userData.type, helper.orientation);
        const target = this.controls.target.clone();
        const distance = Math.max(5, this.camera.position.distanceTo(target));
        const position = target.clone().add(direction.clone().multiplyScalar(distance));
        let up = new THREE.Vector3(0, 1, 0);

        if (sketchMode) {
            const v = plane?.v ? new THREE.Vector3(...plane.v).normalize() : new THREE.Vector3(0, 1, 0);
            up = v;
        } else if (Math.abs(direction.y) > 0.9) {
            up.set(0, 0, direction.y > 0 ? -1 : 1);
        }

        const orientationCamera = new THREE.PerspectiveCamera();
        orientationCamera.position.copy(position);
        orientationCamera.up.copy(up);
        orientationCamera.lookAt(target);
        this.fitAnimation = null;
        this.cameraTransition = {
            started: performance.now(), fromPosition: this.camera.position.clone(), toPosition: position,
            fromTarget: this.controls.target.clone(), toTarget: target,
            fromQuaternion: this.camera.quaternion.clone(), toQuaternion: orientationCamera.quaternion.clone(),
            fromUp: this.camera.up.clone(), toUp: up,
            fromColor: this.clearColor.clone(), toColor: this.clearColor.clone(), fromAlpha: this.clearAlpha, toAlpha: this.clearAlpha,
        };
        this.controls.enabled = false;
        return true;
    }

    rotatePlaneView(event: PointerEvent, drag: { x: number; y: number; centerX: number; centerY: number }, plane: SketchPlane | null) {
        if (!plane) return;
        const previousX = drag.x - drag.centerX, previousY = drag.y - drag.centerY;
        const currentX = event.clientX - drag.centerX, currentY = event.clientY - drag.centerY;
        if (Math.hypot(previousX, previousY) < 16 || Math.hypot(currentX, currentY) < 16) return;
        const angle = Math.atan2(previousX * currentY - previousY * currentX, previousX * currentX + previousY * currentY);
        const normal = new THREE.Vector3(...plane.normal).normalize();
        this.camera.up.applyAxisAngle(normal, angle);
        this.camera.lookAt(this.controls.target);
    }

    normalToSketch(plane: SketchPlane | null, transform: TransformControls) {
        if (!plane) return;
        const target = new THREE.Vector3(...plane.origin);
        const direction = new THREE.Vector3(...plane.normal);
        const distance = this.camera.position.distanceTo(target);
        const up = new THREE.Vector3(...plane.v).normalize();
        const position = target.clone().add(direction.multiplyScalar(distance));
        this.startCameraTransition(position, target, up, 'orthographic', VIEWPORT_COLORS.sketchBackground, 0.32, transform);
    }

    setView(view: CameraView) {
        const target = this.controls.target.clone();
        const distance = Math.max(100, this.camera.position.distanceTo(target));
        if (view === 'top') this.camera.position.set(target.x, target.y + distance, target.z + 0.001);
        else if (view === 'front') this.camera.position.set(target.x, target.y, target.z + distance);
        else if (view === 'right') this.camera.position.set(target.x + distance, target.y, target.z);
        else this.camera.position.set(target.x + distance * 0.65, target.y + distance * 0.55, target.z + distance * 0.75);
        this.camera.lookAt(target);
        this.controls.update();
    }

    fitBox(box: THREE.Box3, animate = true) {
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.length() / 2, 5);
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        if (this.camera instanceof THREE.OrthographicCamera) {
            this.orthoHeight = Math.max(10, radius * 2.4);
            this.resize();
        }
        const distance = this.camera instanceof THREE.PerspectiveCamera ? radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.25 : radius * 4;
        const toPosition = center.clone().add(direction.multiplyScalar(distance));
        this.camera.near = Math.max(0.05, radius / 1000);
        this.camera.far = Math.max(5000, radius * 100);
        this.camera.updateProjectionMatrix();
        if (animate) this.fitAnimation = { started: performance.now(), fromPosition: this.camera.position.clone(), toPosition, fromTarget: this.controls.target.clone(), toTarget: center };
        else { this.camera.position.copy(toPosition); this.controls.target.copy(center); this.controls.update(); }
    }

    dispose() {
        this.controls.dispose();
        this.viewHelper.dispose();
        this.planeGizmo.dispose();
    }
}
