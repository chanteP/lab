import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { OrientationGizmo } from '../OrientationGizmo';
import { VIEWPORT_COLORS } from '../../config/colors';

/** Owns the WebGL/DOM renderers, scene-wide helpers and the animation frame lifecycle. */
export class ViewportEngine {
    readonly scene = new THREE.Scene();
    readonly renderer: THREE.WebGLRenderer;
    readonly grid: THREE.GridHelper;
    readonly shadow: THREE.Mesh;
    readonly sun: THREE.DirectionalLight;
    onResize: () => void = () => undefined;

    private readonly clock = new THREE.Clock();
    private frame = 0;
    private resizeObserver: ResizeObserver;

    constructor(private readonly container: HTMLElement) {
        this.scene.background = null;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        this.renderer.setClearColor(VIEWPORT_COLORS.background, 1);
        this.renderer.localClippingEnabled = true;
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

        this.grid = new THREE.GridHelper(1000, 100, VIEWPORT_COLORS.gridMajor, VIEWPORT_COLORS.gridMinor);
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

        this.scene.add(new THREE.HemisphereLight(VIEWPORT_COLORS.light, VIEWPORT_COLORS.lightGround, 1.25));
        this.sun = new THREE.DirectionalLight(VIEWPORT_COLORS.light, 2.1);
        this.sun.position.set(90, 160, 100);
        this.sun.castShadow = false;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180 });
        this.sun.shadow.bias = -0.0002;
        this.scene.add(this.sun);
        const fill = new THREE.DirectionalLight(VIEWPORT_COLORS.lightFill, 0.65);
        fill.position.set(-100, 60, -80);
        this.scene.add(fill);

        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(container);
    }

    resize() {
        const { width, height } = this.container.getBoundingClientRect();
        if (!width || !height) return;
        this.renderer.setSize(width, height);
        this.scene.traverse((object) => {
            if (object instanceof Line2) (object.material as LineMaterial).resolution.set(width, height);
        });
    }

    start(onFrame: (delta: number) => void) {
        const animate = () => {
            this.frame = requestAnimationFrame(animate);
            onFrame(this.clock.getDelta());
        };
        animate();
    }

    render(camera: THREE.Camera, viewHelper: OrientationGizmo, planeGizmo: OrientationGizmo, sketchMode: boolean, target: THREE.Vector3) {
        viewHelper.center.copy(target);
        this.renderer.clear();
        this.renderer.render(this.scene, camera);
        if (!sketchMode) viewHelper.render(this.renderer);
        else { planeGizmo.center.copy(target); planeGizmo.render(this.renderer); }
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
                (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.needsUpdate = true);
            }
        });
    }

    dispose() {
        cancelAnimationFrame(this.frame);
        this.resizeObserver.disconnect();
        this.scene.environment?.dispose();
        this.grid.geometry.dispose();
        (this.grid.material as THREE.Material).dispose();
        this.shadow.geometry.dispose();
        (this.shadow.material as THREE.Material).dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
