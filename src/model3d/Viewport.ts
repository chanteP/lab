import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildScene } from './geometry';
import type { ModelDocument, Point2, Vec3 } from './types';

export type ViewTool = 'select' | 'translate' | 'rotate' | 'scale';
export type CameraView = 'perspective' | 'front' | 'top' | 'right';

interface ViewportCallbacks {
    onSelect: (id: string | null, additive: boolean) => void;
    onTransform: (id: string, position: Vec3, rotation: Vec3, scale: Vec3) => void;
    onTransformEnd: () => void;
    onSketchPoint: (point: Point2) => void;
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
    private model = new THREE.Group();
    private sketch = new THREE.Group();
    private grid: THREE.GridHelper;
    private raycaster = new THREE.Raycaster();
    private pointer = new THREE.Vector2();
    private pointerStart = new THREE.Vector2();
    private selected: string[] = [];
    private tool: ViewTool = 'select';
    private sketchMode = false;
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
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.9;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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

        this.scene.add(this.model, this.sketch);
        this.grid = new THREE.GridHelper(1000, 100, '#a6b0aa', '#cbd2cd');
        this.grid.position.y = -0.02;
        (this.grid.material as THREE.Material).transparent = true;
        (this.grid.material as THREE.Material).opacity = 0.65;
        this.scene.add(this.grid);
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.ShadowMaterial({ opacity: 0.13 }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -0.04;
        shadow.receiveShadow = true;
        this.scene.add(shadow);
        this.scene.add(new THREE.HemisphereLight('#ffffff', '#829087', 1.25));
        const sun = new THREE.DirectionalLight('#ffffff', 2.1);
        sun.position.set(90, 160, 100);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -180;
        sun.shadow.camera.right = 180;
        sun.shadow.camera.top = 180;
        sun.shadow.camera.bottom = -180;
        sun.shadow.bias = -0.0002;
        this.scene.add(sun);
        const fill = new THREE.DirectionalLight('#d6e8ff', 0.65);
        fill.position.set(-100, 60, -80);
        this.scene.add(fill);

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('dblclick', this.onDoubleClick);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onKeyUp);
        this.disposers.push(() => {
            canvas.removeEventListener('pointerdown', this.onPointerDown);
            canvas.removeEventListener('pointerup', this.onPointerUp);
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

    private onPointerDown(event: PointerEvent) {
        this.pointerStart.set(event.clientX, event.clientY);
        if (!this.sketchMode && event.button === 0 && this.hitEntity(event)) this.controls.enableRotate = false;
    }

    private onPointerUp(event: PointerEvent) {
        this.controls.enableRotate = true;
        if (event.button !== 0 || this.transform.dragging) return;
        if (this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
        if (this.sketchMode) {
            this.setPointer(event);
            const point = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) {
                this.callbacks.onSketchPoint([Math.round(point.x * 10) / 10, Math.round(point.z * 10) / 10]);
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
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
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
        if (object && this.tool !== 'select' && !this.sketchMode) this.transform.attach(object);
    }

    setTool(tool: ViewTool) {
        this.tool = tool;
        if (tool !== 'select') this.transform.setMode(tool);
        this.applySelection();
    }

    setSketchMode(active: boolean, points: Point2[] = []) {
        this.sketchMode = active;
        this.transform.detach();
        this.container.classList.toggle('is-sketching', active);
        this.updateSketch(points);
    }

    updateSketch(points: Point2[]) {
        this.clearGroup(this.sketch);
        if (!this.sketchMode || !points.length) return;
        const vertices = points.map(([x, z]) => new THREE.Vector3(x, 0.12, z));
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(vertices),
            new THREE.LineBasicMaterial({ color: '#147d70', depthTest: false }),
        );
        line.renderOrder = 5;
        this.sketch.add(line);
        const geometry = new THREE.SphereGeometry(0.8, 12, 8);
        const material = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false });
        vertices.forEach((point) => {
            const marker = new THREE.Mesh(geometry, material);
            marker.position.copy(point);
            marker.renderOrder = 6;
            this.sketch.add(marker);
        });
    }

    setGridVisible(visible: boolean) {
        this.grid.visible = visible;
    }

    setView(view: CameraView) {
        const target = this.controls.target.clone();
        const distance = Math.max(100, this.camera.position.distanceTo(target));
        if (view === 'top') this.camera.position.set(target.x, target.y + distance, target.z + 0.001);
        else if (view === 'front') this.camera.position.set(target.x, target.y, target.z + distance);
        else if (view === 'right') this.camera.position.set(target.x + distance, target.y, target.z);
        else this.camera.position.set(target.x + distance * 0.65, target.y + distance * 0.55, target.z + distance * 0.75);
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
        this.clearGroup(this.model);
        this.clearGroup(this.sketch);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
