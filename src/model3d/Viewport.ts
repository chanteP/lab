import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrientationGizmo } from './OrientationGizmo';
import { buildScene } from './geometry';
import type { ModelDocument, Point2, SketchPlane, Vec3 } from './types';

export type ViewTool = 'select' | 'translate' | 'rotate' | 'scale' | 'pushPull' | 'fillet' | 'chamfer';
export type CameraView = 'perspective' | 'front' | 'top' | 'right';
export type EditPhase = 'start' | 'move' | 'end';

interface ViewportCallbacks {
    onSelect: (id: string | null, additive: boolean) => void;
    onTransform: (id: string, position: Vec3, rotation: Vec3, scale: Vec3) => void;
    onTransformEnd: () => void;
    onDirectEdit: (id: string, normal: Vec3, delta: number, phase: EditPhase) => void;
    onSketchPoint: (point: Point2) => void;
    onSketchPointMove: (index: number, point: Point2, phase: EditPhase) => void;
    onSketchSelect: (index: number) => void;
    onSketchComplete: () => void;
    onSpaceChange: (active: boolean) => void;
    onMeasureChange: (active: boolean) => void;
    onScale: (scale: { width: number; label: string }) => void;
    onStats: (stats: { vertices: number; triangles: number; objects: number }) => void;
}

export class Viewport {
    private container: HTMLElement;
    private callbacks: ViewportCallbacks;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    private renderer: THREE.WebGLRenderer;
    private labelRenderer: CSS2DRenderer;
    private controls: OrbitControls;
    private transform: TransformControls;
    private viewHelper: OrientationGizmo;
    private clock = new THREE.Clock();
    private model = new THREE.Group();
    private sketch = new THREE.Group();
    private planes = new THREE.Group();
    private measurements = new THREE.Group();
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
    private sketchDrag: { index: number } | null = null;
    private directDrag: { id: string; normal: Vec3; y: number } | null = null;
    private gizmoDrag: { x: number; y: number; moved: boolean } | null = null;
    private measureMode = false;
    private measurePoints: THREE.Vector3[] = [];
    private hoverFace: THREE.Mesh | null = null;
    private fitAnimation: null | { started: number; fromPosition: THREE.Vector3; toPosition: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } = null;
    private lastScale = '';
    private spacePressed = false;
    private frame = 0;
    private resizeObserver: ResizeObserver;
    private disposers: (() => void)[] = [];

    constructor(container: HTMLElement, callbacks: ViewportCallbacks) {
        this.container = container;
        this.callbacks = callbacks;
        this.scene.background = new THREE.Color('#e7ebe8');
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

        this.camera.position.set(115, 95, 135);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 15, 0);
        this.controls.minDistance = 5;
        this.controls.maxDistance = 1400;
        this.controls.zoomToCursor = true;
        this.controls.update();

        this.transform = new TransformControls(this.camera, this.renderer.domElement);
        this.transform.setSize(0.78);
        this.scene.add(this.transform.getHelper());
        this.transform.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
            if (!event.value) this.callbacks.onTransformEnd();
        });
        this.transform.addEventListener('objectChange', () => {
            const object = this.transform.object;
            const id = object?.userData.entityId;
            if (!object || !id) return;
            this.callbacks.onTransform(id, object.position.toArray(),
                [object.rotation.x, object.rotation.y, object.rotation.z].map(THREE.MathUtils.radToDeg) as Vec3, object.scale.toArray());
        });
        this.viewHelper = new OrientationGizmo(this.camera, this.renderer.domElement, 42);
        this.viewHelper.setLabels('X', 'Y', 'Z');
        this.viewHelper.setLabelStyle('bold 22px Arial', '#ffffff', 15);

        this.scene.add(this.model, this.sketch, this.planes, this.measurements);
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
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown, true);
        canvas.addEventListener('pointermove', this.onPointerMove, true);
        canvas.addEventListener('pointerup', this.onPointerUp, true);
        canvas.addEventListener('pointerleave', () => this.clearHoverFace());
        canvas.addEventListener('dblclick', this.onDoubleClick);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onKeyUp);
        this.disposers.push(() => {
            canvas.removeEventListener('pointerdown', this.onPointerDown, true);
            canvas.removeEventListener('pointermove', this.onPointerMove, true);
            canvas.removeEventListener('pointerup', this.onPointerUp, true);
            canvas.removeEventListener('dblclick', this.onDoubleClick);
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
            this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            this.container.classList.add('is-panning');
            this.callbacks.onSpaceChange(true);
        }
    }
    private onKeyUp(event?: KeyboardEvent) {
        if (event && event.code && event.code !== 'Space') return;
        this.spacePressed = false;
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.container.classList.remove('is-panning');
        this.callbacks.onSpaceChange(false);
    }
    private setPointer(event: PointerEvent | MouseEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
    }
    private hitEntity(event: PointerEvent) {
        this.setPointer(event);
        return this.raycaster.intersectObjects(this.model.children, false)[0];
    }
    private isGizmoEvent(event: PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        return event.clientX >= rect.right - 128 && event.clientY >= rect.bottom - 170 && event.clientY <= rect.bottom - 42;
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

    private onPointerDown(event: PointerEvent) {
        this.fitAnimation = null;
        this.pointerStart.set(event.clientX, event.clientY);
        if (event.button !== 0) return;
        if (this.isGizmoEvent(event)) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.gizmoDrag = { x: event.clientX, y: event.clientY, moved: false };
            this.controls.enabled = false;
            return;
        }
        if (this.measureMode) { this.controls.enableRotate = false; return; }
        if (this.sketchMode) {
            this.setPointer(event);
            const markers = this.sketch.children.filter((item) => item.userData.pointIndex !== undefined);
            const hit = this.raycaster.intersectObjects(markers, false)[0];
            if (hit) {
                event.preventDefault(); event.stopImmediatePropagation();
                const index = hit.object.userData.pointIndex;
                this.sketchDrag = { index };
                this.selectedSketchPoint = index;
                this.callbacks.onSketchSelect(index);
                this.callbacks.onSketchPointMove(index, this.sketchPoint(event)!, 'start');
                this.controls.enabled = false;
                this.updateMarkerColors();
            }
            return;
        }
        const hit = this.hitEntity(event);
        if (hit && ['pushPull', 'fillet', 'chamfer'].includes(this.tool)) {
            event.preventDefault(); event.stopImmediatePropagation();
            const normal = hit.face?.normal.clone() || new THREE.Vector3(0, 1, 0);
            this.directDrag = { id: hit.object.userData.entityId, normal: normal.toArray(), y: event.clientY };
            this.controls.enabled = false;
            this.callbacks.onSelect(hit.object.userData.entityId, false);
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, 0, 'start');
            return;
        }
        // Select mode deliberately keeps rotation enabled on entities, matching direct-modeling navigation.
        if (hit && this.tool !== 'select') this.controls.enableRotate = false;
    }

    private onPointerMove(event: PointerEvent) {
        if (this.gizmoDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const dx = event.clientX - this.gizmoDrag.x;
            const dy = event.clientY - this.gizmoDrag.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) this.gizmoDrag.moved = true;
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
        if (this.sketchDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const point = this.sketchPoint(event);
            if (point) this.callbacks.onSketchPointMove(this.sketchDrag.index, point, 'move');
            return;
        }
        if (this.directDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const scale = Math.max(0.025, this.camera.position.distanceTo(this.controls.target) * 0.002);
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, (this.directDrag.y - event.clientY) * scale, 'move');
            return;
        }
        if (this.measureMode && this.measurePoints.length < 2) {
            const hit = this.hitEntity(event);
            if (hit) this.showHoverFace(hit);
            else this.clearHoverFace();
        }
    }

    private onPointerUp(event: PointerEvent) {
        if (this.gizmoDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!this.gizmoDrag.moved) this.viewHelper.handleClick(event);
            this.gizmoDrag = null;
            this.controls.enabled = true;
            return;
        }
        if (this.sketchDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const point = this.sketchPoint(event);
            if (point) this.callbacks.onSketchPointMove(this.sketchDrag.index, point, 'end');
            this.sketchDrag = null;
            this.controls.enabled = true;
            return;
        }
        if (this.directDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, 0, 'end');
            this.directDrag = null;
            this.controls.enabled = true;
            return;
        }
        this.controls.enableRotate = !this.sketchMode && !this.measureMode;
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
            const point = this.sketchPoint(event);
            if (point) { this.callbacks.onSketchPoint(point); this.callbacks.onSketchSelect(-1); }
            return;
        }
        const hit = this.hitEntity(event);
        this.callbacks.onSelect(hit?.object.userData.entityId || null, event.metaKey || event.ctrlKey || event.shiftKey);
    }
    private onDoubleClick(event: MouseEvent) {
        if (this.measureMode) return;
        if (this.sketchMode) { event.preventDefault(); this.callbacks.onSketchComplete(); }
        else if (this.selected.length) this.fitSelection();
    }
    private resize() {
        const { width, height } = this.container.getBoundingClientRect();
        if (!width || !height) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.labelRenderer.setSize(width, height);
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
        this.viewHelper.render(this.renderer);
        this.labelRenderer.render(this.scene, this.camera);
        this.updateScaleBar();
    }
    private updateScaleBar() {
        const height = Math.max(1, this.renderer.domElement.clientHeight);
        const distance = this.camera.position.distanceTo(this.controls.target);
        const unitsPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / height;
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
            if (object instanceof CSS2DObject) object.element.remove();
            if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
                object.geometry?.dispose();
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach((material) => material?.dispose());
            }
        });
        group.clear();
    }

    sync(document: ModelDocument) {
        this.transform.detach();
        this.clearGroup(this.model);
        const next = buildScene(document);
        [...next.children].forEach((child) => this.model.add(child));
        let vertices = 0, triangles = 0;
        this.model.children.forEach((object) => {
            const geometry = (object as THREE.Mesh).geometry;
            vertices += geometry.attributes.position?.count || 0;
            triangles += (geometry.index?.count || geometry.attributes.position?.count || 0) / 3;
        });
        this.callbacks.onStats({ vertices, triangles: Math.round(triangles), objects: this.model.children.length });
        this.clearGroup(this.planes);
        document.planes.filter((plane) => plane.visible).forEach((plane) => this.addPlaneHelper(plane));
        this.activePlane = this.activePlane ? document.planes.find((plane) => plane.id === this.activePlane!.id) || null : null;
        this.applySelection();
        this.updatePlaneAppearance();
    }
    private planeMatrix(plane: SketchPlane) {
        const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal));
        matrix.setPosition(new THREE.Vector3(...plane.origin));
        return matrix;
    }
    private addPlaneHelper(plane: SketchPlane) {
        const group = new THREE.Group();
        group.userData.planeId = plane.id;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: '#4a9c8e', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
        const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, -40, 0), new THREE.Vector3(40, 40, 0), new THREE.Vector3(-40, 40, 0),
        ]), new THREE.LineBasicMaterial({ color: '#4a9c8e', transparent: true, opacity: 0.5 }));
        group.add(mesh, border);
        group.applyMatrix4(this.planeMatrix(plane));
        this.planes.add(group);
    }
    private updatePlaneAppearance() {
        this.planes.children.forEach((group) => {
            const active = group.userData.planeId === this.activePlane?.id;
            group.children.forEach((child) => {
                const material = (child as THREE.Mesh).material as THREE.Material & { opacity: number };
                material.opacity = active ? (child instanceof THREE.Line ? 0.9 : 0.16) : (child instanceof THREE.Line ? 0.35 : 0.05);
            });
        });
    }
    setActivePlane(plane: SketchPlane | null) {
        this.activePlane = plane;
        this.updatePlaneAppearance();
    }
    setSelected(ids: string[]) { this.selected = ids; this.applySelection(); }
    private applySelection() {
        this.transform.detach();
        this.model.children.forEach((object) => {
            const mesh = object as THREE.Mesh;
            const material = mesh.material as THREE.MeshStandardMaterial;
            const active = this.selected.includes(mesh.userData.entityId);
            material.emissive.set(active ? '#164b45' : '#000000');
            material.emissiveIntensity = active ? 0.22 : 0;
        });
        const id = this.selected[this.selected.length - 1];
        const object = this.model.children.find((item) => item.userData.entityId === id);
        if (object && ['translate', 'rotate', 'scale'].includes(this.tool) && !this.sketchMode) this.transform.attach(object);
    }
    setTool(tool: ViewTool) {
        this.tool = tool;
        if (['translate', 'rotate', 'scale'].includes(tool)) this.transform.setMode(tool as 'translate' | 'rotate' | 'scale');
        this.container.dataset.tool = tool;
        this.applySelection();
    }
    setSketchMode(active: boolean, points: Point2[] = [], selectedIndex = -1) {
        this.sketchMode = active;
        this.selectedSketchPoint = selectedIndex;
        this.sketchDrag = null;
        this.transform.detach();
        this.controls.enableRotate = !active;
        this.container.classList.toggle('is-sketching', active);
        this.updateSketch(points, selectedIndex);
    }
    setSketchSelection(index: number) { this.selectedSketchPoint = index; this.updateMarkerColors(); }
    private updateMarkerColors() {
        this.sketch.children.forEach((object) => {
            if (object.userData.pointIndex === undefined) return;
            ((object as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(object.userData.pointIndex === this.selectedSketchPoint ? '#ffb65c' : '#ffffff');
        });
    }
    updateSketch(points: Point2[], selectedIndex = this.selectedSketchPoint) {
        this.clearGroup(this.sketch);
        this.selectedSketchPoint = selectedIndex;
        if (!this.sketchMode || !points.length) return;
        const vertices = points.map((point) => this.sketchWorld(point));
        if (points.length >= 3) {
            const shape = new THREE.Shape();
            shape.moveTo(points[0][0], points[0][1]);
            points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
            shape.closePath();
            const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: '#38a894', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
            fill.applyMatrix4(this.activePlane ? this.planeMatrix(this.activePlane) : new THREE.Matrix4());
            fill.position.add(this.activePlane ? new THREE.Vector3(...this.activePlane.normal).multiplyScalar(0.06) : new THREE.Vector3(0, 0.06, 0));
            this.sketch.add(fill);
        }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), new THREE.LineBasicMaterial({ color: '#147d70', depthTest: false }));
        line.renderOrder = 5;
        this.sketch.add(line);
        vertices.forEach((point, index) => {
            const marker = new THREE.Mesh(new THREE.SphereGeometry(index === selectedIndex ? 1.35 : 1.05, 16, 12), new THREE.MeshBasicMaterial({ color: index === selectedIndex ? '#ffb65c' : '#ffffff', depthTest: false }));
            marker.position.copy(point);
            marker.userData.pointIndex = index;
            marker.renderOrder = 6;
            this.sketch.add(marker);
        });
    }

    // Measurement mode: first two clicks retain world points; a third click clears annotations and exits.
    setMeasureMode(active: boolean) {
        this.measureMode = active;
        this.container.classList.toggle('is-measuring', active);
        this.clearMeasurement();
        this.controls.enableRotate = !active && !this.sketchMode;
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
        const toPosition = center.clone().add(direction.multiplyScalar(radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.25));
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
        [this.model, this.sketch, this.planes, this.measurements].forEach((group) => this.clearGroup(group));
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.labelRenderer.domElement.remove();
    }
}
