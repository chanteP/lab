import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { OrientationGizmo } from './OrientationGizmo';
import { buildScene } from './geometry';
import { entityProfileClosed, profileArcCenter, profileClosed, profilePoints, type ProfileType, type ProfileCurves } from './profiles';
import { SKETCH_COLORS } from './colors';
import { borderInterval, borderSegments, sliceBorder } from './sketchBorders';
import type { LengthUnit, ModelDocument, Point2, SketchPlane, Vec3 } from './types';

export type ViewTool = 'select' | 'translate' | 'rotate' | 'scale' | 'offsetFace' | 'extrude' | 'fillet' | 'chamfer';
export type CameraView = 'perspective' | 'front' | 'top' | 'right';
export type EditPhase = 'start' | 'move' | 'end';
export type SketchDimension = { kind: 'segment' | 'control' | 'width' | 'height' | 'radius' | 'radiusX' | 'radiusY' | 'regularRadius' | 'arcRadius' | 'angle'; index?: number; handle?: 1 | 2 };
type GeometryAnchor = { id: string; normal: Vec3; localNormal: Vec3; point: Vec3; type: 'face' | 'edge'; vertices: Vec3[]; indices: number[] };

interface ViewportCallbacks {
    onSelect: (id: string | null, additive: boolean) => void;
    onGeometrySelect: (id: string, type: 'face' | 'edge', normal: Vec3, point: Vec3, additive?: boolean) => void;
    onBodySelect: (id: string) => void;
    onPlaneSelect: (id: string) => void;
    onPlaneTransform: (id: string, position: Vec3, quaternion: THREE.Quaternion) => void;
    onTransform: (id: string, position: Vec3, rotation: Vec3, scale: Vec3) => void;
    onTransformEnd: () => void;
    onDirectEdit: (id: string, normal: Vec3, delta: number, phase: EditPhase) => void;
    onSketchPoint: (point: Point2) => void;
    onSketchPointMove: (index: number, point: Point2, phase: EditPhase) => void;
    onSketchSegment: (index: number, additive: boolean) => void;
    onSketchHandleMove: (segment: number, handle: 1 | 2, point: Point2, phase: EditPhase) => void;
    onSketchDrag: (start: Point2, point: Point2, phase: EditPhase) => void;
    onSketchSelect: (index: number) => void;
    onSketchComplete: () => void;
    onSketchEntitySelect: (id: string) => void;
    onSketchContext: (id: string | null, x: number, y: number) => void;
    onSketchCancelSelection: () => void;
    onSketchCenterMove: (point: Point2, phase: EditPhase) => void;
    onSketchPointDelete: (index: number) => void;
    onSketchBorderDelete: (entityId: string, index: number, start: number, end: number) => void;
    onSketchSectorMove: (point: Point2, phase: EditPhase) => void;
    onSketchSectorReset: () => void;
    onSketchDimension: (target: SketchDimension, value: number) => void;
    onLengthUnitChange: (unit: LengthUnit) => void;
    onExtrudeGesture: (profileId: string, direction: 1 | -1, delta: number, phase: EditPhase) => void;
    onBlankCommit: () => void;
    onExtrudeDimension: () => void;
    onMarqueeSelect: (ids: string[], additive: boolean) => void;
    onHoverSketch: (id: string, normal: Vec3, point: Vec3) => void;
    onViewportContext: (id: string | null, x: number, y: number) => void;
    onSpaceChange: (active: boolean) => void;
    onMeasureChange: (active: boolean) => void;
    onScale: (scale: { width: number; label: string }) => void;
    onStats: (stats: { vertices: number; triangles: number; objects: number }) => void;
}

export class Viewport {
    private container: HTMLElement;
    private callbacks: ViewportCallbacks;
    private scene = new THREE.Scene();
    private perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    private orthographicCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.05, 5000);
    private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspectiveCamera;
    private orthoHeight = 200;
    private renderer: THREE.WebGLRenderer;
    private labelRenderer: CSS2DRenderer;
    private controls: OrbitControls;
    private transform: TransformControls;
    private viewHelper: OrientationGizmo;
    private planeGizmo: OrientationGizmo;
    private clock = new THREE.Clock();
    private model = new THREE.Group();
    private sketch = new THREE.Group();
    private planes = new THREE.Group();
    private measurements = new THREE.Group();
    private guides = new THREE.Group();
    private faceFeedback = new THREE.Group();
    private trimFeedback = new THREE.Group();
    private booleanRoles: { target: string; tool: string } | null = null;
    private grid: THREE.GridHelper;
    private shadow: THREE.Mesh;
    private sun: THREE.DirectionalLight;
    private raycaster = new THREE.Raycaster();
    private pointer = new THREE.Vector2();
    private pointerStart = new THREE.Vector2();
    private selected: string[] = [];
    private tool: ViewTool = 'select';
    private sketchMode = false;
    private activePlane: SketchPlane | null = null;
    private selectedSketchPoint = -1;
    private activeSketchSegment = -1;
    private sketchDrag: { index: number; handle?: 1 | 2; sector?: boolean; center?: boolean } | null = null;
    private shapeDrag: { start: Point2; moved: boolean } | null = null;
    private viewRotateDrag: { x: number; startX: number; moved: boolean } | null = null;
    private sketchSegmentHandled = false;
    private sketchProfileType: ProfileType = 'polygon';
    private sketchSelectionGuardUntil = 0;
    private sketchSelectionGuardPointerUp = false;
    private spaceSketchPointerBlocked = false;
    private sketchHoverSegment = -1;
    private altDeletePoint = -1;
    private altBorderDelete: { entityId: string; index: number; start: number; end: number } | null = null;
    private projectionMode: 'perspective' | 'orthographic' = 'perspective';
    private projectionBeforeSketch: 'perspective' | 'orthographic' = 'perspective';
    private directDrag: { id: string; normal: Vec3; worldNormal: Vec3; x: number; y: number } | null = null;
    private extrudeArrowDrag: { profileId: string; direction: 1 | -1; worldNormal: Vec3; x: number; y: number } | null = null;
    private activeArrowKey: string | null = null;
    private hoverArrowKey: string | null = null;
    private editingSketchId: string | null = null;
    private sketchHoverId: string | null = null;
    private gizmoDrag: { x: number; y: number; moved: boolean } | null = null;
    private measureMode = false;
    private measurePoints: THREE.Vector3[] = [];
    private hoverFace: THREE.Mesh | null = null;
    private hoverGeometry: { id: string; normal: Vec3; point: Vec3 } | null = null;
    private marquee: { startX: number; startY: number; x: number; y: number; additive: boolean; moved: boolean } | null = null;
    private selectionRectangle: HTMLDivElement;
    private displayMode: 'shaded' | 'wireframe' | 'xray' = 'shaded';
    private showEdges = true;
    private sectionPlane: THREE.Plane | null = null;
    private isolateIds: Set<string> | null = null;
    private document: ModelDocument | null = null;
    private geometryAnchor: GeometryAnchor | null = null;
    private hoverFaceAnchor: GeometryAnchor | null = null;
    private surfaceCache = new Map<string, { vertices: Vec3[]; indices: number[]; point: Vec3 }>();
    private fitAnimation: null | { started: number; fromPosition: THREE.Vector3; toPosition: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } = null;
    private lastScale = '';
    private spacePressed = false;
    private spaceDragMoved = false;
    private spaceHover: { id: string; normal: Vec3; point: Vec3 } | null = null;
    private frame = 0;
    private resizeObserver: ResizeObserver;
    private disposers: (() => void)[] = [];

    constructor(container: HTMLElement, callbacks: ViewportCallbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.scene.background = new THREE.Color('#e7ebe8');
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.localClippingEnabled = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.9;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.autoClear = false;
        container.appendChild(this.renderer.domElement);
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.domElement.className = 'measure-label-layer';
        container.appendChild(this.labelRenderer.domElement);

        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const room = new RoomEnvironment();
        this.scene.environment = pmrem.fromScene(room, 0.04).texture;
        room.dispose();
        pmrem.dispose();

        this.perspectiveCamera.position.set(115, 95, 135);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
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
        this.selectionRectangle = window.document.createElement('div');
        this.selectionRectangle.className = 'selection-rectangle';
        this.selectionRectangle.style.display = 'none';
        container.appendChild(this.selectionRectangle);

        this.transform = new TransformControls(this.camera, this.renderer.domElement);
        this.transform.setSize(0.78);
        this.scene.add(this.transform.getHelper());
        this.transform.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
            if (!event.value) this.callbacks.onTransformEnd();
        });
        this.transform.addEventListener('objectChange', () => {
            const object = this.transform.object;
            const planeId = object?.userData.planeId;
            if (object && planeId) {
                this.callbacks.onPlaneTransform(planeId, object.position.toArray(), object.quaternion.clone());
                return;
            }
            const id = object?.userData.entityId;
            if (!object || !id) return;
            this.callbacks.onTransform(id, object.position.toArray(),
                [object.rotation.x, object.rotation.y, object.rotation.z].map(THREE.MathUtils.radToDeg) as Vec3, object.scale.toArray());
        });
        this.viewHelper = new OrientationGizmo(this.camera, this.renderer.domElement, 12);
        this.viewHelper.setLabels('X', 'Y', 'Z');
        this.viewHelper.setLabelStyle('bold 22px Arial', '#ffffff', 15);
        this.planeGizmo = new OrientationGizmo(this.orthographicCamera, this.renderer.domElement, 12);
        this.planeGizmo.setLabels('U', 'V', 'N');
        this.planeGizmo.setLabelStyle('bold 22px Arial', '#ffffff', 15);

        this.scene.add(this.model, this.sketch, this.planes, this.measurements, this.guides, this.faceFeedback, this.trimFeedback);
        this.grid = new THREE.GridHelper(1000, 100, '#a6b0aa', '#cbd2cd');
        this.grid.position.y = -0.02;
        (this.grid.material as THREE.Material).transparent = true;
        (this.grid.material as THREE.Material).opacity = 0.65;
        this.scene.add(this.grid);
        this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.ShadowMaterial({ opacity: 0.16 }));
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.y = -0.04;
        this.shadow.receiveShadow = true;
        this.shadow.visible = false;
        this.scene.add(this.shadow);
        this.scene.add(new THREE.HemisphereLight('#ffffff', '#829087', 1.25));
        this.sun = new THREE.DirectionalLight('#ffffff', 2.1);
        this.sun.position.set(90, 160, 100);
        this.sun.castShadow = false;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180 });
        this.sun.shadow.bias = -0.0002;
        this.scene.add(this.sun);
        const fill = new THREE.DirectionalLight('#d6e8ff', 0.65);
        fill.position.set(-100, 60, -80);
        this.scene.add(fill);

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown, true);
        canvas.addEventListener('pointermove', this.onPointerMove, true);
        canvas.addEventListener('pointerup', this.onPointerUp, true);
        canvas.addEventListener('pointercancel', this.onPointerUp, true);
        canvas.addEventListener('pointerleave', () => { this.clearHoverFace(); this.hoverFaceAnchor = null; this.refreshFaceFeedback(); });
        canvas.addEventListener('dblclick', this.onDoubleClick);
        canvas.addEventListener('contextmenu', this.onContextMenu);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onKeyUp);
        this.disposers.push(() => {
            canvas.removeEventListener('pointerdown', this.onPointerDown, true);
            canvas.removeEventListener('pointermove', this.onPointerMove, true);
            canvas.removeEventListener('pointerup', this.onPointerUp, true);
            canvas.removeEventListener('pointercancel', this.onPointerUp, true);
            canvas.removeEventListener('dblclick', this.onDoubleClick);
            canvas.removeEventListener('contextmenu', this.onContextMenu);
            window.removeEventListener('keydown', this.onKeyDown);
            window.removeEventListener('keyup', this.onKeyUp);
            window.removeEventListener('blur', this.onKeyUp);
        });
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.resize();
        this.animate();
    }

    private isTypingTarget(target: EventTarget | null) {
        const element = target as HTMLElement;
        return !!element && ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
    }
    private onKeyDown(event: KeyboardEvent) {
        if (event.code !== 'Space' || this.isTypingTarget(event.target)) return;
        event.preventDefault();
        if (!this.spacePressed) {
            this.spacePressed = true;
            this.shapeDrag = null;
            this.sketchDrag = null;
            this.container.classList.remove('is-handle-dragging');
            this.spaceDragMoved = false;
            this.spaceHover = this.hoverGeometry;
            this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            this.container.classList.add('is-panning');
            this.callbacks.onSpaceChange(true);
        }
    }
    private onKeyUp(event?: KeyboardEvent) {
        if (event && event.code && event.code !== 'Space') return;
        if (event?.type === 'keyup' && !this.spaceDragMoved && this.spaceHover && !this.sketchMode && !this.measureMode) this.callbacks.onHoverSketch(this.spaceHover.id, this.spaceHover.normal, this.spaceHover.point);
        this.spacePressed = false;
        this.spaceDragMoved = false;
        this.spaceHover = null;
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.container.classList.remove('is-panning');
        this.callbacks.onSpaceChange(false);
    }
    private updateOrbitRotation() {
        this.controls.enableRotate = ['select', 'offsetFace', 'fillet', 'chamfer', 'extrude'].includes(this.tool) && !this.sketchMode && !this.measureMode;
    }
    private onContextMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        if (this.sketchMode) return;
        if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) return;
        const hit = this.hitEntity(event as unknown as PointerEvent);
        this.callbacks.onViewportContext(hit?.object.userData.entityId || null, event.clientX, event.clientY);
    }
    private setPointer(event: PointerEvent | MouseEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
    }
    private hitPlane(event: PointerEvent) {
        this.setPointer(event);
        const hit = this.raycaster.intersectObjects(this.planes.children, true).find((item) => this.isVisible(item.object));
        if (!hit) return null;
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.planeId) object = object.parent;
        return object ? { id: object.userData.planeId as string, distance: hit.distance } : null;
    }
    private hitEntity(event: PointerEvent) {
        this.setPointer(event);
        return this.raycaster.intersectObjects(this.model.children, false).find((item) => this.isVisible(item.object));
    }
    private hitSketchEntity(event: PointerEvent) {
        const hit = this.hitEntity(event);
        if (!hit || !this.document) return null;
        const entity = this.document.entities.find((item) => item.id === hit.object.userData.entityId && item.kind === 'sketch');
        if (!entity || entity.id === this.editingSketchId || (this.activePlane && entity.planeId !== this.activePlane.id)) return null;
        return entity.id;
    }
    private hitExtrudeArrow(event: PointerEvent) {
        this.setPointer(event);
        const hit = this.raycaster.intersectObjects(this.guides.children, true).find((item) => item.object.userData.extrudeArrow);
        this.activeArrowKey = hit?.object.userData.arrowKey || null;
        this.updateArrowColors();
        return hit?.object.userData.extrudeArrow as { profileId: string; direction: 1 | -1 } | undefined;
    }
    private hitDirectArrow(event: PointerEvent) {
        this.setPointer(event);
        const hit = this.raycaster.intersectObjects(this.guides.children, true).find((item) => item.object.userData.directArrow);
        this.activeArrowKey = hit?.object.userData.arrowKey || null;
        this.updateArrowColors();
        return hit?.object.userData.directArrow as { id: string; normal?: Vec3 } | undefined;
    }
    private updateArrowHover(event: PointerEvent) {
        this.setPointer(event);
        const hit = this.raycaster.intersectObjects(this.guides.children, true).find((item) => item.object.userData.directArrow || item.object.userData.extrudeArrow);
        this.hoverArrowKey = hit?.object.userData.arrowKey || null;
        this.container.classList.toggle('is-arrow-hover', !!hit);
        this.updateArrowColors();
    }
    private updateArrowColors() {
        this.guides.children.forEach((group) => {
            const active = group.userData.arrowKey && (group.userData.arrowKey === this.activeArrowKey || group.userData.arrowKey === this.hoverArrowKey);
            group.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                const material = object.material as THREE.MeshBasicMaterial;
                if (material.color) material.color.set(active ? SKETCH_COLORS.hoverLine : SKETCH_COLORS.arrow);
            });
        });
    }
    private isVisible(object: THREE.Object3D) {
        let current: THREE.Object3D | null = object;
        while (current && current !== this.scene) {
            if (!current.visible) return false;
            current = current.parent;
        }
        return true;
    }
    private isGizmoEvent(event: PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        return event.clientX >= rect.right - 128 && event.clientY >= rect.bottom - 170 && event.clientY <= rect.bottom - 12;
    }

    // Sketch coordinates are local to the chosen plane; world hit points never become sketch source data.
    private sketchPoint(event: PointerEvent): Point2 | null {
        if (!this.activePlane) return null;
        this.setPointer(event);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...this.activePlane.normal), new THREE.Vector3(...this.activePlane.origin));
        const point = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(plane, point)) return null;
        point.sub(new THREE.Vector3(...this.activePlane.origin));
        return [Math.round(point.dot(new THREE.Vector3(...this.activePlane.u)) * 10) / 10,
            Math.round(point.dot(new THREE.Vector3(...this.activePlane.v)) * 10) / 10];
    }
    private sketchWorld([u, v]: Point2, offset = 0.12) {
        if (!this.activePlane) return new THREE.Vector3(u, offset, v);
        return new THREE.Vector3(...this.activePlane.origin)
            .add(new THREE.Vector3(...this.activePlane.u).multiplyScalar(u))
            .add(new THREE.Vector3(...this.activePlane.v).multiplyScalar(v))
            .add(new THREE.Vector3(...this.activePlane.normal).multiplyScalar(offset));
    }

    private capturePointer(event: PointerEvent) {
        try { this.renderer.domElement.setPointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
    }
    private releasePointer(event: PointerEvent) {
        try { if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* No active capture. */ }
    }

    private onPointerDown(event: PointerEvent) {
        this.fitAnimation = null;
        this.pointerStart.set(event.clientX, event.clientY);
        this.raycaster.params.Line.threshold = 1.5;
        if (event.button === 2 && !this.sketchMode) this.controls.mouseButtons.RIGHT = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        if (this.sketchMode && event.button === 2) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.viewRotateDrag = { x: event.clientX, startX: event.clientX, moved: false };
            this.controls.enabled = false;
            this.capturePointer(event);
            return;
        }
        if (event.button !== 0) return;
        if (this.isGizmoEvent(event)) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.gizmoDrag = { x: event.clientX, y: event.clientY, moved: false };
            this.capturePointer(event);
            this.controls.enabled = false;
            return;
        }
        if (!this.sketchMode && this.tool === 'select') {
            const arrow = this.hitExtrudeArrow(event);
            if (arrow) {
                event.preventDefault(); event.stopImmediatePropagation();
                const profile = this.document?.entities.find((item) => item.id === arrow.profileId);
                const plane = this.document?.planes.find((item) => item.id === profile?.planeId);
                const worldNormal = plane ? new THREE.Vector3(...plane.normal).multiplyScalar(arrow.direction).toArray() as Vec3 : [0, arrow.direction, 0] as Vec3;
                this.extrudeArrowDrag = { profileId: arrow.profileId, direction: arrow.direction, worldNormal, x: event.clientX, y: event.clientY };
                this.capturePointer(event);
                this.controls.enabled = false;
                this.container.classList.add('is-handle-dragging');
                this.callbacks.onExtrudeGesture(arrow.profileId, arrow.direction, 0, 'start');
                return;
            }
        }
        if (this.measureMode) { this.controls.enableRotate = false; return; }
        if (this.sketchMode) {
            if (performance.now() < this.sketchSelectionGuardUntil) { this.sketchSelectionGuardPointerUp = true; event.preventDefault(); event.stopImmediatePropagation(); return; }
            if (this.spacePressed) { this.spaceSketchPointerBlocked = true; return; }
            this.sketchSegmentHandled = false;
            this.setPointer(event);
            const markers = this.sketchMarkers();
            const hit = this.raycaster.intersectObjects(markers, false)[0];
            if (hit) {
                event.preventDefault(); event.stopImmediatePropagation();
                const handle = hit.object.userData.handleSegment !== undefined;
                const sector = !!hit.object.userData.sectorHandle;
                const center = !!hit.object.userData.centerHandle;
                const index = handle ? hit.object.userData.handleSegment : sector || center ? -1 : hit.object.userData.pointIndex;
                if (event.altKey && this.sketchProfileType === 'polygon' && !handle && !sector && !center && index >= 0) {
                    this.sketchSelectionGuardPointerUp = true;
                    this.sketchSelectionGuardUntil = performance.now() + 300;
                    this.callbacks.onSketchPointDelete(index);
                    this.altDeletePoint = -1;
                    this.container.classList.remove('is-delete-point');
                    return;
                }
                this.sketchDrag = center ? { index, center: true } : sector ? { index, sector: true } : handle ? { index, handle: hit.object.userData.handleIndex } : { index };
                this.container.classList.add('is-handle-dragging');
                if (center) this.callbacks.onSketchCenterMove(this.sketchPoint(event)!, 'start');
                else if (sector) this.callbacks.onSketchSectorMove(this.sketchPoint(event)!, 'start');
                else if (!handle) {
                    this.selectedSketchPoint = index;
                    this.callbacks.onSketchSelect(index);
                    this.callbacks.onSketchPointMove(index, this.sketchPoint(event)!, 'start');
                } else this.callbacks.onSketchHandleMove(index, hit.object.userData.handleIndex, this.sketchPoint(event)!, 'start');
                this.controls.enabled = false;
                this.capturePointer(event);
                this.updateMarkerColors();
                return;
            }
            if (event.altKey) {
                this.updateSketchCursor(event);
                if (this.altBorderDelete) {
                    event.preventDefault(); event.stopImmediatePropagation();
                    const target = this.altBorderDelete;
                    this.sketchSelectionGuardPointerUp = true;
                    this.sketchSelectionGuardUntil = performance.now() + 300;
                    this.callbacks.onSketchBorderDelete(target.entityId, target.index, target.start, target.end);
                    this.clearAltBorder();
                    this.container.classList.remove('is-delete-point');
                    return;
                }
            }
            const segmentHit = this.raycaster.intersectObjects(this.sketch.children.filter((item) => item.userData.segmentIndex !== undefined), false)[0];
            if (segmentHit) {
                event.preventDefault(); event.stopImmediatePropagation();
                this.sketchSegmentHandled = true;
                this.callbacks.onSketchSegment(segmentHit.object.userData.segmentIndex, event.shiftKey || event.metaKey || event.ctrlKey);
                return;
            }
            const sketchEntity = this.hitSketchEntity(event);
            if (sketchEntity) {
                event.preventDefault(); event.stopImmediatePropagation();
                this.sketchSelectionGuardUntil = performance.now() + 300;
                this.sketchSelectionGuardPointerUp = true;
                this.shapeDrag = null;
                this.sketchDrag = null;
                this.callbacks.onSketchEntitySelect(sketchEntity);
                return;
            }
            const start = this.sketchPoint(event);
            if (start) { this.shapeDrag = { start, moved: false }; this.capturePointer(event); }
            return;
        }
        if (['offsetFace', 'extrude', 'fillet', 'chamfer'].includes(this.tool)) {
            const arrow = this.hitDirectArrow(event);
            const normal = arrow?.normal || this.geometryAnchor?.localNormal;
            if (arrow && normal) {
                event.preventDefault(); event.stopImmediatePropagation();
                this.directDrag = { id: arrow.id, normal, worldNormal: this.geometryAnchor?.normal || normal, x: event.clientX, y: event.clientY };
                this.capturePointer(event);
                this.controls.enabled = false;
                this.container.classList.add('is-handle-dragging');
                this.callbacks.onDirectEdit(arrow.id, this.directDrag.normal, 0, 'start');
                return;
            }
        }
        const hit = this.hitEntity(event);
        if ((event.metaKey || event.ctrlKey) && !this.spacePressed && this.tool === 'select' && !this.measureMode) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.marquee = { startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, additive: event.shiftKey || event.metaKey || event.ctrlKey, moved: false };
            this.controls.enabled = false;
            this.capturePointer(event);
            return;
        }
        if (hit && ['translate', 'rotate', 'scale'].includes(this.tool)) this.controls.enableRotate = false;
    }

    private snapPlaneCamera(force = false) {
        if (!this.activePlane) return;
        const u = new THREE.Vector3(...this.activePlane.u).normalize();
        const v = new THREE.Vector3(...this.activePlane.v).normalize();
        const normal = new THREE.Vector3(...this.activePlane.normal).normalize();
        const target = new THREE.Vector3(...this.activePlane.origin);
        const offset = this.camera.position.clone().sub(target);
        const radius = offset.length();
        const direction = offset.normalize();
        const axes = [u, u.clone().negate(), v, v.clone().negate(), normal, normal.clone().negate()];
        let best = normal;
        let bestDot = -1;
        axes.forEach((axis) => { const dot = direction.dot(axis); if (dot > bestDot) { bestDot = dot; best = axis; } });
        if (!force && bestDot < 0.975) return;
        const currentUp = this.camera.up.clone();
        const up = [v, v.clone().negate(), u, u.clone().negate(), normal, normal.clone().negate()]
            .filter((axis) => Math.abs(axis.dot(best)) < 0.9)
            .sort((a, b) => b.dot(currentUp) - a.dot(currentUp))[0] || v;
        this.camera.up.copy(up);
        this.camera.position.copy(target).add(best.multiplyScalar(radius));
        this.camera.lookAt(target);
        this.controls.target.copy(target);
        this.controls.update();
    }
    private rotatePlaneView(dx: number, dy: number) {
        if (!this.activePlane) return;
        const target = new THREE.Vector3(...this.activePlane.origin);
        const offset = this.camera.position.clone().sub(target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta -= dx * 0.009;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.009, 0.015, Math.PI - 0.015);
        this.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
        this.camera.lookAt(target);
        this.controls.target.copy(target);
        this.snapPlaneCamera();
    }
    private onPointerMove(event: PointerEvent) {
        if (this.spacePressed && event.buttons === 1) this.spaceDragMoved = true;
        if (this.sketchMode && this.spacePressed) return;
        if (this.sketchMode && performance.now() < this.sketchSelectionGuardUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (this.marquee) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.marquee.x = event.clientX;
            this.marquee.y = event.clientY;
            this.marquee.moved = this.marquee.moved || Math.hypot(event.clientX - this.marquee.startX, event.clientY - this.marquee.startY) > 5;
            this.updateSelectionRectangle();
            return;
        }
        if (this.viewRotateDrag && this.activePlane) {
            event.preventDefault(); event.stopImmediatePropagation();
            const angle = (event.clientX - this.viewRotateDrag.x) * 0.006;
            this.viewRotateDrag.moved ||= Math.abs(event.clientX - this.viewRotateDrag.startX) > 4;
            const normal = new THREE.Vector3(...this.activePlane.normal).normalize();
            const offset = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(normal, angle);
            this.camera.up.applyAxisAngle(normal, angle);
            this.camera.position.copy(this.controls.target).add(offset);
            this.camera.lookAt(this.controls.target);
            this.viewRotateDrag.x = event.clientX;
            return;
        }
        if (this.gizmoDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const dx = event.clientX - this.gizmoDrag.x;
            const dy = event.clientY - this.gizmoDrag.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) this.gizmoDrag.moved = true;
            if (this.sketchMode) {
                this.rotatePlaneView(dx, dy);
                this.gizmoDrag = { x: event.clientX, y: event.clientY, moved: true };
                return;
            }
            const offset = this.camera.position.clone().sub(this.controls.target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            spherical.theta -= dx * 0.009;
            spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.009, 0.015, Math.PI - 0.015);
            this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
            this.camera.lookAt(this.controls.target);
            this.viewHelper.center.copy(this.controls.target);
            this.viewHelper.snap();
            this.gizmoDrag = { x: event.clientX, y: event.clientY, moved: true };
            return;
        }
        if (this.sketchMode && performance.now() < this.sketchSelectionGuardUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (this.sketchDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const point = this.sketchPoint(event);
            if (point) this.sketchDrag.center ? this.callbacks.onSketchCenterMove(point, 'move') : this.sketchDrag.sector ? this.callbacks.onSketchSectorMove(point, 'move') : this.sketchDrag.handle ? this.callbacks.onSketchHandleMove(this.sketchDrag.index, this.sketchDrag.handle, point, 'move') : this.callbacks.onSketchPointMove(this.sketchDrag.index, point, 'move');
            return;
        }
        if (this.extrudeArrowDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const scale = Math.max(0.025, this.camera.position.distanceTo(this.controls.target) * 0.002);
            const profileObject = this.model.children.find((item) => item.userData.entityId === this.extrudeArrowDrag!.profileId);
            const origin = profileObject ? new THREE.Box3().setFromObject(profileObject).getCenter(new THREE.Vector3()) : this.controls.target.clone();
            const from = origin.clone().project(this.camera);
            const to = origin.clone().add(new THREE.Vector3(...this.extrudeArrowDrag.worldNormal)).project(this.camera);
            const direction = new THREE.Vector2(to.x - from.x, -(to.y - from.y));
            if (direction.lengthSq() < 0.000001) direction.set(0, -1);
            direction.normalize();
            const delta = ((event.clientX - this.extrudeArrowDrag.x) * direction.x + (event.clientY - this.extrudeArrowDrag.y) * direction.y) * scale;
            if (Math.hypot(event.clientX - this.extrudeArrowDrag.x, event.clientY - this.extrudeArrowDrag.y) > 2) this.callbacks.onExtrudeGesture(this.extrudeArrowDrag.profileId, this.extrudeArrowDrag.direction, Math.max(0.1, delta), 'move');
            return;
        }
        if (this.shapeDrag && this.sketchMode) {
            const point = this.sketchPoint(event);
            if (point && this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) {
                this.shapeDrag.moved = true;
                this.callbacks.onSketchDrag(this.shapeDrag.start, point, 'move');
            }
            return;
        }
        if (this.directDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const scale = Math.max(0.025, this.camera.position.distanceTo(this.controls.target) * 0.002);
            const origin = this.geometryAnchor ? new THREE.Vector3(...this.geometryAnchor.point) : this.controls.target.clone();
            const from = origin.clone().project(this.camera);
            const to = origin.clone().add(new THREE.Vector3(...this.directDrag.worldNormal)).project(this.camera);
            const direction = new THREE.Vector2(to.x - from.x, -(to.y - from.y));
            if (direction.lengthSq() < 0.000001) direction.set(0, -1);
            direction.normalize();
            const delta = ((event.clientX - this.directDrag.x) * direction.x + (event.clientY - this.directDrag.y) * direction.y) * scale;
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, delta, 'move');
            return;
        }
        if (this.measureMode && this.measurePoints.length < 2) {
            const hit = this.hitEntity(event);
            if (hit) this.showHoverFace(hit);
            else this.clearHoverFace();
            return;
        }
        if (this.sketchMode && !event.buttons) { this.setSketchHover(this.hitSketchEntity(event)); this.updateSketchCursor(event); }
        if (!event.buttons && !this.sketchMode) this.updateArrowHover(event);
        if (!event.buttons && !this.sketchMode) {
            const hit = this.hitEntity(event);
            const sketchId = hit && this.document?.entities.find((item) => item.id === hit.object.userData.entityId)?.kind === 'sketch' ? hit.object.userData.entityId : null;
            this.setSketchHover(sketchId);
            if (hit) {
                const normal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone().transformDirection(hit.object.matrixWorld).toArray() as Vec3;
                this.hoverGeometry = { id: hit.object.userData.entityId, normal, point: hit.point.toArray() };
                this.hoverFaceAnchor = sketchId ? null : this.createGeometryAnchor(hit, event, 'face');
            } else { this.hoverGeometry = null; this.hoverFaceAnchor = null; }
            this.refreshFaceFeedback();
        }
    }

    private updateSelectionRectangle() {
        if (!this.marquee) return;
        const rect = this.container.getBoundingClientRect();
        const left = Math.min(this.marquee.startX, this.marquee.x) - rect.left;
        const top = Math.min(this.marquee.startY, this.marquee.y) - rect.top;
        Object.assign(this.selectionRectangle.style, {
            display: this.marquee.moved ? 'block' : 'none', left: `${left}px`, top: `${top}px`,
            width: `${Math.abs(this.marquee.x - this.marquee.startX)}px`, height: `${Math.abs(this.marquee.y - this.marquee.startY)}px`,
        });
        this.selectionRectangle.classList.toggle('intersect', this.marquee.x < this.marquee.startX);
    }
    private finishMarquee() {
        const marquee = this.marquee;
        if (!marquee) return;
        this.marquee = null;
        this.selectionRectangle.style.display = 'none';
        this.controls.enabled = true;
        if (!marquee.moved) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const minX = Math.min(marquee.startX, marquee.x), maxX = Math.max(marquee.startX, marquee.x);
        const minY = Math.min(marquee.startY, marquee.y), maxY = Math.max(marquee.startY, marquee.y);
        const intersectMode = marquee.x < marquee.startX;
        const ids: string[] = [];
        this.model.children.forEach((object) => {
            if (!(object instanceof THREE.Mesh) || !object.visible) return;
            const box = new THREE.Box3().setFromObject(object);
            const corners: THREE.Vector3[] = [];
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).project(this.camera));
            const points = corners.map((point) => ({ x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }));
            const inside = points.every((point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY);
            const objectMinX = Math.min(...points.map((point) => point.x)), objectMaxX = Math.max(...points.map((point) => point.x));
            const objectMinY = Math.min(...points.map((point) => point.y)), objectMaxY = Math.max(...points.map((point) => point.y));
            const intersects = objectMaxX >= minX && objectMinX <= maxX && objectMaxY >= minY && objectMinY <= maxY;
            if ((intersectMode && intersects) || (!intersectMode && inside)) ids.push(object.userData.entityId);
        });
        this.callbacks.onMarqueeSelect(ids, marquee.additive);
    }

    private onPointerUp(event: PointerEvent) {
        this.releasePointer(event);
        if (this.sketchMode && (this.spacePressed || this.spaceSketchPointerBlocked)) {
            this.spaceSketchPointerBlocked = false;
            this.shapeDrag = null;
            this.sketchDrag = null;
            return;
        }
        if (event.button === 2) this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        if (this.marquee) {
            const moved = this.marquee.moved;
            this.finishMarquee();
            if (moved) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        }
        if (this.viewRotateDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!this.viewRotateDrag.moved) this.callbacks.onSketchCancelSelection();
            this.viewRotateDrag = null;
            this.controls.enabled = true;
            return;
        }
        if (this.gizmoDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!this.gizmoDrag.moved) this.sketchMode ? this.snapPlaneCamera(true) : this.viewHelper.handleClick(event);
            this.gizmoDrag = null;
            this.controls.enabled = true;
            return;
        }
        if (this.sketchMode && event.button === 0 && (this.sketchSelectionGuardPointerUp || performance.now() < this.sketchSelectionGuardUntil)) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.sketchSelectionGuardPointerUp = false;
            this.shapeDrag = null;
            this.sketchDrag = null;
            return;
        }
        if (this.sketchDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const point = this.sketchPoint(event);
            if (point) this.sketchDrag.center ? this.callbacks.onSketchCenterMove(point, 'end') : this.sketchDrag.sector ? this.callbacks.onSketchSectorMove(point, 'end') : this.sketchDrag.handle ? this.callbacks.onSketchHandleMove(this.sketchDrag.index, this.sketchDrag.handle, point, 'end') : this.callbacks.onSketchPointMove(this.sketchDrag.index, point, 'end');
            this.sketchDrag = null;
            this.container.classList.remove('is-handle-dragging');
            this.controls.enabled = true;
            return;
        }
        if (this.extrudeArrowDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.callbacks.onExtrudeGesture(this.extrudeArrowDrag.profileId, this.extrudeArrowDrag.direction, 0, 'end');
            this.extrudeArrowDrag = null;
            this.activeArrowKey = null;
            this.container.classList.remove('is-handle-dragging');
            this.updateArrowColors();
            this.controls.enabled = true;
            return;
        }
        if (this.directDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, 0, 'end');
            this.directDrag = null;
            this.activeArrowKey = null;
            this.container.classList.remove('is-handle-dragging');
            this.updateArrowColors();
            this.controls.enabled = true;
            return;
        }
        this.updateOrbitRotation();
        if (this.sketchMode && this.shapeDrag) {
            const point = this.sketchPoint(event);
            if (point && this.shapeDrag.moved) this.callbacks.onSketchDrag(this.shapeDrag.start, point, 'end');
            else if (point) { this.callbacks.onSketchPoint(point); this.callbacks.onSketchSelect(-1); }
            this.shapeDrag = null;
            return;
        }
        if (event.button !== 0 || this.transform.dragging) return;
        if (this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
        if (this.measureMode) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (this.measurePoints.length >= 2) {
                this.setMeasureMode(false);
                this.callbacks.onMeasureChange(false);
                return;
            }
            const hit = this.hitEntity(event);
            if (hit) this.addMeasurePoint(hit.point);
            return;
        }
        if (this.sketchMode) {
            if (this.sketchSegmentHandled) { this.sketchSegmentHandled = false; return; }
            const point = this.sketchPoint(event);
            if (point) { this.callbacks.onSketchPoint(point); this.callbacks.onSketchSelect(-1); }
            return;
        }
        const hit = this.hitEntity(event);
        const additive = event.metaKey || event.ctrlKey || event.shiftKey;
        const planeHit = this.tool === 'select' && !this.sketchMode ? this.hitPlane(event) : null;
        if (planeHit && (!hit || planeHit.distance < hit.distance)) { this.callbacks.onPlaneSelect(planeHit.id); return; }
        if (hit) {
            const normal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone().transformDirection(hit.object.matrixWorld).toArray();
            const selectionType = this.nearFaceEdge(hit, event) ? 'edge' : 'face';
            this.geometryAnchor = this.createGeometryAnchor(hit, event, selectionType);
            this.hoverFaceAnchor = null;
            this.callbacks.onGeometrySelect(hit.object.userData.entityId, selectionType, normal, this.geometryAnchor.point, additive);
        } else if (!hit && ['extrude', 'offsetFace', 'fillet', 'chamfer'].includes(this.tool)) this.callbacks.onBlankCommit();
        else this.callbacks.onSelect(null, additive);
    }
    private nearFaceEdge(hit: THREE.Intersection, event: PointerEvent) {
        if (!hit.face) return false;
        const mesh = hit.object as THREE.Mesh;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const points = [hit.face.a, hit.face.b, hit.face.c].map((index) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld).project(this.camera));
        const screen = points.map((point) => new THREE.Vector2(rect.left + (point.x + 1) * rect.width / 2, rect.top + (1 - point.y) * rect.height / 2));
        const pointer = new THREE.Vector2(event.clientX, event.clientY);
        const distance = (a: THREE.Vector2, b: THREE.Vector2) => new THREE.Line3(new THREE.Vector3(a.x, a.y, 0), new THREE.Vector3(b.x, b.y, 0)).closestPointToPoint(new THREE.Vector3(pointer.x, pointer.y, 0), true, new THREE.Vector3()).distanceTo(new THREE.Vector3(pointer.x, pointer.y, 0));
        return Math.min(distance(screen[0], screen[1]), distance(screen[1], screen[2]), distance(screen[2], screen[0])) < 8;
    }
    private collectSurface(mesh: THREE.Mesh, hit: THREE.Intersection) {
        const start = hit.faceIndex ?? Math.floor((hit.face?.a || 0) / 3);
        const key = `${mesh.uuid}:${start}`;
        const cached = this.surfaceCache.get(key);
        if (cached) return cached;
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        const index = geometry.index;
        const triangles: { vertices: number[]; normal: THREE.Vector3 }[] = [];
        const vertexToTriangles = new Map<string, number[]>();
        const triangleCount = (index?.count || positions.count) / 3;
        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
            const vertices = [0, 1, 2].map((offset) => index ? index.getX(triangleIndex * 3 + offset) : triangleIndex * 3 + offset);
            const points = vertices.map((vertex) => new THREE.Vector3().fromBufferAttribute(positions, vertex));
            const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
            triangles.push({ vertices, normal });
            vertices.forEach((vertex, offset) => {
                const point = points[offset];
                const key = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
                const list = vertexToTriangles.get(key) || [];
                list.push(triangleIndex);
                vertexToTriangles.set(key, list);
            });
        }
        const visited = new Set<number>();
        const queue = [start];
        const threshold = Math.cos(THREE.MathUtils.degToRad(15));
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const current = queue[cursor];
            if (visited.has(current) || !triangles[current]) continue;
            visited.add(current);
            triangles[current].vertices.forEach((vertex) => {
                const point = new THREE.Vector3().fromBufferAttribute(positions, vertex);
                const key = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
                (vertexToTriangles.get(key) || []).forEach((neighbor) => {
                    if (!visited.has(neighbor) && triangles[current].normal.dot(triangles[neighbor].normal) >= threshold) queue.push(neighbor);
                });
            });
        }
        const vertices: Vec3[] = [];
        const indices: number[] = [];
        const center = new THREE.Vector3();
        [...visited].sort((a, b) => a - b).forEach((triangleIndex) => {
            triangles[triangleIndex].vertices.forEach((vertex) => {
                const point = new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld);
                center.add(point);
                vertices.push(point.toArray());
                indices.push(indices.length);
            });
        });
        const result = { vertices, indices, point: center.multiplyScalar(1 / Math.max(1, vertices.length)).toArray() as Vec3 };
        this.surfaceCache.set(key, result);
        return result;
    }
    private createGeometryAnchor(hit: THREE.Intersection, event: PointerEvent, type: 'face' | 'edge'): GeometryAnchor {
        const mesh = hit.object as THREE.Mesh;
        const localNormal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone();
        const normal = localNormal.clone().transformDirection(hit.object.matrixWorld);
        const triangle = hit.face ? [hit.face.a, hit.face.b, hit.face.c].map((index) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld)) : [hit.point.clone()];
        let vertices = triangle;
        let indices = [0, 1, 2];
        let point = hit.point.clone();
        if (type === 'face') {
            const bodyCenter = new THREE.Box3().setFromObject(hit.object).getCenter(new THREE.Vector3());
            point = bodyCenter.add(normal.clone().multiplyScalar(hit.point.clone().sub(bodyCenter).dot(normal)));
            const entity = this.document?.entities.find((item) => item.id === hit.object.userData.entityId);
            if (entity?.kind === 'box') {
                const dimensions = [entity.width!, entity.height!, entity.depth!];
                const axis = Math.abs(localNormal.x) > 0.5 ? 0 : Math.abs(localNormal.y) > 0.5 ? 1 : 2;
                const u = (axis + 1) % 3, v = (axis + 2) % 3;
                const sign = Math.sign(localNormal.getComponent(axis)) || 1;
                vertices = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
                    const local = [0, 0, 0];
                    local[axis] = sign * dimensions[axis] / 2;
                    local[u] = su * dimensions[u] / 2;
                    local[v] = sv * dimensions[v] / 2;
                    return new THREE.Vector3(...local as Vec3).applyMatrix4(mesh.matrixWorld);
                });
                point = vertices.reduce((center, vertex) => center.add(vertex), new THREE.Vector3()).multiplyScalar(0.25);
                indices = [0, 1, 2, 0, 2, 3];
            } else {
                const surface = this.collectSurface(mesh, hit);
                vertices = surface.vertices.map((point) => new THREE.Vector3(...point));
                indices = surface.indices;
                point = hit.point.clone();
            }
        } else if (triangle.length === 3) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            const screen = triangle.map((vertex) => {
                const projected = vertex.clone().project(this.camera);
                return new THREE.Vector2(rect.left + (projected.x + 1) * rect.width / 2, rect.top + (1 - projected.y) * rect.height / 2);
            });
            const pointer = new THREE.Vector2(event.clientX, event.clientY);
            const distance = (a: THREE.Vector2, b: THREE.Vector2) => new THREE.Line3(new THREE.Vector3(a.x, a.y, 0), new THREE.Vector3(b.x, b.y, 0)).closestPointToPoint(new THREE.Vector3(pointer.x, pointer.y, 0), true, new THREE.Vector3()).distanceTo(new THREE.Vector3(pointer.x, pointer.y, 0));
            const edges = [[0, 1], [1, 2], [2, 0]];
            const nearest = edges.sort((a, b) => distance(screen[a[0]], screen[a[1]]) - distance(screen[b[0]], screen[b[1]]))[0];
            vertices = [triangle[nearest[0]], triangle[nearest[1]]];
            point = vertices[0].clone().lerp(vertices[1], 0.5);
        }
        return { id: hit.object.userData.entityId, normal: normal.toArray(), localNormal: localNormal.toArray(), point: point.toArray(), type, vertices: vertices.map((vertex) => vertex.toArray()), indices };
    }
    private refreshFaceFeedback() {
        this.clearGroup(this.faceFeedback);
        const anchor = this.hoverFaceAnchor || (['offsetFace', 'fillet', 'chamfer'].includes(this.tool) ? this.geometryAnchor : null);
        if (!anchor) return;
        if (anchor.type === 'edge' && anchor.vertices.length >= 2) {
            const a = new THREE.Vector3(...anchor.vertices[0]), b = new THREE.Vector3(...anchor.vertices[1]);
            const direction = b.clone().sub(a);
            const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, direction.length(), 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.hoverLine, depthTest: false }));
            edge.position.copy(a).lerp(b, 0.5);
            edge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
            edge.renderOrder = 14;
            this.faceFeedback.add(edge);
        } else {
            const geometry = new THREE.BufferGeometry().setFromPoints(anchor.vertices.map((point) => new THREE.Vector3(...point)));
            geometry.setIndex(anchor.indices);
            const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.hoverFill, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthTest: false }));
            face.renderOrder = 13;
            this.faceFeedback.add(face);
        }
    }
    private onDoubleClick(event: MouseEvent) {
        if (this.measureMode) return;
        if (this.sketchMode) {
            event.preventDefault();
            this.setPointer(event as unknown as PointerEvent);
            const sector = this.raycaster.intersectObjects(this.sketch.children.filter((item) => item.userData.sectorHandle), false)[0];
            if (sector) this.callbacks.onSketchSectorReset();
            return;
        }
        else {
            const hit = this.hitEntity(event as unknown as PointerEvent);
            if (hit) this.callbacks.onBodySelect(hit.object.userData.entityId);
        }
    }
    private resize() {
        const { width, height } = this.container.getBoundingClientRect();
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
        this.renderer.setSize(width, height);
        this.labelRenderer.setSize(width, height);
        this.scene.traverse((object) => {
            if (object instanceof Line2) (object.material as LineMaterial).resolution.set(width, height);
        });
    }

    private animate() {
        this.frame = requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        if (this.fitAnimation) {
            const t = Math.min(1, (performance.now() - this.fitAnimation.started) / 420);
            const eased = 1 - Math.pow(1 - t, 3);
            this.camera.position.lerpVectors(this.fitAnimation.fromPosition, this.fitAnimation.toPosition, eased);
            this.controls.target.lerpVectors(this.fitAnimation.fromTarget, this.fitAnimation.toTarget, eased);
            if (t === 1) this.fitAnimation = null;
        }
        this.controls.update();
        if (this.viewHelper.animating) this.viewHelper.update(delta);
        this.viewHelper.center.copy(this.controls.target);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        if (!this.sketchMode) this.viewHelper.render(this.renderer);
        else { this.planeGizmo.center.copy(this.controls.target); this.planeGizmo.render(this.renderer); }
        this.labelRenderer.render(this.scene, this.camera);
        this.updateScaleBar();
    }
    private updateScaleBar() {
        const height = Math.max(1, this.renderer.domElement.clientHeight);
        const distance = this.camera.position.distanceTo(this.controls.target);
        const unitsPerPixel = this.camera instanceof THREE.OrthographicCamera
            ? (this.camera.top - this.camera.bottom) / this.camera.zoom / height
            : 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / height;
        const raw = unitsPerPixel * 76;
        const power = Math.pow(10, Math.floor(Math.log10(raw)));
        const fraction = raw / power;
        const nice = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
        const width = Math.round(nice / unitsPerPixel);
        const label = `${Number(nice.toFixed(2))} mm`;
        const key = `${width}/${label}`;
        if (key !== this.lastScale) { this.lastScale = key; this.callbacks.onScale({ width, label }); }
    }
    private clearGroup(group: THREE.Group) {
        group.traverse((object) => {
            if (object instanceof CSS2DObject) {
                try { if (object.element.parentNode) object.element.parentNode.removeChild(object.element); } catch { /* The label may already be detached during a blur callback. */ }
            }
            if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
                object.geometry?.dispose();
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach((material) => material?.dispose());
            }
        });
        group.clear();
    }

    sync(document: ModelDocument) {
        this.document = document;
        this.clearAltBorder();
        this.surfaceCache.clear();
        this.transform.detach();
        this.clearGroup(this.model);
        const next = buildScene(document);
        [...next.children].forEach((child) => {
            this.model.add(child);
            const entity = document.entities.find((item) => item.id === child.userData.entityId);
            if (child instanceof THREE.Mesh && entity?.kind !== 'sketch') {
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 28), new THREE.LineBasicMaterial({ color: '#334d46', transparent: true, opacity: 0.48 }));
                edges.userData.displayEdge = true;
                child.add(edges);
            } else if (entity?.kind === 'sketch' && this.sketchMode) {
                const material = (child as THREE.Mesh).material as THREE.Material & { opacity?: number; transparent?: boolean };
                if (material) { material.transparent = true; material.opacity = 0; }
                const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
                const matrix = plane ? this.planeMatrix(plane) : new THREE.Matrix4().makeRotationX(-Math.PI / 2);
                borderSegments(entity).forEach((segment) => {
                    const points = segment.points.map((point) => new THREE.Vector3(point[0], point[1], 0).applyMatrix4(matrix));
                    const border = this.createFatLine(points, segment.closed);
                    border.userData.borderEntityId = entity.id;
                    border.userData.borderSegmentIndex = segment.index;
                    child.add(border);
                });
            }
            this.applyObjectDisplay(child);
        });
        let vertices = 0, triangles = 0;
        this.model.children.forEach((object) => {
            const geometry = (object as THREE.Mesh).geometry;
            vertices += geometry.attributes.position?.count || 0;
            triangles += (geometry.index?.count || geometry.attributes.position?.count || 0) / 3;
        });
        this.callbacks.onStats({ vertices, triangles: Math.round(triangles), objects: this.model.children.length });
        this.clearGroup(this.planes);
        document.planes.filter((plane) => plane.visible).forEach((plane) => this.addPlaneHelper(plane));
        this.applyIsolation();
        this.activePlane = this.activePlane ? document.planes.find((plane) => plane.id === this.activePlane!.id) || null : null;
        this.applySelection();
        this.updatePlaneAppearance();
        this.updateExtrudeGuide(document);
    }
    private applyObjectDisplay(object: THREE.Object3D) {
        object.traverse((child) => {
            if (child.userData.displayEdge) {
                child.visible = this.showEdges && this.displayMode !== 'wireframe';
                const material = (child as THREE.LineSegments).material as THREE.LineBasicMaterial;
                material.depthTest = this.displayMode !== 'xray';
                material.clippingPlanes = this.sectionPlane ? [this.sectionPlane] : [];
                return;
            }
            if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line)) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                if (material.userData.baseOpacity === undefined) {
                    material.userData.baseOpacity = material.opacity;
                    material.userData.baseTransparent = material.transparent;
                    material.userData.baseDepthWrite = material.depthWrite;
                }
                if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = this.displayMode === 'wireframe';
                material.transparent = this.displayMode === 'xray' || material.userData.baseTransparent;
                material.opacity = this.displayMode === 'xray' ? Math.min(0.28, material.userData.baseOpacity) : material.userData.baseOpacity;
                material.depthWrite = this.displayMode === 'xray' ? false : material.userData.baseDepthWrite;
                material.clippingPlanes = this.sectionPlane ? [this.sectionPlane] : [];
                material.needsUpdate = true;
            });
        });
    }
    setDisplayMode(mode: 'shaded' | 'wireframe' | 'xray', showEdges = this.showEdges) {
        this.displayMode = mode;
        this.showEdges = showEdges;
        this.model.children.forEach((child) => this.applyObjectDisplay(child));
    }
    setSection(active: boolean, normal: Vec3 = [0, 1, 0], point: Vec3 = [0, 0, 0]) {
        const direction = new THREE.Vector3(...normal).normalize();
        this.sectionPlane = active ? new THREE.Plane(direction, -direction.dot(new THREE.Vector3(...point))) : null;
        this.model.children.forEach((child) => this.applyObjectDisplay(child));
    }
    private applyIsolation() {
        this.model.children.forEach((child) => {
            const entity = this.document?.entities.find((item) => item.id === child.userData.entityId);
            const inSketch = !this.sketchMode || (entity?.kind === 'sketch' && entity.planeId === this.activePlane?.id);
            child.visible = inSketch && child.userData.entityId !== this.editingSketchId && (!this.isolateIds || this.isolateIds.has(child.userData.entityId));
        });
        this.planes.children.forEach((child) => child.visible = !this.isolateIds || this.isolateIds.has(child.userData.planeId));
    }
    setIsolate(ids: string[] | null) {
        this.isolateIds = ids?.length ? new Set(ids) : null;
        this.applyIsolation();
    }
    setSketchEditing(id: string | null) {
        if (this.editingSketchId !== id) this.setSketchHover(null);
        this.editingSketchId = id;
        this.applyIsolation();
    }
    private setSketchHover(id: string | null) {
        if (this.sketchHoverId === id) return;
        const paint = (entityId: string | null, hovered: boolean) => {
            if (!entityId) return;
            const object = this.model.children.find((item) => item.userData.entityId === entityId);
            if (!object) return;
            const materials = Array.isArray((object as THREE.Mesh).material) ? (object as THREE.Mesh).material as THREE.Material[] : [(object as THREE.Mesh).material as THREE.Material];
            materials.forEach((material: any) => {
                if (!material?.color) return;
                if (!material.userData.sketchBaseColor) {
                    material.userData.sketchBaseColor = material.color.getHex();
                    material.userData.sketchBaseOpacity = material.opacity;
                }
                material.color.set(hovered ? (material.transparent ? SKETCH_COLORS.hoverFill : SKETCH_COLORS.hoverLine) : material.userData.sketchBaseColor);
                if (hovered && material.transparent) material.opacity = 0.42;
                else if (!hovered) material.opacity = material.userData.sketchBaseOpacity;
            });
        };
        paint(this.sketchHoverId, false);
        this.sketchHoverId = id;
        paint(this.sketchHoverId, true);
    }
    private planeMatrix(plane: SketchPlane) {
        const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal));
        matrix.setPosition(new THREE.Vector3(...plane.origin));
        return matrix;
    }
    private addPlaneHelper(plane: SketchPlane) {
        const group = new THREE.Group();
        group.userData.planeId = plane.id;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.planeBlue, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
        const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, -40, 0), new THREE.Vector3(40, 40, 0), new THREE.Vector3(-40, 40, 0),
        ]), new THREE.LineBasicMaterial({ color: SKETCH_COLORS.planeBlue, transparent: true, opacity: 0.5 }));
        group.add(mesh, border);
        group.applyMatrix4(this.planeMatrix(plane));
        this.planes.add(group);
    }
    private updatePlaneAppearance() {
        this.planes.children.forEach((group) => {
            const active = group.userData.planeId === this.activePlane?.id;
            group.children.forEach((child) => {
                const material = (child as THREE.Mesh).material as THREE.Material & { opacity: number };
                material.opacity = active ? (child instanceof THREE.Line ? 0.8 : 0.055) : (child instanceof THREE.Line ? 0.35 : 0.1);
            });
        });
    }
    setActivePlane(plane: SketchPlane | null) {
        this.activePlane = plane;
        if (plane) {
            const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal));
            this.planeGizmo.setOrientation(new THREE.Quaternion().setFromRotationMatrix(basis));
        }
        this.applyIsolation();
        this.updatePlaneAppearance();
    }
    setSelected(ids: string[]) { this.selected = ids; this.applySelection(); if (this.document) this.updateExtrudeGuide(this.document); }
    private applySelection() {
        this.transform.detach();
        this.model.children.forEach((object) => {
            const mesh = object as THREE.Mesh;
            const material = mesh.material as THREE.MeshStandardMaterial;
            const active = this.selected.includes(mesh.userData.entityId) && !['offsetFace', 'fillet', 'chamfer'].includes(this.tool);
            if (material.emissive) {
                const role = this.booleanRoles?.target === mesh.userData.entityId ? '#6d35a8' : this.booleanRoles?.tool === mesh.userData.entityId ? '#175fc2' : active ? '#164b45' : '#000000';
                material.emissive.set(role);
                material.emissiveIntensity = role === '#000000' ? 0 : 0.35;
            } else if (material.color) {
                material.color.set(active ? SKETCH_COLORS.hoverLine : SKETCH_COLORS.line);
            }
        });
        const id = this.selected[this.selected.length - 1];
        const object = this.model.children.find((item) => item.userData.entityId === id);
        const planeObject = this.planes.children.find((item) => item.userData.planeId === id);
        if (planeObject && ['translate', 'rotate'].includes(this.tool) && !this.sketchMode) this.transform.attach(planeObject);
        else if (object && ['translate', 'rotate', 'scale'].includes(this.tool) && !this.sketchMode) this.transform.attach(object);
    }
    setTool(tool: ViewTool) {
        this.tool = tool;
        if (['translate', 'rotate', 'scale'].includes(tool)) this.transform.setMode(tool as 'translate' | 'rotate' | 'scale');
        this.container.dataset.tool = tool;
        this.updateOrbitRotation();
        this.applySelection();
        if (this.document) this.updateExtrudeGuide(this.document);
    }
    private setProjection(mode: 'perspective' | 'orthographic') {
        const previous = this.camera;
        if (mode === 'orthographic') {
            const distance = previous.position.distanceTo(this.controls.target);
            if (previous instanceof THREE.PerspectiveCamera) this.orthoHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(previous.fov / 2));
            this.orthographicCamera.position.copy(previous.position);
            this.orthographicCamera.quaternion.copy(previous.quaternion);
            this.camera = this.orthographicCamera;
        } else {
            this.perspectiveCamera.position.copy(previous.position);
            this.perspectiveCamera.quaternion.copy(previous.quaternion);
            this.camera = this.perspectiveCamera;
        }
        this.projectionMode = mode;
        this.controls.object = this.camera;
        this.transform.camera = this.camera;
        this.viewHelper.camera = this.camera;
        this.planeGizmo.camera = this.camera;
        this.resize();
        this.controls.update();
    }
    toggleProjection() {
        if (!this.sketchMode) this.setProjection(this.projectionMode === 'perspective' ? 'orthographic' : 'perspective');
        return this.projectionMode;
    }
    setSketchMode(active: boolean, points: Point2[] = [], selectedIndex = -1) {
        if (active) this.projectionBeforeSketch = this.projectionMode;
        this.sketchMode = active;
        this.selectedSketchPoint = selectedIndex;
        this.sketchDrag = null;
        this.shapeDrag = null;
        this.transform.detach();
        this.controls.enableRotate = false;
        this.container.classList.toggle('is-sketching', active);
        this.setProjection(active ? 'orthographic' : this.projectionBeforeSketch);
        if (active) {
            this.scene.background = new THREE.Color('#dcebe6');
            this.planes.visible = false;
            if (this.activePlane) {
                this.grid.position.copy(new THREE.Vector3(...this.activePlane.origin));
                this.grid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...this.activePlane.normal).normalize());
            }
        } else {
            this.scene.background = new THREE.Color('#e7ebe8');
            this.planes.visible = true;
            this.grid.position.set(0, -0.02, 0);
            this.grid.quaternion.identity();
        }
        this.updateOrbitRotation();
        this.controls.update();
        if (this.document) this.sync(this.document);
        this.updateSketch(points, selectedIndex);
        if (this.document) this.updateExtrudeGuide(this.document);
    }
    setSketchSelection(index: number) { this.selectedSketchPoint = index; this.updateMarkerColors(); }
    private sketchMarkers() {
        return this.sketch.children.filter((item) => item.userData.pointIndex !== undefined || item.userData.handleSegment !== undefined || item.userData.sectorHandle || item.userData.centerHandle);
    }
    private updateSketchSegmentColors() {
        this.sketch.children.forEach((object) => {
            if (object.userData.segmentIndex === undefined) return;
            ((object as THREE.Line).material as THREE.LineBasicMaterial).color.set(SKETCH_COLORS.edge);
        });
    }
    private borderTargets() {
        const targets: THREE.Object3D[] = [];
        this.model.traverse((object) => { if (object.userData.borderEntityId) targets.push(object); });
        this.sketch.children.forEach((object) => { if (object.userData.borderEntityId) targets.push(object); });
        return targets;
    }
    private clearAltBorder() {
        this.altBorderDelete = null;
        this.clearGroup(this.trimFeedback);
        const targets = this.borderTargets();
        targets.forEach((object) => (((object as THREE.Line).material as THREE.Material & { color: THREE.Color }).color.set(SKETCH_COLORS.edge)));
    }
    private updateAltBorder(event: PointerEvent) {
        this.clearAltBorder();
        if (!this.document || !this.activePlane) return;
        this.setPointer(event);
        const hit = this.raycaster.intersectObjects(this.borderTargets(), false)[0];
        const point = this.sketchPoint(event);
        if (!hit || !point) return;
        const entityId = hit.object.userData.borderEntityId;
        const index = hit.object.userData.borderSegmentIndex;
        const entity = this.document.entities.find((item) => item.id === entityId);
        const segment = entity && borderSegments(entity).find((item) => item.index === index);
        if (!segment) return;
        const all = this.document.entities.filter((item) => item.kind === 'sketch' && item.planeId === this.activePlane!.id).flatMap((item) => borderSegments(item));
        const interval = borderInterval(segment, all, point);
        this.altBorderDelete = { entityId, index, ...interval };
        if (interval.start <= 0 && interval.end >= 1) ((hit.object as THREE.Line).material as THREE.Material & { color: THREE.Color }).color.set(SKETCH_COLORS.deletePoint);
        else {
            const border = this.createFatLine(sliceBorder(segment, interval.start, interval.end).map((value) => this.sketchWorld(value)));
            ((border.material as LineMaterial).color).set(SKETCH_COLORS.deletePoint);
            this.trimFeedback.add(border);
        }
        this.container.classList.add('is-delete-point');
    }
    private createFatLine(points: THREE.Vector3[], closed = false, segmentIndex?: number) {
        const vertices = closed && points.length > 1 ? [...points, points[0].clone()] : points;
        const geometry = new LineGeometry();
        geometry.setPositions(vertices.flatMap((point) => point.toArray()));
        const material = new LineMaterial({ color: SKETCH_COLORS.edge, linewidth: 2.4, depthTest: false });
        material.resolution.set(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        if (segmentIndex !== undefined) line.userData.segmentIndex = segmentIndex;
        line.renderOrder = 5;
        return line;
    }
    private updateSketchCursor(event: PointerEvent) {
        this.setPointer(event);
        const marker = this.raycaster.intersectObjects(this.sketchMarkers(), false)[0];
        const pointIndex = marker?.object.userData.pointIndex;
        this.altDeletePoint = event.altKey && this.sketchProfileType === 'polygon' && pointIndex >= 0 && !marker?.object.userData.centerHandle ? pointIndex : -1;
        if (this.altDeletePoint >= 0) this.clearAltBorder();
        else if (event.altKey) this.updateAltBorder(event);
        else this.clearAltBorder();
        this.container.classList.toggle('is-delete-point', this.altDeletePoint >= 0 || !!this.altBorderDelete);
        this.container.classList.toggle('is-handle-hover', !!marker && this.altDeletePoint < 0);
        const segment = this.raycaster.intersectObjects(this.sketch.children.filter((item) => item.userData.segmentIndex !== undefined), false)[0];
        this.sketchHoverSegment = segment ? segment.object.userData.segmentIndex : -1;
        this.container.classList.toggle('is-border-hover', !!segment && !marker);
        this.updateMarkerColors();
        this.updateSketchSegmentColors();
    }
    private updateMarkerColors() {
        this.sketch.children.forEach((object) => {
            if (object.userData.pointIndex === undefined) return;
            const index = object.userData.pointIndex;
            const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial;
            if (object.userData.pointBorder) material.color.set(index === this.altDeletePoint ? SKETCH_COLORS.deletePoint : SKETCH_COLORS.border);
            else {
                material.color.set(index === this.altDeletePoint ? SKETCH_COLORS.deletePoint : index === this.selectedSketchPoint ? SKETCH_COLORS.pointActive : object.userData.locked ? SKETCH_COLORS.pointLocked : SKETCH_COLORS.point);
                material.transparent = index === this.altDeletePoint;
                material.opacity = index === this.altDeletePoint ? 0.58 : 1;
            }
        });
    }
    private addSketchMarker(point: Point2, index: number, color: string, center = false, locked = false) {
        const selected = index >= 0 && index === this.selectedSketchPoint;
        const outer = new THREE.Mesh(new THREE.SphereGeometry(selected ? 1.75 : 1.4, 16, 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.border, depthTest: false }));
        outer.position.copy(this.sketchWorld(point));
        outer.userData = { pointIndex: index, pointBorder: true, centerHandle: center, locked };
        outer.renderOrder = 6;
        const inner = new THREE.Mesh(new THREE.SphereGeometry(selected ? 1.3 : 1, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
        inner.position.copy(this.sketchWorld(point, 0.14));
        inner.userData = { pointIndex: index, centerHandle: center, locked };
        inner.renderOrder = 7;
        this.sketch.add(outer, inner);
    }
    private addSketchDimension(position: Point2, target: SketchDimension, value: number, unit: LengthUnit) {
        const element = window.document.createElement('div');
        element.className = 'sketch-length-input';
        const input = window.document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        const factor = target.kind === 'angle' ? 1 : unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1;
        input.value = (value / factor).toFixed(2);
        input.addEventListener('pointerdown', (event) => event.stopPropagation());
        input.addEventListener('blur', () => {
            const next = Number(input.value);
            if (Number.isFinite(next) && next > 0) window.setTimeout(() => this.callbacks.onSketchDimension(target, target.kind === 'angle' ? next : next * factor), 0);
            else input.value = (value / factor).toFixed(2);
        });
        element.appendChild(input);
        if (target.kind === 'angle') {
            const label = window.document.createElement('span');
            label.textContent = 'deg';
            element.appendChild(label);
        } else {
            const select = window.document.createElement('select');
            ['mm', 'cm', 'm'].forEach((name) => {
                const option = window.document.createElement('option');
                option.value = name;
                option.textContent = name;
                option.selected = name === unit;
                select.appendChild(option);
            });
            select.addEventListener('pointerdown', (event) => event.stopPropagation());
            select.addEventListener('change', () => window.setTimeout(() => this.callbacks.onLengthUnitChange(select.value as LengthUnit), 0));
            element.appendChild(select);
        }
        const label = new CSS2DObject(element);
        label.position.copy(this.sketchWorld(position, 0.3));
        this.sketch.add(label);
    }
    private addSketchGuide(a: Point2, b: Point2, dashed = true, color: string = SKETCH_COLORS.guide) {
        const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.sketchWorld(a), this.sketchWorld(b)]), material);
        if (dashed) line.computeLineDistances();
        line.renderOrder = 4;
        this.sketch.add(line);
    }
    updateSketch(points: Point2[], selectedIndex = this.selectedSketchPoint, profileType: ProfileType = 'polygon', curves: ProfileCurves = {}, sides = 3, selectedSegment = -1, lockedPoints: number[] = [], sectorAngle = 360, unit: LengthUnit = 'mm', open = false, startAngle?: number) {
        this.clearAltBorder();
        this.clearGroup(this.sketch);
        this.selectedSketchPoint = selectedIndex;
        this.activeSketchSegment = selectedSegment;
        this.sketchProfileType = profileType;
        if (!this.sketchMode || !points.length) return;
        const displayPoints = profilePoints(profileType, points, 64, curves, sides, sectorAngle, open, startAngle);
        const vertices = displayPoints.map((point) => this.sketchWorld(point));
        const midpoint = (a: Point2, b: Point2): Point2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (profileType === 'polygon') {
            for (let index = 0; index < points.length; index++) {
                const a = points[index], b = points[(index + 1) % points.length];
                const curve = curves[index];
                const segmentPoints = curve ? new THREE.CubicBezierCurve(new THREE.Vector2(...a), new THREE.Vector2(...curve.c1), new THREE.Vector2(...curve.c2), new THREE.Vector2(...b)).getPoints(24) : [new THREE.Vector2(...a), new THREE.Vector2(...b)];
                const line = this.createFatLine(segmentPoints.map((point) => this.sketchWorld([point.x, point.y])), false, index);
                line.userData.borderEntityId = this.editingSketchId;
                line.userData.borderSegmentIndex = index;
                this.sketch.add(line);
                if (this.editingSketchId) this.addSketchDimension(midpoint(a, b), { kind: 'segment', index }, Math.hypot(b[0] - a[0], b[1] - a[1]), unit);
                if (curve) this.addSketchGuide(a, b);
            }
        } else {
            const line = this.createFatLine(vertices, !open && profileClosed(profileType));
            line.userData.borderEntityId = this.editingSketchId;
            line.userData.borderSegmentIndex = 0;
            this.sketch.add(line);
        }
        if (profileType === 'rectangle' && points.length === 4 && this.editingSketchId) {
            this.addSketchDimension(midpoint(points[0], points[1]), { kind: 'width' }, Math.abs(points[1][0] - points[0][0]), unit);
            this.addSketchDimension(midpoint(points[1], points[2]), { kind: 'height' }, Math.abs(points[2][1] - points[1][1]), unit);
            this.addSketchMarker(midpoint(points[0], points[2]), -1, SKETCH_COLORS.pointActive, true);
        }
        if (profileType === 'line' && points.length >= 2 && this.editingSketchId) this.addSketchDimension(midpoint(points[0], points[1]), { kind: 'segment', index: 0 }, Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]), unit);
        if (['circle', 'ellipse', 'regular'].includes(profileType) && points.length >= 2) {
            const [center, edge] = points;
            const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
            const start = startAngle ?? Math.atan2(edge[1] - center[1], edge[0] - center[0]);
            const full = !open && (sectorAngle >= 359.999 || profileType === 'regular');
            if (full) this.addSketchGuide(center, edge);
            if (this.editingSketchId) {
                const kind = profileType === 'regular' ? 'regularRadius' : profileType === 'circle' ? 'radius' : 'radiusX';
                this.addSketchDimension(midpoint(center, edge), { kind }, profileType === 'ellipse' ? Math.abs(edge[0] - center[0]) : radius, unit);
                if (profileType === 'ellipse' && points[2]) {
                    if (full) this.addSketchGuide(center, points[2]);
                    this.addSketchDimension(midpoint(center, points[2]), { kind: 'radiusY' }, Math.abs(points[2][1] - center[1]), unit);
                }
            }
            if (profileType !== 'regular' && this.editingSketchId) {
                const angle = start + sectorAngle * Math.PI / 180;
                const rx = profileType === 'circle' ? radius : Math.abs(edge[0] - center[0]);
                const ry = profileType === 'circle' ? radius : Math.abs((points[2]?.[1] ?? center[1]) - center[1]);
                const sectorPoint: Point2 = [center[0] + Math.cos(angle) * rx * 0.82, center[1] + Math.sin(angle) * ry * 0.82];
                const handle = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.sectorHandle, depthTest: false }));
                handle.position.copy(this.sketchWorld(sectorPoint));
                handle.userData.sectorHandle = true;
                handle.renderOrder = 8;
                this.sketch.add(handle);
                if (!full) {
                    const middle = start + sectorAngle * Math.PI / 360;
                    this.addSketchDimension([center[0] + Math.cos(middle) * rx * 0.42, center[1] + Math.sin(middle) * ry * 0.42], { kind: 'angle' }, sectorAngle, unit);
                }
            }
        }
        if (profileType === 'arc' && points.length >= 3 && this.editingSketchId) {
            const center = profileArcCenter(points);
            if (center) {
                this.addSketchMarker(center, -1, SKETCH_COLORS.pointActive, true);
                this.addSketchGuide(center, points[0]);
                this.addSketchDimension(midpoint(center, points[0]), { kind: 'arcRadius' }, Math.hypot(points[0][0] - center[0], points[0][1] - center[1]), unit);
            }
        }
        if (selectedSegment >= 0 && curves[selectedSegment]) {
            const a = points[selectedSegment], b = points[(selectedSegment + 1) % points.length], curve = curves[selectedSegment];
            [[a, curve.c1], [b, curve.c2]].forEach(([from, to], handleIndex) => {
                this.addSketchGuide(from, to, true, SKETCH_COLORS.guideActive);
                if (this.editingSketchId) this.addSketchDimension(midpoint(from, to), { kind: 'control', index: selectedSegment, handle: handleIndex + 1 as 1 | 2 }, Math.hypot(to[0] - from[0], to[1] - from[1]), unit);
            });
            [curve.c1, curve.c2].forEach((point, handleIndex) => {
                const handle = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.handle, depthTest: false }));
                handle.position.copy(this.sketchWorld(point));
                handle.userData.handleSegment = selectedSegment;
                handle.userData.handleIndex = handleIndex + 1;
                handle.renderOrder = 7;
                this.sketch.add(handle);
            });
        }
        points.forEach((point, index) => {
            const color = index === selectedIndex ? SKETCH_COLORS.pointActive : lockedPoints.includes(index) ? SKETCH_COLORS.pointLocked : SKETCH_COLORS.point;
            const center = index === 0 && ['circle', 'ellipse', 'regular'].includes(profileType);
            this.addSketchMarker(point, index, color, center, lockedPoints.includes(index));
        });
        this.updateMarkerColors();
        this.updateSketchSegmentColors();
    }

    private createThickArrow(origin: THREE.Vector3, normal: THREE.Vector3, length: number, data: Record<string, any>) {
        const group = new THREE.Group();
        group.userData.arrowKey = JSON.stringify(data);
        const highlighted = group.userData.arrowKey === this.activeArrowKey || group.userData.arrowKey === this.hoverArrowKey;
        const material = new THREE.MeshBasicMaterial({ color: highlighted ? SKETCH_COLORS.hoverLine : SKETCH_COLORS.arrow, depthTest: false, depthWrite: false, toneMapped: false });
        const arrowLength = length / 3;
        const headHeight = Math.min(4, arrowLength * 0.7);
        const shaftLength = Math.max(0.5, arrowLength - headHeight);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, shaftLength, 16), material);
        shaft.position.y = shaftLength / 2;
        const head = new THREE.Mesh(new THREE.ConeGeometry(2.2, headHeight, 20), material);
        head.position.y = shaftLength + headHeight / 2;
        group.add(shaft, head);
        group.position.copy(origin);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
        group.scale.setScalar(2.5);
        group.traverse((child) => { Object.assign(child.userData, data); child.userData.arrowKey = group.userData.arrowKey; child.renderOrder = 100; });
        return group;
    }
    private updateExtrudeGuide(document: ModelDocument) {
        this.clearGroup(this.guides);
        this.refreshFaceFeedback();
        if (this.sketchMode) return;
        if (this.tool === 'select') {
            const profiles = this.selected.map((id) => document.entities.find((item) => item.id === id && item.kind === 'sketch' && entityProfileClosed(item))).filter(Boolean) as ModelDocument['entities'];
            if (!profiles.length) return;
            const box = new THREE.Box3();
            profiles.forEach((profile) => {
                const object = this.model.children.find((item) => item.userData.entityId === profile.id);
                if (object) box.expandByObject(object);
            });
            if (box.isEmpty()) return;
            const center = box.getCenter(new THREE.Vector3());
            const plane = document.planes.find((item) => item.id === profiles[0].planeId);
            const normal = plane ? new THREE.Vector3(...plane.normal).normalize() : new THREE.Vector3(0, 1, 0);
            for (const direction of [1, -1] as const) {
                const group = this.createThickArrow(center, normal.clone().multiplyScalar(direction), 18, { extrudeArrow: { profileId: profiles[profiles.length - 1].id, direction } });
                this.guides.add(group);
            }
            return;
        }
        if (['offsetFace', 'fillet', 'chamfer'].includes(this.tool) && this.geometryAnchor) {
            const entity = document.entities.find((item) => item.id === this.geometryAnchor!.id);
            if (!entity) return;
            const normal = new THREE.Vector3(...this.geometryAnchor.normal).normalize();
            const origin = new THREE.Vector3(...this.geometryAnchor.point);
            const value = this.tool === 'offsetFace' ? entity.faceOffset?.distance || 0 : entity.edge?.size || 3;
            origin.add(normal.clone().multiplyScalar(value));
            const length = 18;
            const arrow = this.createThickArrow(origin, normal, length, { directArrow: { id: entity.id } });
            this.guides.add(arrow);
            const element = window.document.createElement('div');
            element.className = 'measure-value extrude-dimension';
            element.textContent = `${Number(value.toFixed(4))} mm`;
            element.addEventListener('click', () => this.callbacks.onExtrudeDimension());
            const label = new CSS2DObject(element);
            label.position.copy(origin).add(normal.clone().multiplyScalar(length));
            this.guides.add(label);
            return;
        }
        if (this.tool !== 'extrude') return;
        const profile = document.entities.find((item) => item.id === this.selected[this.selected.length - 1] && item.kind === 'sketch');
        const body = document.entities.find((item) => item.profileId === profile?.id);
        if (!profile || !body) return;
        const object = this.model.children.find((item) => item.userData.entityId === profile.id);
        if (!object) return;
        const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
        const plane = document.planes.find((item) => item.id === profile.planeId);
        const normal = plane ? new THREE.Vector3(...plane.normal) : new THREE.Vector3(0, 1, 0);
        const direction = body.direction === -1 ? -1 : 1;
        const length = Math.max(3, body.depth || 3);
        const arrowOrigin = center.clone().add(normal.clone().multiplyScalar(direction * length));
        const arrow = this.createThickArrow(arrowOrigin, normal.clone().multiplyScalar(direction), 18, { directArrow: { id: body.id, normal: [0, 1, 0] as Vec3 } });
        this.guides.add(arrow);
        const element = window.document.createElement('div');
        element.className = 'measure-value extrude-dimension';
        element.textContent = `${length.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} mm`;
        element.addEventListener('click', () => this.callbacks.onExtrudeDimension());
        const label = new CSS2DObject(element);
        label.position.copy(arrowOrigin).add(normal.multiplyScalar(direction * 18));
        this.guides.add(label);
    }
    setBooleanRoles(roles: { target: string; tool: string } | null) {
        this.booleanRoles = roles;
        this.applySelection();
    }
    normalToSketch() {
        if (!this.activePlane) return;
        const target = new THREE.Vector3(...this.activePlane.origin);
        const direction = new THREE.Vector3(...this.activePlane.normal);
        const distance = this.camera.position.distanceTo(target);
        this.controls.target.copy(target);
        this.camera.up.copy(new THREE.Vector3(...this.activePlane.v).normalize());
        this.camera.position.copy(target).add(direction.multiplyScalar(distance));
        this.camera.lookAt(target);
        this.controls.update();
    }

    // Measurement mode: first two clicks retain world points; a third click clears annotations and exits.
    setMeasureMode(active: boolean) {
        this.measureMode = active;
        this.container.classList.toggle('is-measuring', active);
        this.clearMeasurement();
        this.updateOrbitRotation();
    }
    private clearHoverFace() {
        if (!this.hoverFace) return;
        this.measurements.remove(this.hoverFace);
        this.hoverFace.geometry.dispose();
        (this.hoverFace.material as THREE.Material).dispose();
        this.hoverFace = null;
    }
    private showHoverFace(hit: THREE.Intersection) {
        this.clearHoverFace();
        if (!hit.face) return;
        const mesh = hit.object as THREE.Mesh;
        const positions = mesh.geometry.attributes.position;
        const indices = mesh.geometry.index;
        const faceIndices = indices ? [indices.getX(hit.faceIndex! * 3), indices.getX(hit.faceIndex! * 3 + 1), indices.getX(hit.faceIndex! * 3 + 2)] : [hit.face.a, hit.face.b, hit.face.c];
        const points = faceIndices.map((index) => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
        const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).multiplyScalar(0.04);
        points.forEach((point) => point.add(normal));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        geometry.setIndex([0, 1, 2]);
        this.hoverFace = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: this.measurePoints.length ? '#e2a34d' : '#26a88f', transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }));
        this.hoverFace.renderOrder = 8;
        this.measurements.add(this.hoverFace);
    }
    private addMeasurePoint(point: THREE.Vector3) {
        this.measurePoints.push(point.clone());
        const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: this.measurePoints.length === 1 ? '#147d70' : '#d88d32', depthTest: false }));
        marker.position.copy(point);
        marker.renderOrder = 9;
        this.measurements.add(marker);
        this.clearHoverFace();
        if (this.measurePoints.length === 2) this.drawMeasurement();
    }
    private measureLabel(text: string, position: THREE.Vector3, className = '') {
        const element = document.createElement('div');
        element.className = `measure-value ${className}`;
        element.textContent = text;
        const label = new CSS2DObject(element);
        label.position.copy(position);
        this.measurements.add(label);
    }
    private doubleArrow(a: THREE.Vector3, b: THREE.Vector3, color: string, label?: string, labelClass = '') {
        const direction = b.clone().sub(a);
        const length = direction.length();
        if (length < 0.0001) return;
        direction.normalize();
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, depthTest: false }));
        line.renderOrder = 9;
        this.measurements.add(line);
        const height = Math.min(3, Math.max(1.2, length * 0.08));
        [[a, direction.clone().negate()], [b, direction]].forEach(([point, dir]) => {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(height * 0.32, height, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir as THREE.Vector3);
            cone.position.copy(point as THREE.Vector3).add((dir as THREE.Vector3).clone().multiplyScalar(height / 2));
            cone.renderOrder = 9;
            this.measurements.add(cone);
        });
        if (label) this.measureLabel(label, a.clone().lerp(b, 0.5), labelClass);
    }
    private drawMeasurement() {
        const [a, b] = this.measurePoints;
        this.doubleArrow(a, b, '#147d70', `${a.distanceTo(b).toFixed(2)} mm`, 'measure-total');
        const x = new THREE.Vector3(b.x, a.y, a.z), y = new THREE.Vector3(b.x, b.y, a.z);
        if (Math.abs(b.x - a.x) > 0.0001) this.doubleArrow(a, x, '#ef5261', `${Math.abs(b.x - a.x).toFixed(2)} mm`, 'axis-x');
        if (Math.abs(b.y - a.y) > 0.0001) this.doubleArrow(x, y, '#63ad45', `${Math.abs(b.y - a.y).toFixed(2)} mm`, 'axis-y');
        if (Math.abs(b.z - a.z) > 0.0001) this.doubleArrow(y, b, '#4c86e8', `${Math.abs(b.z - a.z).toFixed(2)} mm`, 'axis-z');
    }
    private clearMeasurement() {
        this.clearHoverFace();
        this.clearGroup(this.measurements);
        this.measurePoints = [];
        this.hoverFace = null;
    }

    setGridVisible(visible: boolean) { this.grid.visible = visible; }
    setShadowsVisible(visible: boolean) {
        this.shadow.visible = visible;
        this.sun.castShadow = visible;
        this.renderer.shadowMap.enabled = visible;
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.needsUpdate = true);
        });
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
    private fitBox(box: THREE.Box3, animate = true) {
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
    fit(animate = true) { this.fitBox(new THREE.Box3().setFromObject(this.model), animate); }
    fitSelection() {
        const selected = this.model.children.filter((item) => this.selected.includes(item.userData.entityId));
        if (!selected.length) return this.fit();
        const box = new THREE.Box3();
        selected.forEach((item) => box.expandByObject(item));
        this.fitBox(box);
    }
    dispose() {
        cancelAnimationFrame(this.frame);
        this.resizeObserver.disconnect();
        this.disposers.forEach((dispose) => dispose());
        this.controls.dispose();
        this.transform.dispose();
        this.viewHelper.dispose();
        this.planeGizmo.dispose();
        [this.model, this.sketch, this.planes, this.measurements, this.guides, this.faceFeedback, this.trimFeedback].forEach((group) => this.clearGroup(group));
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.labelRenderer.domElement.remove();
        this.selectionRectangle.remove();
    }
}
