import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { ProfileType, ProfileCurves } from './profiles';
import type { DisplayMode, LengthUnit, ModelDocument, OperationState, Point2, SelectionKind, SketchPlane, Vec3, SketchElementRef } from '../types';
import { ViewportEngine } from './viewport/ViewportEngine';
import { CameraController, type ProjectionMode } from './viewport/CameraController';
import { SceneSynchronizer } from './viewport/SceneSynchronizer';
import { SketchRenderer } from './viewport/SketchRenderer';
import { SketchAssetRenderer } from './viewport/SketchAssetRenderer';
import { MeasurementRenderer } from './viewport/MeasurementRenderer';
import { GuideRenderer, type GeometryAnchor } from './viewport/GuideRenderer';
import { measureSelectionStats, type SelectionStats } from './viewport/GeometrySelector';
import { InteractionController } from './viewport/InteractionController';
import { clearGroup } from './viewport/renderUtils';
import { OverlayController, type ProjectedViewportOverlay } from './viewport/OverlayController';
import { applyTransformControlColors } from './viewport/transformColors';
import { resolveEdgeTreatmentAnchor } from './viewport/edgeTreatmentAnchor';
import { resolveVertexTreatment } from './modeling/VertexTreatments';

export type ViewTool = 'select' | 'translate' | 'rotate' | 'scale' | 'offsetFace' | 'extrude' | 'fillet' | 'chamfer';
export type ViewportStats = { vertices: number; triangles: number; objects: number; selection: SelectionStats | null };
export type { CameraView } from './viewport/CameraController';
import type { CameraView } from './viewport/CameraController';
export type EditPhase = 'start' | 'move' | 'end' | 'cancel';
export type SketchDimension = { assetId?: string; kind: 'segment' | 'control' | 'width' | 'height' | 'radius' | 'radiusX' | 'radiusY' | 'regularRadius' | 'arcRadius' | 'angle'; index?: number; handle?: 1 | 2 };

export interface ViewportCallbacks {
    onSelect: (id: string | null, additive: boolean) => void;
    onGeometrySelect: (id: string, type: 'face' | 'edge' | 'vertex', normal: Vec3, point: Vec3, additive?: boolean, profileFace?: Point2[]) => void;
    onBodySelect: (id: string) => void;
    onPlaneSelect: (id: string) => void;
    onPlaneTransform: (id: string, position: Vec3, quaternion: THREE.Quaternion) => void;
    onTransform: (id: string, position: Vec3, rotation: Vec3, scale: Vec3) => void;
    onTransformEnd: () => void;
    onDirectEdit: (id: string, normal: Vec3, delta: number, phase: EditPhase, anchor?: GeometryAnchor) => void;
    onDirectDragState: (state: { x: number; y: number; active: boolean }) => void;
    onSketchPoint: (point: Point2) => void;
    onSketchPointMove: (index: number, point: Point2, phase: EditPhase) => void;
    onSketchAssetCorner: (id: string, index: number, point: Point2, phase: EditPhase) => void;
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
    onDirectDistance: (value: number) => void;
    onExtrudeDistance: (value: number) => void;
    onExtrudeGesture: (profileId: string, direction: 1 | -1, delta: number, phase: EditPhase) => void;
    onBlankCommit: () => void;
    onMarqueeSelect: (ids: string[], additive: boolean) => void;
    onHoverSketch: (id: string, normal: Vec3, point: Vec3) => void;
    onViewportContext: (id: string | null, x: number, y: number) => void;
    onSpaceChange: (active: boolean) => void;
    onMeasureChange: (active: boolean) => void;
    onScale: (scale: { width: number; value: number; segments: number; gridSize: number }) => void;
    onStats: (stats: ViewportStats) => void;
    onBooleanToggle: (id: string) => void;
    onBooleanHover: (id: string | null) => void;
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
    private readonly sketchAssetRenderer: SketchAssetRenderer;
    private readonly measurementRenderer: MeasurementRenderer;
    private readonly guideRenderer: GuideRenderer;
    private readonly interaction: InteractionController;
    private readonly overlay: OverlayController;
    private readonly transform: TransformControls;
    private tool: ViewTool = 'select';
    private sketchMode = false;
    private sketchAssetId: string | null = null;
    private lengthUnit: LengthUnit = 'mm';
    private sceneStats: Omit<ViewportStats, 'selection'> | null = null;

    constructor(private readonly container: HTMLElement, private readonly callbacks: ViewportCallbacks, private readonly options: ViewportOptions = {}) {
        this.engine = new ViewportEngine(container);
        this.cameraController = new CameraController(this.engine, () => this.lengthUnit, callbacks.onScale);
        this.overlay = new OverlayController();
        this.engine.onResize = () => this.cameraController.resize();

        this.transform = new TransformControls(this.cameraController.camera, this.engine.renderer.domElement);
        this.transform.setSize(0.78);
        applyTransformControlColors(this.transform);
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
            this.publishStats();
        });

        this.sceneSynchronizer = new SceneSynchronizer({
            transform: this.transform,
            renderer: this.engine.renderer,
            isSketchMode: () => this.sketchMode,
            getTool: () => this.tool,
            onStats: (stats) => {
                this.sceneStats = stats;
                this.publishStats();
            },
            onContentRadius: (radius) => this.cameraController.setContentRadius(radius),
            onClearAltBorder: () => this.sketchRenderer.clearAltBorder(),
            onClearSketchReferences: () => this.sketchRenderer.clearReferences(),
            onUpdateExtrudeGuide: (document) => this.guideRenderer.update(document),
            onRefreshSketchFaces: () => this.sketchRenderer.refreshFaces(),
            onRefreshSketchSelectionFeedback: () => this.sketchRenderer.refreshSelectionFeedback(),
            onPlaneOrientation: (plane) => {
                const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.u), new THREE.Vector3(...plane.v), new THREE.Vector3(...plane.normal));
                this.cameraController.planeGizmo.setOrientation(new THREE.Quaternion().setFromRotationMatrix(basis));
            },
            isProfileIntersection: () => !!this.interaction?.geometryAnchor?.key.endsWith(':intersection'),
            overlay: this.overlay,
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
        this.sketchAssetRenderer = new SketchAssetRenderer({
            renderer: this.engine.renderer,
            overlay: this.overlay,
            getCamera: () => this.cameraController.camera,
            getDocument: () => this.sceneSynchronizer.document,
            getActivePlane: () => this.sceneSynchronizer.activePlane,
            getSelectedAssetId: () => this.sketchAssetId,
            getLengthUnit: () => this.lengthUnit,
            isSketchMode: () => this.sketchMode,
        });
        this.measurementRenderer = new MeasurementRenderer((value) => this.formatLength(value), this.overlay, this.engine.renderer);
        this.guideRenderer = new GuideRenderer({
            overlay: this.overlay,
            model: this.sceneSynchronizer.model,
            renderer: this.engine.renderer,
            getSelected: () => this.sceneSynchronizer.selected,
            getTool: () => this.tool,
            getGeometryAnchor: () => this.interaction?.geometryAnchor || null,
            getHoverFaceAnchor: () => this.interaction?.hoverFaceAnchor || null,
            getSectionPlane: () => this.sceneSynchronizer.sectionPlane,
            isSketchMode: () => this.sketchMode,
            getLengthUnit: () => this.lengthUnit,
        });
        this.engine.scene.add(
            this.sceneSynchronizer.model,
            this.sceneSynchronizer.sectionOutlines,
            this.sceneSynchronizer.sectionCaps.group,
            this.sketchRenderer.faces,
            this.sketchRenderer.group,
            this.sceneSynchronizer.planes,
            this.measurementRenderer.group,
            this.guideRenderer.group,
            this.guideRenderer.faceFeedback,
            this.sceneSynchronizer.booleanPreview.group,
            this.sketchRenderer.trimFeedback,
            this.sketchRenderer.references,
            this.sketchRenderer.selectionFeedback,
            this.sketchAssetRenderer.group,
        );
        this.interaction = new InteractionController({
            container,
            engine: this.engine,
            cameraController: this.cameraController,
            sceneSynchronizer: this.sceneSynchronizer,
            sketchRenderer: this.sketchRenderer,
            sketchAssetRenderer: this.sketchAssetRenderer,
            guideRenderer: this.guideRenderer,
            measurementRenderer: this.measurementRenderer,
            transform: this.transform,
            callbacks,
            getTool: () => this.tool,
            isSketchMode: () => this.sketchMode,
            isBooleanActive: () => this.booleanPreviewActive,
        });

        this.cameraController.resize();
        this.engine.start((delta) => this.animate(delta));
    }

    private animate(delta: number) {
        this.cameraController.update(delta, () => this.interaction.updateOrbitRotation());
        const time = performance.now() / 1000;
        this.guideRenderer.updateAnimation(this.cameraController.camera, time);
        this.sceneSynchronizer.updateSelectionAnimation(time);
        this.sceneSynchronizer.booleanPreview.updateAnimation(time);
        this.sceneSynchronizer.updateSection(this.cameraController.camera);
        this.sketchRenderer.updateScreenSpaceMarkers();
        this.sketchAssetRenderer.updateScreenSpaceMarkers();
        if (this.sketchMode) this.measurementRenderer.updateSketchMarkers(this.sketchRenderer.unitsPerPixel());
        this.engine.render(this.cameraController.camera, this.cameraController.viewHelper, this.cameraController.planeGizmo, this.sketchMode, this.cameraController.controls.target);
        this.options.onOverlaysChange?.(this.overlay.project(this.cameraController.camera, this.engine.renderer.domElement));
    }

    private formatLength(value: number) {
        return `${Number(value.toFixed(2))} ${this.lengthUnit}`;
    }

    private publishStats() {
        if (!this.sceneStats) return;
        const bodies = this.sceneSynchronizer.model.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh
            && !['sketch', 'image'].includes(this.sceneSynchronizer.document?.entities.find((item) => item.id === child.userData.entityId)?.kind || ''));
        const selection = measureSelectionStats(bodies, this.sceneSynchronizer.selected, this.sceneSynchronizer.selectionKind, this.interaction?.geometryAnchor || null);
        this.callbacks.onStats({ ...this.sceneStats, selection });
    }

    setLengthUnit(unit: LengthUnit) {
        this.lengthUnit = unit;
        if (this.measurementRenderer.points.length === 2) {
            this.measurementRenderer.refresh();
        }
        if (this.sceneSynchronizer.document) this.guideRenderer.update(this.sceneSynchronizer.document);
        this.sketchAssetRenderer.update();
    }

    sync(document: ModelDocument) {
        this.interaction.clearSurfaceCache();
        this.sceneSynchronizer.sync(document);
        this.sketchAssetRenderer.update();
    }

    setDisplayMode(mode: DisplayMode, showEdges?: boolean) { this.sceneSynchronizer.setDisplayMode(mode, showEdges); }
    setSection(active: boolean, offset = 0) {
        this.sceneSynchronizer.setSection(active, offset);
        if (this.sceneSynchronizer.document) this.guideRenderer.update(this.sceneSynchronizer.document);
        this.guideRenderer.group.visible = !active;
        if (active) this.overlay.clear('guide-label:');
    }
    setSectionOffset(offset: number) { this.sceneSynchronizer.setSectionOffset(offset); }
    getSectionRadius() { return this.sceneSynchronizer.getSectionRadius(); }
    setIsolate(ids: string[] | null) { this.sceneSynchronizer.setIsolate(ids); }
    setSketchEditing(id: string | null) { this.sceneSynchronizer.setSketchEditing(id); }
    setSketchEdgeEditing(index: number | null) { this.sceneSynchronizer.setSketchEdgeEditing(index); }
    setActivePlane(plane: SketchPlane | null) { this.sceneSynchronizer.setActivePlane(plane); }
    setSelected(ids: string[], kind: SelectionKind = 'body') {
        this.sceneSynchronizer.setSelected(ids, kind);
        this.publishStats();
    }
    setSketchSelectionState(edges: SketchElementRef[], points: SketchElementRef[]) { this.sketchRenderer.setSelectionState(edges, points); }
    setActiveConstraintRule(selection: { entityId: string; index: number; ruleId: string } | null, reference: SketchElementRef | null = null) { this.sketchRenderer.setActiveConstraintRule(selection, reference); }
    clearGeometrySelection() {
        this.interaction.clearGeometrySelection();
        this.publishStats();
    }
    getGeometryAnchor() { return this.interaction.geometryAnchor; }
    resolveGeometryEdgeTreatment() {
        const anchor = this.interaction.geometryAnchor;
        const entity = this.sceneSynchronizer.document?.entities.find((item) => item.id === anchor?.id);
        if (anchor?.type === 'edge' && entity) resolveEdgeTreatmentAnchor(anchor, entity, this.sceneSynchronizer.model.children.find((item) => item.userData.entityId === entity.id));
        else if (anchor?.type === 'vertex' && entity) {
            const treatment = resolveVertexTreatment(entity, anchor);
            anchor.vertexTreatmentId = treatment?.id;
        }
    }
    offsetGeometryAnchor(offset: Vec3) {
        this.interaction.offsetGeometryAnchor(offset);
        this.publishStats();
    }
    setSelectThrough(active: boolean) { this.interaction.setSelectThrough(active); }
    setIncludeTangent(active: boolean) { this.interaction.setIncludeTangent(active); }

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
                this.engine.grid.mesh.position.copy(new THREE.Vector3(...plane.origin));
                this.engine.grid.setPlaneOrientation(new THREE.Vector3(...plane.normal));
            }
        } else {
            this.cameraController.camera.up.set(0, 1, 0);
            this.sceneSynchronizer.planes.visible = true;
            this.engine.grid.mesh.position.set(0, -0.02, 0);
            this.engine.grid.resetOrientation();
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

    setSketchAssetSelection(id: string | null) {
        this.sketchAssetId = id;
        this.sketchAssetRenderer.update();
    }

    setSketchSelection(index: number) { this.sketchRenderer.setSelection(index); }
    setSketchSelectionTool(active: boolean) { this.sketchRenderer.selectionTool = active; }
    setSketchGuideSnapEnabled(active: boolean) { this.interaction.setSketchGuideSnapEnabled(active); }
    refreshSketchFaces() { this.sketchRenderer.refreshFaces(); }

    updateSketch(points: Point2[], selectedIndex = this.sketchRenderer.selectedSketchPoint, profileType: ProfileType = 'polygon', curves: ProfileCurves = {}, sides = 3, selectedSegment = -1, lockedPoints: number[] = [], sectorAngle = 360, unit: LengthUnit = 'mm', open = false, startAngle?: number, controlPoints?: number[], trimmedCurve = false) {
        this.sketchRenderer.update(points, selectedIndex, profileType, curves, sides, selectedSegment, lockedPoints, sectorAngle, unit, open, startAngle, controlPoints, trimmedCurve);
    }

    setBooleanPreview(state: Extract<OperationState, { type: 'boolean' }> | null) { this.sceneSynchronizer.setBooleanPreview(state); }
    get booleanPreviewActive() { return !!this.sceneSynchronizer.booleanState; }
    setBooleanHover(id: string | null) { this.sceneSynchronizer.booleanPreview.setHover(id); }
    normalToSketch() { this.cameraController.normalToSketch(this.sceneSynchronizer.activePlane, this.transform); }
    sketchScreen(point: Point2) {
        const projected = this.sketchRenderer.world(point, 0.4).project(this.cameraController.camera);
        const canvas = this.engine.renderer.domElement;
        return { x: (projected.x + 1) * canvas.clientWidth / 2, y: (1 - projected.y) * canvas.clientHeight / 2 };
    }
    snapSketchAssetPoint(id: string, point: Point2) { return this.interaction.snapSketchAssetPoint(id, point); }
    sketchPointAt(clientX: number, clientY: number, precise = false) {
        return this.interaction.sketchPoint({ clientX, clientY } as PointerEvent, precise);
    }
    sketchUnitsPerPixel() { return this.sketchRenderer.unitsPerPixel(); }
    sketchViewFrame() {
        const canvas = this.engine.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const units = this.sketchRenderer.unitsPerPixel();
        return {
            center: this.sketchPointAt(rect.left + rect.width / 2, rect.top + rect.height / 2) || [0, 0] as Point2,
            width: units * canvas.clientWidth,
            height: units * canvas.clientHeight,
        };
    }
    forwardSketchPointer(event: PointerEvent, phase: 'down' | 'move' | 'up') { this.interaction.forwardSketchPointer(event, phase); }
    forwardWheel(event: WheelEvent) {
        this.engine.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: event.deltaY, deltaMode: event.deltaMode, bubbles: true, cancelable: true }));
    }
    setMeasureMode(active: boolean) { this.interaction.setMeasureMode(active); }
    setGridVisible(visible: boolean) { this.engine.setGridVisible(visible); }
    setShadowsVisible(visible: boolean) { this.engine.setShadowsVisible(visible); }
    setView(view: CameraView) { this.cameraController.setView(view); }
    fit(animate = true) { this.cameraController.fitBox(new THREE.Box3().setFromObject(this.sceneSynchronizer.model), animate); }

    fitSelection() {
        const selected = this.sceneSynchronizer.model.children.filter((item) => this.sceneSynchronizer.selected.includes(item.userData.entityId) && !item.userData.selectionProxy);
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
        this.sketchAssetRenderer.dispose();
        this.measurementRenderer.dispose();
        this.guideRenderer.dispose();
        this.overlay.clearAll();
        this.options.onOverlaysChange?.([]);
        this.engine.dispose();
    }
}
