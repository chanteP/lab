import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';
import { buildScene } from './geometry';
import type { ModelDocument, Point2, Vec3 } from './types';

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
    onStats: (stats: { vertices: number; triangles: number; objects: number }) => void;
}

export class Viewport {
    private container: HTMLElement;
    private callbacks: ViewportCallbacks;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private transform: TransformControls;
    private viewHelper: ViewHelper;
    private clock = new THREE.Clock();
    private model = new THREE.Group();
    private sketch = new THREE.Group();
    private grid: THREE.GridHelper;
    private shadow: THREE.Mesh;
    private sun: THREE.DirectionalLight;
    private raycaster = new THREE.Raycaster();
    private pointer = new THREE.Vector2();
    private pointerStart = new THREE.Vector2();
    private selected: string[] = [];
    private tool: ViewTool = 'select';
    private sketchMode = false;
    private selectedSketchPoint = -1;
    private sketchDrag: { index: number } | null = null;
    private directDrag: { id: string; normal: Vec3; y: number } | null = null;
    private gizmoDrag: { x: number; y: number; moved: boolean } | null = null;
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
            this.callbacks.onTransform(
                id,
                object.position.toArray(),
                [object.rotation.x, object.rotation.y, object.rotation.z].map(THREE.MathUtils.radToDeg) as Vec3,
                object.scale.toArray(),
            );
        });

        this.viewHelper = new ViewHelper(this.camera, this.renderer.domElement);
        this.viewHelper.setLabels('X', 'Y', 'Z');
        this.viewHelper.setLabelStyle('bold 22px Arial', '#ffffff', 15);

        this.scene.add(this.model, this.sketch);
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
        this.sun.shadow.camera.left = -180;
        this.sun.shadow.camera.right = 180;
        this.sun.shadow.camera.top = 180;
        this.sun.shadow.camera.bottom = -180;
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

    private groundPoint(event: PointerEvent) {
        this.setPointer(event);
        const point = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)
            ? [Math.round(point.x * 10) / 10, Math.round(point.z * 10) / 10] as Point2
            : null;
    }

    private isGizmoEvent(event: PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        return event.clientX >= rect.right - 128 && event.clientY >= rect.bottom - 128;
    }

    private onPointerDown(event: PointerEvent) {
        this.pointerStart.set(event.clientX, event.clientY);
        if (event.button !== 0) return;
        if (this.isGizmoEvent(event)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.gizmoDrag = { x: event.clientX, y: event.clientY, moved: false };
            this.controls.enabled = false;
            return;
        }
        if (this.sketchMode) {
            this.setPointer(event);
            const markers = this.sketch.children.filter((item) => item.userData.pointIndex !== undefined);
            const hit = this.raycaster.intersectObjects(markers, false)[0];
            if (hit) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const index = hit.object.userData.pointIndex;
                this.sketchDrag = { index };
                this.selectedSketchPoint = index;
                this.callbacks.onSketchSelect(index);
                this.callbacks.onSketchPointMove(index, this.groundPoint(event)!, 'start');
                this.controls.enabled = false;
                this.updateMarkerColors();
            }
            return;
        }
        const hit = this.hitEntity(event);
        if (hit && ['pushPull', 'fillet', 'chamfer'].includes(this.tool)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const normal = hit.face?.normal.clone() || new THREE.Vector3(0, 1, 0);
            this.directDrag = { id: hit.object.userData.entityId, normal: normal.toArray(), y: event.clientY };
            this.controls.enabled = false;
            this.callbacks.onSelect(hit.object.userData.entityId, false);
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, 0, 'start');
            return;
        }
        if (hit) this.controls.enableRotate = false;
    }

    private onPointerMove(event: PointerEvent) {
        if (this.gizmoDrag) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const dx = event.clientX - this.gizmoDrag.x;
            const dy = event.clientY - this.gizmoDrag.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) this.gizmoDrag.moved = true;
            const offset = this.camera.position.clone().sub(this.controls.target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            spherical.theta -= dx * 0.009;
            spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.009, 0.015, Math.PI - 0.015);
            this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
            this.camera.lookAt(this.controls.target);
            this.gizmoDrag.x = event.clientX;
            this.gizmoDrag.y = event.clientY;
            return;
        }
        if (this.sketchDrag) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const point = this.groundPoint(event);
            if (point) this.callbacks.onSketchPointMove(this.sketchDrag.index, point, 'move');
            return;
        }
        if (this.directDrag) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const scale = Math.max(0.025, this.camera.position.distanceTo(this.controls.target) * 0.002);
            const delta = (this.directDrag.y - event.clientY) * scale;
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, delta, 'move');
        }
    }

    private onPointerUp(event: PointerEvent) {
        if (this.gizmoDrag) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!this.gizmoDrag.moved) this.viewHelper.handleClick(event);
            this.gizmoDrag = null;
            this.controls.enabled = true;
            return;
        }
        if (this.sketchDrag) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const point = this.groundPoint(event);
            if (point) this.callbacks.onSketchPointMove(this.sketchDrag.index, point, 'end');
            this.sketchDrag = null;
            this.controls.enabled = true;
            return;
        }
        if (this.directDrag) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.callbacks.onDirectEdit(this.directDrag.id, this.directDrag.normal, 0, 'end');
            this.directDrag = null;
            this.controls.enabled = true;
            return;
        }
        this.controls.enableRotate = !this.sketchMode;
        if (event.button !== 0 || this.transform.dragging) return;
        if (this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
        if (this.sketchMode) {
            const point = this.groundPoint(event);
            if (point) {
                this.callbacks.onSketchPoint(point);
                this.callbacks.onSketchSelect(-1);
            }
            return;
        }
        const hit = this.hitEntity(event);
        this.callbacks.onSelect(hit?.object.userData.entityId || null, event.metaKey || event.ctrlKey || event.shiftKey);
    }

    private onDoubleClick(event: MouseEvent) {
        if (this.sketchMode) {
            event.preventDefault();
            this.callbacks.onSketchComplete();
        } else if (this.selected.length) {
            this.fitSelection();
        }
    }

    private resize() {
        const { width, height } = this.container.getBoundingClientRect();
        if (!width || !height) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    private animate() {
        this.frame = requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        this.controls.update();
        if (this.viewHelper.animating) this.viewHelper.update(delta);
        this.viewHelper.center.copy(this.controls.target);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.viewHelper.render(this.renderer);
    }

    private clearGroup(group: THREE.Group) {
        group.traverse((object) => {
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
        let vertices = 0;
        let triangles = 0;
        this.model.children.forEach((object) => {
            const geometry = (object as THREE.Mesh).geometry;
            vertices += geometry.attributes.position?.count || 0;
            triangles += (geometry.index?.count || geometry.attributes.position?.count || 0) / 3;
        });
        this.callbacks.onStats({ vertices, triangles: Math.round(triangles), objects: this.model.children.length });
        this.applySelection();
    }

    setSelected(ids: string[]) {
        this.selected = ids;
        this.applySelection();
    }

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

    setSketchSelection(index: number) {
        this.selectedSketchPoint = index;
        this.updateMarkerColors();
    }

    private updateMarkerColors() {
        this.sketch.children.forEach((object) => {
            if (object.userData.pointIndex === undefined) return;
            const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial;
            material.color.set(object.userData.pointIndex === this.selectedSketchPoint ? '#ffb65c' : '#ffffff');
        });
    }

    updateSketch(points: Point2[], selectedIndex = this.selectedSketchPoint) {
        this.clearGroup(this.sketch);
        this.selectedSketchPoint = selectedIndex;
        if (!this.sketchMode || !points.length) return;
        const vertices = points.map(([x, z]) => new THREE.Vector3(x, 0.12, z));
        if (vertices.length >= 3) {
            const shape = new THREE.Shape();
            shape.moveTo(points[0][0], -points[0][1]);
            points.slice(1).forEach(([x, z]) => shape.lineTo(x, -z));
            shape.closePath();
            const fill = new THREE.Mesh(
                new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
                new THREE.MeshBasicMaterial({ color: '#38a894', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
            );
            fill.position.y = 0.06;
            this.sketch.add(fill);
        }
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(vertices),
            new THREE.LineBasicMaterial({ color: '#147d70', depthTest: false }),
        );
        line.renderOrder = 5;
        this.sketch.add(line);
        vertices.forEach((point, index) => {
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(index === selectedIndex ? 1.35 : 1.05, 16, 12),
                new THREE.MeshBasicMaterial({ color: index === selectedIndex ? '#ffb65c' : '#ffffff', depthTest: false }),
            );
            marker.position.copy(point);
            marker.userData.pointIndex = index;
            marker.renderOrder = 6;
            this.sketch.add(marker);
        });
    }

    setGridVisible(visible: boolean) {
        this.grid.visible = visible;
    }

    setShadowsVisible(visible: boolean) {
        this.shadow.visible = visible;
        this.sun.castShadow = visible;
        this.renderer.shadowMap.enabled = visible;
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach((material) => material.needsUpdate = true);
            }
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

    private fitBox(box: THREE.Box3) {
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.length() / 2, 5);
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        this.controls.target.copy(center);
        this.camera.position.copy(center).add(direction.multiplyScalar(radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.25));
        this.camera.near = Math.max(0.05, radius / 1000);
        this.camera.far = Math.max(5000, radius * 100);
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    fit() {
        this.fitBox(new THREE.Box3().setFromObject(this.model));
    }

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
        this.clearGroup(this.model);
        this.clearGroup(this.sketch);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
