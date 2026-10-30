import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { ProfileType, ProfileCurves } from './profiles';
import type { LengthUnit, ModelDocument, Point2, SketchPlane, Vec3, SketchElementRef } from '../types';
import { ViewportEngine } from './viewport/ViewportEngine';
import { CameraController, type ProjectionMode } from './viewport/CameraController';
import { SceneSynchronizer } from './viewport/SceneSynchronizer';
import { SketchRenderer } from './viewport/SketchRenderer';
import { MeasurementRenderer } from './viewport/MeasurementRenderer';
import { GuideRenderer } from './viewport/GuideRenderer';
import { InteractionController } from './viewport/InteractionController';
import { clearGroup } from './viewport/renderUtils';
import { OverlayController, type ProjectedViewportOverlay } from './viewport/OverlayController';

export type ViewTool = 'select' | 'translate' | 'rotate' | 'scale' | 'offsetFace' | 'extrude' | 'fillet' | 'chamfer';
export type { CameraView } from './viewport/CameraController';
import type { CameraView } from './viewport/CameraController';
export type EditPhase = 'start' | 'move' | 'end';
export type SketchDimension = { kind: 'segment' | 'control' | 'width' | 'height' | 'radius' | 'radiusX' | 'radiusY' | 'regularRadius' | 'arcRadius' | 'angle'; index?: number; handle?: 1 | 2 };

export interface ViewportCallbacks {
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
    onSketchHandleReset: (segment: number, handle: 1 | 2) => void;
    onSketchDrag: (start: Point2, point: Point2, phase: EditPhase) => void;
    onSketchSelect: (index: number, additive: boolean) => void;
    onSketchPointRefSelect: (entityId: string, index: number) => void;
    onSketchConstraintRule: (entityId: string, index: number, ruleId: string) => void;
    onSketchComplete: () => void;
    onSketchClosePath: () => void;
    onSketchEntitySelect: (id: string, additive: boolean) => void;
    onSketchBorderSelect: (entityId: string, index: number, additive: boolean) => void;
    onSketchContext: (id: string | null, x: number, y: number) => void;
    onSketchCancelSelection: () => void;
    onSketchCenterMove: (point: Point2, phase: EditPhase) => void;
    onSketchPointDelete: (index: number) => void;
    onSketchBorderDelete: (entityId: string, index: number, start: number, end: number) => void;
    onSketchSectorMove: (point: Point2, phase: EditPhase) => void;
    onSketchSectorReset: () => void;
    onSketchDimension: (target: SketchDimension, value: number) => void;
    onSketchDragEnd: () => void;
    onLengthUnitChange: (unit: LengthUnit) => void;
    onExtrudeGesture: (profileId: string, direction: 1 | -1, delta: number, phase: EditPhase) => void;
    onBlankCommit: () => void;
    onExtrudeDimension: () => void;
    onMarqueeSelect: (ids: string[], additive: boolean) => void;
    onHoverSketch: (id: string, normal: Vec3, point: Vec3) => void;
    onViewportContext: (id: string | null, x: number, y: number) => void;
    onSpaceChange: (active: boolean) => void;
    onMeasureChange: (active: boolean) => void;
    onScale: (scale: { width: number; value: number }) => void;
    onStats: (stats: { vertices: number; triangles: number; objects: number }) => void;
}

export interface ViewportOptions {
    onOverlaysChange?: (items: ProjectedViewportOverlay[]) => void;
}

/** Public viewport facade. Specialized modules own rendering, camera and interaction state. */
export class Viewport {
    private readonly engine: ViewportEngine;
    private readonly cameraController: CameraController;
    private readonly sceneSynchronizer: SceneSynchronizer;
    private readonly sketchRenderer: SketchRenderer;
    private readonly measurementRenderer: MeasurementRenderer;
    private readonly guideRenderer: GuideRenderer;
    private readonly interaction: InteractionController;
    private readonly overlay: OverlayController;
    private readonly transform: TransformControls;
    private tool: ViewTool = 'select';
    private sketchMode = false;
    private lengthUnit: LengthUnit = 'mm';

    constructor(private readonly container: HTMLElement, callbacks: ViewportCallbacks, private readonly options: ViewportOptions = {}) {
        this.engine = new ViewportEngine(container);
        this.cameraController = new CameraController(this.engine, () => this.lengthUnit, callbacks.onScale);
        this.overlay = new OverlayController();
        this.engine.onResize = () => this.cameraController.resize();

        this.transform = new TransformControls(this.cameraController.camera, this.engine.renderer.domElement);
        this.transform.setSize(0.78);
        this.engine.scene.add(this.transform.getHelper());
        this.transform.addEventListener('dragging-changed', (event) => {
            this.cameraController.controls.enabled = !event.value;
            if (!event.value) callbacks.onTransformEnd();
        });
        this.transform.addEventListener('objectChange', () => {
            const object = this.transform.object;
            const planeId = object?.userData.planeId;
            if (object && planeId) {
                callbacks.onPlaneTransform(planeId, object.position.toArray(), object.quaternion.clone());
                return;
            }
            const id = object?.userData.entityId;
            if (!object || !id) return;
            callbacks.onTransform(id, object.position.toArray(),
                [object.rotation.x, object.rotation.y, object.rotation.z].map(THREE.MathUtils.radToDeg) as Vec3, object.scale.toArray());
        });

        this.sceneSynchronizer = new SceneSynchronizer({
            transform: this.transform,
            renderer: this.engine.renderer,
            isSketchMode: () => this.sketchMode,
            getTool: () => this.tool,
            onStats: callbacks.onStats,
            onClearAltBorder: () => this.sketchRenderer.clearAltBorder(),
            onClearSketchReferences: () => this.sketchRenderer.clearReferences(),
            onUpdateExtrudeGuide: (document) => this.guideRenderer.update(document),
            onRefreshSketchFaces: () => this.sketchRenderer.refreshFaces(),
            onRefreshSketchSelectionFeedback: () => this.sketchRenderer.refreshSelectionFeedback(),
            onPlaneOrientation: (plane) => {
                const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal));
                this.cameraController.planeGizmo.setOrientation(new THREE.Quaternion().setFromRotationMatrix(basis));
            },
        });
        this.sketchRenderer = new SketchRenderer({
            container,
            renderer: this.engine.renderer,
            overlay: this.overlay,
            getCamera: () => this.cameraController.camera,
            getTarget: () => this.cameraController.controls.target,
            getDocument: () => this.sceneSynchronizer.document,
            getActivePlane: () => this.sceneSynchronizer.activePlane,
            getEditingSketchId: () => this.sceneSynchronizer.editingSketchId,
            getModel: () => this.sceneSynchronizer.model,
            getSketchDrag: () => this.interaction?.sketchDrag || null,
            isSketchMode: () => this.sketchMode,
            planeMatrix: (plane) => this.sceneSynchronizer.planeMatrix(plane),
            raycast: (event, targets) => this.interaction.raycast(event, targets),
            raycastPoint: (event) => this.interaction.sketchPoint(event),
        });
        this.measurementRenderer = new MeasurementRenderer((value) => this.formatLength(value), this.overlay);
        this.guideRenderer = new GuideRenderer({
            overlay: this.overlay,
            model: this.sceneSynchronizer.model,
            getSelected: () => this.sceneSynchronizer.selected,
            getTool: () => this.tool,
            getGeometryAnchor: () => this.interaction?.geometryAnchor || null,
            getHoverFaceAnchor: () => this.interaction?.hoverFaceAnchor || null,
            isSketchMode: () => this.sketchMode,
            formatLength: (value) => this.formatLength(value),
        });
        this.engine.scene.add(
            this.sceneSynchronizer.model,
            this.sketchRenderer.faces,
            this.sketchRenderer.group,
            this.sceneSynchronizer.planes,
            this.measurementRenderer.group,
            this.guideRenderer.group,
            this.guideRenderer.faceFeedback,
            this.sketchRenderer.trimFeedback,
            this.sketchRenderer.references,
            this.sketchRenderer.selectionFeedback,
        );
        this.interaction = new InteractionController({
            container,
            engine: this.engine,
            cameraController: this.cameraController,
            sceneSynchronizer: this.sceneSynchronizer,
            sketchRenderer: this.sketchRenderer,
            guideRenderer: this.guideRenderer,
            measurementRenderer: this.measurementRenderer,
            transform: this.transform,
            callbacks,
            getTool: () => this.tool,
            isSketchMode: () => this.sketchMode,
        });

        this.cameraController.resize();
        this.engine.start((delta) => this.animate(delta));
    }

    private animate(delta: number) {
        this.cameraController.update(delta, () => this.interaction.updateOrbitRotation());
        this.sketchRenderer.updateScreenSpaceMarkers();
        this.engine.render(this.cameraController.camera, this.cameraController.viewHelper, this.cameraController.planeGizmo, this.sketchMode, this.cameraController.controls.target);
        this.options.onOverlaysChange?.(this.overlay.project(this.cameraController.camera, this.engine.renderer.domElement));
    }

    private formatLength(value: number) {
        return `${Number(value.toFixed(2))} ${this.lengthUnit}`;
    }

    setLengthUnit(unit: LengthUnit) {
        this.lengthUnit = unit;
        if (this.measurementRenderer.points.length === 2) {
            clearGroup(this.measurementRenderer.group);
            this.measurementRenderer.draw();
        }
        if (this.sceneSynchronizer.document) this.guideRenderer.update(this.sceneSynchronizer.document);
    }

    sync(document: ModelDocument) {
        this.interaction.clearSurfaceCache();
        this.sceneSynchronizer.sync(document);
    }

    setDisplayMode(mode: 'shaded' | 'wireframe' | 'xray', showEdges?: boolean) { this.sceneSynchronizer.setDisplayMode(mode, showEdges); }
    setSection(active: boolean, normal: Vec3 = [0, 1, 0], point: Vec3 = [0, 0, 0]) { this.sceneSynchronizer.setSection(active, normal, point); }
    setIsolate(ids: string[] | null) { this.sceneSynchronizer.setIsolate(ids); }
    setSketchEditing(id: string | null) { this.sceneSynchronizer.setSketchEditing(id); }
    setSketchEdgeEditing(index: number | null) { this.sceneSynchronizer.setSketchEdgeEditing(index); }
    setActivePlane(plane: SketchPlane | null) { this.sceneSynchronizer.setActivePlane(plane); }
    setSelected(ids: string[]) { this.sceneSynchronizer.setSelected(ids); }
    setSketchSelectionState(edges: SketchElementRef[], points: SketchElementRef[]) { this.sketchRenderer.setSelectionState(edges, points); }
    setActiveConstraintRule(selection: { entityId: string; index: number; ruleId: string } | null, reference: SketchElementRef | null = null) { this.sketchRenderer.setActiveConstraintRule(selection, reference); }
    clearGeometrySelection() { this.interaction.clearGeometrySelection(); }

    setTool(tool: ViewTool) {
        this.tool = tool;
        if (['translate', 'rotate', 'scale'].includes(tool)) this.transform.setMode(tool as 'translate' | 'rotate' | 'scale');
        this.container.dataset.tool = tool;
        this.interaction.updateOrbitRotation();
        this.sceneSynchronizer.applySelection();
        if (this.sceneSynchronizer.document) this.guideRenderer.update(this.sceneSynchronizer.document);
    }

    toggleProjection(): ProjectionMode {
        if (!this.sketchMode) {
            const next = this.cameraController.projectionMode === 'perspective' ? 'orthographic' : 'perspective';
            this.cameraController.setProjection(next, this.transform);
        }
        return this.cameraController.projectionMode;
    }

    setSketchMode(active: boolean, points: Point2[] = [], selectedIndex = -1) {
        this.sketchRenderer.clearReferences();
        const wasSketch = this.sketchMode;
        if (active && !wasSketch) {
            this.cameraController.beforeSketchView = {
                position: this.cameraController.camera.position.clone(),
                target: this.cameraController.controls.target.clone(),
                up: this.cameraController.camera.up.clone(),
                projection: this.cameraController.projectionMode,
                orthoHeight: this.cameraController.orthoHeight,
                color: this.cameraController.clearColor.clone(),
                alpha: this.cameraController.clearAlpha,
            };
        }
        if (active) this.cameraController.projectionBeforeSketch = this.cameraController.projectionMode;
        this.sketchMode = active;
        this.sketchRenderer.selectedSketchPoint = selectedIndex;
        this.interaction.resetSketchGesture();
        this.transform.detach();
        this.cameraController.controls.enableRotate = false;
        this.container.classList.toggle('is-sketching', active);
        this.cameraController.setProjection(active ? 'orthographic' : this.cameraController.projectionBeforeSketch, this.transform);
        if (active) {
            this.sceneSynchronizer.planes.visible = false;
            if (this.sceneSynchronizer.activePlane) {
                const plane = this.sceneSynchronizer.activePlane;
                this.engine.grid.position.copy(new THREE.Vector3(...plane.origin));
                this.engine.grid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...plane.normal).normalize());
            }
        } else {
            this.cameraController.camera.up.set(0, 1, 0);
            this.sceneSynchronizer.planes.visible = true;
            this.engine.grid.position.set(0, -0.02, 0);
            this.engine.grid.quaternion.identity();
        }
        this.interaction.updateOrbitRotation();
        this.cameraController.controls.update();
        if (!active && wasSketch && this.cameraController.beforeSketchView) {
            const view = this.cameraController.beforeSketchView;
            this.cameraController.startCameraTransition(view.position, view.target, new THREE.Vector3(0, 1, 0), view.projection, `#${view.color.getHexString()}`, view.alpha, this.transform, view.orthoHeight);
        }
        if (this.sceneSynchronizer.document) this.sync(this.sceneSynchronizer.document);
        this.updateSketch(points, selectedIndex);
        if (this.sceneSynchronizer.document) this.guideRenderer.update(this.sceneSynchronizer.document);
    }

    setSketchSelection(index: number) { this.sketchRenderer.setSelection(index); }
    setSketchSelectionTool(active: boolean) { this.sketchRenderer.selectionTool = active; }
    refreshSketchFaces() { this.sketchRenderer.refreshFaces(); }

    updateSketch(points: Point2[], selectedIndex = this.sketchRenderer.selectedSketchPoint, profileType: ProfileType = 'polygon', curves: ProfileCurves = {}, sides = 3, selectedSegment = -1, lockedPoints: number[] = [], sectorAngle = 360, unit: LengthUnit = 'mm', open = false, startAngle?: number, controlPoints?: number[], trimmedCurve = false) {
        this.sketchRenderer.update(points, selectedIndex, profileType, curves, sides, selectedSegment, lockedPoints, sectorAngle, unit, open, startAngle, controlPoints, trimmedCurve);
    }

    setBooleanRoles(roles: { target: string; tool: string } | null) { this.sceneSynchronizer.setBooleanRoles(roles); }
    normalToSketch() { this.cameraController.normalToSketch(this.sceneSynchronizer.activePlane, this.transform); }
    setMeasureMode(active: boolean) { this.interaction.setMeasureMode(active); }
    setGridVisible(visible: boolean) { this.engine.setGridVisible(visible); }
    setShadowsVisible(visible: boolean) { this.engine.setShadowsVisible(visible); }
    setView(view: CameraView) { this.cameraController.setView(view); }
    fit(animate = true) { this.cameraController.fitBox(new THREE.Box3().setFromObject(this.sceneSynchronizer.model), animate); }

    fitSelection() {
        const selected = this.sceneSynchronizer.model.children.filter((item) => this.sceneSynchronizer.selected.includes(item.userData.entityId));
        if (!selected.length) return this.fit();
        const box = new THREE.Box3();
        selected.forEach((item) => box.expandByObject(item));
        this.cameraController.fitBox(box);
    }

    dispose() {
        this.interaction.dispose();
        this.transform.dispose();
        this.cameraController.dispose();
        this.sceneSynchronizer.dispose();
        this.sketchRenderer.dispose();
        this.measurementRenderer.dispose();
        this.guideRenderer.dispose();
        this.overlay.clearAll();
        this.options.onOverlaysChange?.([]);
        this.engine.dispose();
    }
}
