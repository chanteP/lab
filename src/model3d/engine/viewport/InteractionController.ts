import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { sketchAssetExcludedIds } from '../sketchAssets';
import { intersectionProfileAtPoint } from '../profileIntersection'; import { entityProfileClosed } from '../profiles';
import { INTERACTION } from '../../config/const';
import type { ModelEntity, Point2, Vec3 } from '../../types';
import type { ViewTool, ViewportCallbacks } from '../Viewport';
import type { CameraController } from './CameraController';
import type { ViewportEngine } from './ViewportEngine';
import type { SceneSynchronizer } from './SceneSynchronizer';
import type { SketchRenderer } from './SketchRenderer';
import type { SketchAssetRenderer } from './SketchAssetRenderer';
import type { GuideRenderer } from './GuideRenderer';
import { GeometrySelector, type GeometryAnchor } from './GeometrySelector';
import type { MeasurementRenderer } from './MeasurementRenderer';
import { pickLogicalEdge } from './EdgePicker';
import { pickLogicalVertex } from './VertexPicker';
import { pickDirectArrow } from './DirectArrowPicker';
import { DirectDragController } from './DirectDragController';
import { GizmoDragController } from './GizmoDragController';
import { SketchAssetDragController } from './SketchAssetDragController';
import { SketchGuideController, type SketchGuideOptions } from './SketchGuideController';
import type { InteractionOptions } from './InteractionOptions';

/** Pointer/key state machine. Event order and gesture thresholds mirror the original viewport. */
export class InteractionController {
    geometryAnchor: GeometryAnchor | null = null;
    hoverFaceAnchor: GeometryAnchor | null = null;
    sketchDrag: { index: number; handle?: 1 | 2; sector?: boolean; center?: boolean; startX: number; startY: number; startPoint: Point2; moved: boolean } | null = null;
    measureMode = false;

    private readonly container: HTMLElement;
    private readonly engine: ViewportEngine;
    private readonly cameraController: CameraController;
    private readonly sceneSynchronizer: SceneSynchronizer;
    private readonly sketchRenderer: SketchRenderer;
    private readonly sketchAssetRenderer: SketchAssetRenderer;
    private readonly guideRenderer: GuideRenderer;
    private readonly measurementRenderer: MeasurementRenderer;
    private readonly geometrySelector = new GeometrySelector();
    private readonly transform: TransformControls;
    private readonly callbacks: ViewportCallbacks;
    private readonly getTool: () => ViewTool;
    private readonly isSketchMode: () => boolean;
    private readonly isBooleanActive: () => boolean;
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();
    private readonly pointerStart = new THREE.Vector2();
    private shapeDrag: { start: Point2; moved: boolean } | null = null;
    private readonly assetEditor: SketchAssetDragController;
    private readonly guideController: SketchGuideController;
    private viewRotateDrag: { x: number; y: number; startX: number; startY: number; centerX: number; centerY: number; moved: boolean } | null = null;
    private sketchSegmentHandled = false;
    private sketchSelectionGuardUntil = 0;
    private sketchSelectionGuardPointerUp = false;
    private spaceSketchPointerBlocked = false;
    private lastPointer: { clientX: number; clientY: number } | null = null;
    private readonly directEditor: DirectDragController;
    private readonly gizmo: GizmoDragController;
    private extrudeArrowDrag: { profileId: string; direction: 1 | -1; worldNormal: Vec3; x: number; y: number } | null = null;
    private hoverGeometry: { id: string; normal: Vec3; point: Vec3 } | null = null;
    private marquee: { startX: number; startY: number; x: number; y: number; additive: boolean; moved: boolean } | null = null;
    private readonly selectionRectangle: HTMLDivElement;
    private spacePressed = false;
    private spaceDragMoved = false;
    private spaceHover: { id: string; normal: Vec3; point: Vec3 } | null = null;
    private selectThrough = false;
    private includeTangent = false;

    private get renderer() { return this.engine.renderer; }
    private get camera() { return this.cameraController.camera; }
    private get controls() { return this.cameraController.controls; }
    private get model() { return this.sceneSynchronizer.model; }
    private get planes() { return this.sceneSynchronizer.planes; }
    private get document() { return this.sceneSynchronizer.document; }
    private get activePlane() { return this.sceneSynchronizer.activePlane; }
    private get editingSketchId() { return this.sceneSynchronizer.editingSketchId; }
    private get sketch() { return this.sketchRenderer.group; }
    private get guides() { return this.guideRenderer.group; }
    private get measurePoints() { return this.measurementRenderer.points; }
    private get tool() { return this.getTool(); }
    private get sketchMode() { return this.isSketchMode(); }
    private get sketchProfileType() { return this.sketchRenderer.profileType; }
    private get currentSketchPoints() { return this.sketchRenderer.currentPoints; }
    private get sketchSelectionTool() { return this.sketchRenderer.selectionTool; }
    private get selectedSketchPoint() { return this.sketchRenderer.selectedSketchPoint; }
    private set selectedSketchPoint(value: number) { this.sketchRenderer.selectedSketchPoint = value; }
    private get sketchHoverSegment() { return this.sketchRenderer.hoverSegment; }
    private set sketchHoverSegment(value: number) { this.sketchRenderer.hoverSegment = value; }
    private get hoverBorder() { return this.sketchRenderer.hoverBorder; }
    private set hoverBorder(value: { entityId: string; index: number } | null) { this.sketchRenderer.hoverBorder = value; }
    private get altDeletePoint() { return this.sketchRenderer.altDeletePoint; }
    private set altDeletePoint(value: number) { this.sketchRenderer.altDeletePoint = value; }
    private get altBorderDelete() { return this.sketchRenderer.altBorderDelete; }
    private get activeArrowKey() { return this.guideRenderer.activeArrowKey; }
    private set activeArrowKey(value: string | null) { this.guideRenderer.activeArrowKey = value; }
    private get hoverArrowKey() { return this.guideRenderer.hoverArrowKey; }
    private set hoverArrowKey(value: string | null) { this.guideRenderer.hoverArrowKey = value; }

    constructor(options: InteractionOptions) {
        this.container = options.container;
        this.engine = options.engine;
        this.cameraController = options.cameraController;
        this.sceneSynchronizer = options.sceneSynchronizer;
        this.sketchRenderer = options.sketchRenderer;
        this.sketchAssetRenderer = options.sketchAssetRenderer;
        this.guideRenderer = options.guideRenderer;
        this.measurementRenderer = options.measurementRenderer;
        this.transform = options.transform;
        this.callbacks = options.callbacks;
        this.directEditor = new DirectDragController({
            onEdit: options.callbacks.onDirectEdit,
            onState: options.callbacks.onDirectDragState,
            onPreview: (anchor, delta, worldNormal) => {
                if (anchor.type !== 'face') { this.geometryAnchor = { ...anchor, edgeTreatmentId: this.geometryAnchor?.edgeTreatmentId || anchor.edgeTreatmentId }; return; }
                const offset = new THREE.Vector3(...worldNormal).multiplyScalar(delta);
                this.geometryAnchor = { ...anchor, point: new THREE.Vector3(...anchor.point).add(offset).toArray(), vertices: anchor.vertices.map((point) => new THREE.Vector3(...point).add(offset).toArray()) };
            },
        });
        this.guideController = new SketchGuideController({ sketchRenderer: this.sketchRenderer,
            getDocument: () => this.document, getActivePlane: () => this.activePlane,
            getEditingSketchId: () => this.editingSketchId, getProfileType: () => this.sketchProfileType });
        this.assetEditor = new SketchAssetDragController({
            point: (event) => this.sketchPoint(event),
            onGesture: options.callbacks.onSketchAssetCorner,
            onState: (active) => { this.controls.enabled = !active; this.container.classList.toggle('is-handle-dragging', active); },
            onFinish: () => { this.clearSketchReferences(); options.callbacks.onSketchDragEnd(); },
        });
        this.gizmo = new GizmoDragController(this.cameraController, {
            capture: (event) => this.capturePointer(event),
            release: (event) => this.releasePointer(event),
            rotatePlane: (event, drag) => this.rotatePlaneView(event, drag),
        });
        this.getTool = options.getTool;
        this.isSketchMode = options.isSketchMode;
        this.isBooleanActive = options.isBooleanActive;

        this.selectionRectangle = window.document.createElement('div');
        this.selectionRectangle.className = 'selection-rectangle';
        this.selectionRectangle.style.display = 'none';
        this.container.appendChild(this.selectionRectangle);

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onPointerCancel = this.onPointerCancel.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onAltKey = this.onAltKey.bind(this);
        this.onPointerLeave = this.onPointerLeave.bind(this);
        this.onWindowBlur = this.onWindowBlur.bind(this);
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown, true);
        canvas.addEventListener('pointermove', this.onPointerMove, true);
        canvas.addEventListener('pointerup', this.onPointerUp, true);
        canvas.addEventListener('pointercancel', this.onPointerCancel, true);
        canvas.addEventListener('pointerleave', this.onPointerLeave); canvas.addEventListener('dblclick', this.onDoubleClick);
        canvas.addEventListener('contextmenu', this.onContextMenu);
        window.addEventListener('keydown', this.onKeyDown); window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('keydown', this.onAltKey); window.addEventListener('keyup', this.onAltKey);
        window.addEventListener('blur', this.onKeyUp); window.addEventListener('blur', this.onWindowBlur);
    }

    private cancelDirectGesture() {
        if (!this.directEditor.active) return;
        this.directEditor.cancel();
        this.activeArrowKey = null;
        this.container.classList.remove('is-handle-dragging');
        this.updateArrowColors();
        this.controls.enabled = true;
    }

    private onWindowBlur() {
        this.assetEditor.cancel();
        this.cancelDirectGesture();
        this.gizmo.cancel();
    }

    private onPointerCancel(event: PointerEvent) {
        this.releasePointer(event);
        this.assetEditor.cancel();
        if (this.gizmo.active) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.gizmo.cancel(event);
        } else if (this.directEditor.active) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.cancelDirectGesture();
        } else this.onPointerUp(event);
    }

    private onPointerLeave() {
        this.clearHoverFace();
        this.hoverFaceAnchor = null;
        this.hoverBorder = null;
        this.lastPointer = null;
        this.clearAltBorder();
        this.container.classList.remove('is-delete-point', 'is-border-hover', 'is-handle-hover');
        this.refreshFaceFeedback();
    }

    private isTypingTarget(target: EventTarget | null) {
        const element = target as HTMLElement;
        return !!element && ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
    }

    private onKeyDown(event: KeyboardEvent) {
        if (event.code === 'Escape' && this.assetEditor.active) {
            event.preventDefault();
            this.assetEditor.cancel();
            return;
        }
        if (event.code === 'Escape' && this.directEditor.active) {
            event.preventDefault();
            this.cancelDirectGesture();
            return;
        }
        if (event.code !== 'Space' || this.isTypingTarget(event.target)) return;
        event.preventDefault();
        if (!this.spacePressed) {
            this.clearSketchReferences();
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

    private onAltKey(event: KeyboardEvent) {
        if (!['AltLeft', 'AltRight'].includes(event.code) || !this.sketchMode || !this.lastPointer) return;
        event.preventDefault();
        this.updateSketchCursor({ ...this.lastPointer, altKey: event.altKey } as PointerEvent);
    }

    updateOrbitRotation() {
        this.controls.enableRotate = !this.sketchMode && !this.measureMode;
    }

    forwardSketchPointer(event: PointerEvent, phase: 'down' | 'move' | 'up') {
        if (phase === 'down') this.onPointerDown(event);
        else if (phase === 'move') this.onPointerMove(event);
        else this.onPointerUp(event);
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

    raycast(event: PointerEvent, targets: THREE.Object3D[]) {
        this.setPointer(event);
        return this.raycaster.intersectObjects(targets, false);
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
        return this.raycaster.intersectObjects(this.model.children, false).find((item) => !item.object.userData.selectionProxy && this.isVisible(item.object) && !this.sceneSynchronizer.isSectionPointClipped(item.point));
    }

    private hitSketchEntities(event: PointerEvent) {
        this.setPointer(event);
        const ids = new Set<string>();
        return this.raycaster.intersectObjects(this.model.children, false).filter((item) => {
            const id = item.object.userData.entityId;
            if (ids.has(id) || !this.isVisible(item.object) || this.sceneSynchronizer.isSectionPointClipped(item.point)) return false;
            if (this.document?.entities.find((entity) => entity.id === id)?.kind !== 'sketch') return false;
            ids.add(id);
            return true;
        });
    }

    private sketchIntersectionAnchor(hits: THREE.Intersection[]): GeometryAnchor | null {
        if (hits.length < 2) return null;
        const region = hits[0].object.userData.regionProfile ? hits[0].object.userData : null;
        const entities = region ? region.regionEntityIds.map((id: string) => this.document?.entities.find((entity) => entity.id === id)).filter(Boolean) as ModelEntity[] : hits.map((hit) => this.document?.entities.find((entity) => entity.id === hit.object.userData.entityId)).filter(Boolean) as ModelEntity[];
        const plane = this.document?.planes.find((item) => item.id === entities[0]?.planeId);
        if (!plane || (!region && entities.length < 2)) return null;
        const origin = new THREE.Vector3(...plane.origin), u = new THREE.Vector3(...plane.u), v = new THREE.Vector3(...plane.v);
        const relative = hits[0].point.clone().sub(origin);
        const points = region ? region.profilePoints : intersectionProfileAtPoint(entities, plane.id, [relative.dot(u), relative.dot(v)]);
        if (!points) return null;
        const vertices = points.map(([x, y]) => origin.clone().addScaledVector(u, x).addScaledVector(v, y).toArray() as Vec3);
        const indices = points.slice(1, -1).flatMap((_, index) => [0, index + 1, index + 2]);
        const point = vertices.reduce((center, vertex) => center.add(new THREE.Vector3(...vertex)), new THREE.Vector3()).multiplyScalar(1 / vertices.length).toArray() as Vec3;
        return { id: entities[0].id, key: `${entities[0].id}:intersection`, normal: [...plane.normal], localNormal: [...plane.normal], point, type: 'face', planar: true, vertices, indices, profilePoints: points };
    }

    private hitEntityVertex(event: PointerEvent) {
        return pickLogicalVertex({ camera: this.camera, canvas: this.renderer.domElement, model: this.model, event, thresholdPx: INTERACTION.vertexSelectionPx, selectThrough: this.selectThrough });
    }

    private hitEntityEdge(event: PointerEvent) {
        const hit = pickLogicalEdge({ camera: this.camera, canvas: this.renderer.domElement, model: this.model, event, thresholdPx: INTERACTION.edgeSelectionPx, selectThrough: this.selectThrough });
        return hit && this.isVisible(hit.object) && !this.sceneSynchronizer.isSectionPointClipped(hit.point) ? hit : null;
    }

    private hitExtrudeArrow(event: PointerEvent) {
        this.setPointer(event);
        const hit = this.raycaster.intersectObjects(this.guides.children, true).find((item) => item.object.userData.extrudeArrow);
        this.activeArrowKey = hit?.object.userData.arrowKey || null;
        this.updateArrowColors();
        return hit?.object.userData.extrudeArrow as { profileId: string; direction: 1 | -1 } | undefined;
    }

    private hitDirectArrow(event: PointerEvent) {
        const hit = pickDirectArrow({ guides: this.guides, camera: this.camera, canvas: this.renderer.domElement, event, thresholdPx: INTERACTION.directArrowSelectionPx });
        this.activeArrowKey = hit?.key || null;
        this.updateArrowColors();
        return hit?.data;
    }

    private updateArrowHover(event: PointerEvent) {
        const direct = pickDirectArrow({ guides: this.guides, camera: this.camera, canvas: this.renderer.domElement, event, thresholdPx: INTERACTION.directArrowSelectionPx });
        this.setPointer(event);
        const extrude = direct ? null : this.raycaster.intersectObjects(this.guides.children, true).find((item) => item.object.userData.extrudeArrow);
        this.hoverArrowKey = direct?.key || extrude?.object.userData.arrowKey || null;
        this.container.classList.toggle('is-arrow-hover', !!(direct || extrude));
        this.updateArrowColors();
    }

    private updateArrowColors() { this.guideRenderer.updateArrowColors(); }

    private isVisible(object: THREE.Object3D) {
        let current: THREE.Object3D | null = object;
        while (current && current !== this.engine.scene) {
            if (!current.visible) return false;
            current = current.parent;
        }
        return true;
    }

    // Sketch coordinates are local to the chosen plane; world hit points never become sketch source data.
    sketchPoint(event: PointerEvent, precise = false): Point2 | null {
        if (!this.activePlane) return null;
        this.setPointer(event);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...this.activePlane.normal), new THREE.Vector3(...this.activePlane.origin));
        const point = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(plane, point)) return null;
        point.sub(new THREE.Vector3(...this.activePlane.origin));
        const u = point.dot(new THREE.Vector3(...this.activePlane.u));
        const v = point.dot(new THREE.Vector3(...this.activePlane.v));
        return precise ? [u, v] : [Math.round(u * 10) / 10, Math.round(v * 10) / 10];
    }

    private clearSketchReferences() { this.sketchRenderer.clearReferences(); }
    private sketchUnitsPerPixel() { return this.sketchRenderer.unitsPerPixel(); }

    setSketchGuideSnapEnabled(active: boolean) { this.guideController.setSnapEnabled(active); }
    setSelectThrough(active: boolean) { this.selectThrough = active; }
    setIncludeTangent(active: boolean) { this.includeTangent = active; }

    snapSketchAssetPoint(id: string, point: Point2) {
        return this.guideController.operation(point, { excludeEntityIds: this.document ? sketchAssetExcludedIds(this.document, id) : [id] });
    }

    private sketchOperationPoint(event: PointerEvent, options: SketchGuideOptions = {}) {
        return this.guideController.operation(this.sketchPoint(event), options);
    }

    private sketchDragPoint(event: PointerEvent) {
        if (!this.sketchDrag) return this.sketchPoint(event);
        return this.sketchOperationPoint(event, {
            disabled: this.sketchDrag.sector,
            excludeEntityId: this.sketchDrag.center ? this.editingSketchId || undefined : undefined,
            excludePointIndex: !this.sketchDrag.center && !this.sketchDrag.handle && !this.sketchDrag.sector ? this.sketchDrag.index : undefined,
        });
    }
    private drawingEdgeStart() {
        return !this.sketchSelectionTool && ['polygon', 'line'].includes(this.sketchProfileType) ? this.currentSketchPoints[this.currentSketchPoints.length - 1] : undefined;
    }
    private capturePointer(event: PointerEvent) {
        try { this.renderer.domElement.setPointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
    }
    private releasePointer(event: PointerEvent) {
        try { if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* No active capture. */ }
    }
    private onPointerDown(event: PointerEvent) {
        this.cameraController.cancelTransitions();
        this.pointerStart.set(event.clientX, event.clientY);
        this.raycaster.params.Line.threshold = 1.5;
        if (event.button === 2 && this.measureMode) {
            this.setMeasureMode(false);
            this.callbacks.onMeasureChange(false);
        }
        if (event.button === 2 && !this.sketchMode) this.controls.mouseButtons.RIGHT = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        if (!this.sketchMode && event.button === 2) {
            this.camera.up.set(0, 1, 0);
            this.controls.update();
        }
        if (this.sketchMode && event.button === 2) {
            this.clearSketchReferences();
            event.preventDefault(); event.stopImmediatePropagation();
            this.controls.enableDamping = false;
            this.controls.update();
            const center = this.planeScreenCenter();
            this.viewRotateDrag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, centerX: center.x, centerY: center.y, moved: false };
            this.controls.enabled = false;
            this.capturePointer(event);
            return;
        }
        if (event.button !== 0) return;
        if (this.gizmo.contains(event)) {
            this.clearSketchReferences();
            this.gizmo.start(event, this.sketchMode);
            return;
        }
        if (this.isBooleanActive()) return;
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
            if (this.assetEditor.pointerDown(event, this.sketchAssetRenderer.markers(), this.raycaster)) {
                event.preventDefault(); event.stopImmediatePropagation();
                this.capturePointer(event);
                return;
            }
            const hit = this.raycaster.intersectObjects(this.sketchRenderer.markers(), false)[0];
            if (hit) {
                event.preventDefault(); event.stopImmediatePropagation();
                const handle = hit.object.userData.handleSegment !== undefined;
                const sector = !!hit.object.userData.sectorHandle;
                const center = !!hit.object.userData.centerHandle;
                const index = handle ? hit.object.userData.handleSegment : sector || center ? -1 : hit.object.userData.pointIndex;
                if (event.altKey && this.sketchProfileType === 'polygon' && !handle && !sector && !center && index >= 0) {
                    this.sketchSelectionGuardPointerUp = true;
                    this.sketchSelectionGuardUntil = performance.now() + INTERACTION.sketchSelectionGuardMs;
                    this.callbacks.onSketchPointDelete(index);
                    this.altDeletePoint = -1;
                    this.container.classList.remove('is-delete-point');
                    return;
                }
                const startPoint = this.sketchDragPoint(event)!;
                const gesture = { startX: event.clientX, startY: event.clientY, startPoint, moved: false };
                this.sketchDrag = center ? { index, center: true, ...gesture } : sector ? { index, sector: true, ...gesture } : handle ? { index, handle: hit.object.userData.handleIndex, ...gesture } : { index, ...gesture };
                this.container.classList.add('is-handle-dragging');
                if (!handle && !sector && !center) {
                    this.selectedSketchPoint = index;
                    this.callbacks.onSketchSelect(index, event.metaKey || event.ctrlKey);
                }
                this.controls.enabled = false;
                this.capturePointer(event);
                this.sketchRenderer.updateMarkerColors();
                return;
            }
            if (event.altKey) {
                this.updateSketchCursor(event);
                if (this.altBorderDelete) {
                    event.preventDefault(); event.stopImmediatePropagation();
                    const target = this.altBorderDelete;
                    this.sketchSelectionGuardPointerUp = true;
                    this.sketchSelectionGuardUntil = performance.now() + INTERACTION.sketchSelectionGuardMs;
                    this.callbacks.onSketchBorderDelete(target.entityId, target.index, target.start, target.end);
                    this.clearAltBorder();
                    this.container.classList.remove('is-delete-point');
                    return;
                }
            }
            const borderHit = this.raycaster.intersectObjects(this.sketchRenderer.borderTargets(), false)[0];
            if (borderHit) {
                event.preventDefault(); event.stopImmediatePropagation();
                const entityId = borderHit.object.userData.borderEntityId;
                const entity = this.document?.entities.find((item) => item.id === entityId);
                if (entity) {
                    this.sketchSelectionGuardUntil = performance.now() + INTERACTION.sketchSelectionGuardMs;
                    this.sketchSelectionGuardPointerUp = true;
                    this.shapeDrag = null;
                    this.sketchDrag = null;
                    const additive = event.metaKey || event.ctrlKey;
                    if (borderHit.object.userData.borderWholeOnly) this.callbacks.onSketchEntitySelect(entityId, additive);
                    else this.callbacks.onSketchBorderSelect(entityId, borderHit.object.userData.borderSegmentIndex, additive);
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
            const start = this.sketchOperationPoint(event, { edgeStart: this.drawingEdgeStart() });
            if (start) { this.shapeDrag = { start, moved: false }; this.capturePointer(event); }
            return;
        }
        if (['select', 'offsetFace', 'extrude', 'fillet', 'chamfer'].includes(this.tool)) {
            const arrow = this.hitDirectArrow(event);
            const normal = arrow?.normal || this.geometryAnchor?.localNormal;
            if (arrow && normal && this.geometryAnchor) {
                event.preventDefault(); event.stopImmediatePropagation();
                const anchor = { ...this.geometryAnchor, vertices: this.geometryAnchor.vertices.map((point) => [...point] as Vec3) };
                this.directEditor.start(event, arrow.id, normal, this.geometryAnchor.normal || normal, anchor);
                this.capturePointer(event);
                this.controls.enabled = false;
                this.container.classList.add('is-handle-dragging');
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
    }
    private planeScreenCenter() {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const center = this.sketchRenderer.world([0, 0]).project(this.camera);
        return { x: rect.left + (center.x + 1) * rect.width / 2, y: rect.top + (1 - center.y) * rect.height / 2 };
    }
    private rotatePlaneView(event: PointerEvent, drag: { x: number; y: number; centerX: number; centerY: number }) {
        this.cameraController.rotatePlaneView(event, drag, this.activePlane);
    }
    private onPointerMove(event: PointerEvent) {
        this.lastPointer = { clientX: event.clientX, clientY: event.clientY };
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
            this.rotatePlaneView(event, this.viewRotateDrag);
            this.viewRotateDrag.moved ||= Math.hypot(event.clientX - this.viewRotateDrag.startX, event.clientY - this.viewRotateDrag.startY) > 4;
            this.viewRotateDrag.x = event.clientX;
            this.viewRotateDrag.y = event.clientY;
            return;
        }
        if (this.gizmo.active) {
            this.gizmo.move(event, this.sketchMode);
            return;
        }
        if (this.isBooleanActive()) return;
        if (this.sketchMode && performance.now() < this.sketchSelectionGuardUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (this.assetEditor.move(event)) {
            event.preventDefault(); event.stopImmediatePropagation();
            return;
        }
        if (this.sketchDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!this.sketchDrag.moved) {
                if (Math.hypot(event.clientX - this.sketchDrag.startX, event.clientY - this.sketchDrag.startY) < INTERACTION.sketchDragThresholdPx) return;
                this.sketchDrag.moved = true;
                this.refreshSketchSelectionFeedback();
                if (this.sketchDrag.center) this.callbacks.onSketchCenterMove(this.sketchDrag.startPoint, 'start');
                else if (this.sketchDrag.sector) this.callbacks.onSketchSectorMove(this.sketchDrag.startPoint, 'start');
                else if (this.sketchDrag.handle) this.callbacks.onSketchHandleMove(this.sketchDrag.index, this.sketchDrag.handle, this.sketchDrag.startPoint, 'start');
                else this.callbacks.onSketchPointMove(this.sketchDrag.index, this.sketchDrag.startPoint, 'start');
            }
            const point = this.sketchDragPoint(event);
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
            if (Math.hypot(event.clientX - this.extrudeArrowDrag.x, event.clientY - this.extrudeArrowDrag.y) > 2) this.callbacks.onExtrudeGesture(this.extrudeArrowDrag.profileId, this.extrudeArrowDrag.direction, delta, 'move');
            return;
        }
        if (this.shapeDrag && this.sketchMode) {
            const point = this.sketchOperationPoint(event, { edgeStart: ['polygon', 'line'].includes(this.sketchProfileType) ? this.shapeDrag.start : undefined });
            if (point && this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) {
                this.shapeDrag.moved = true;
                this.callbacks.onSketchDrag(this.shapeDrag.start, point, 'move');
            }
            return;
        }
        if (this.directEditor.active) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.directEditor.move(event, this.camera, this.controls.target);
            return;
        }
        if (this.measureMode && this.sketchMode) {
            if (!event.buttons) this.sketchOperationPoint(event);
            return;
        }
        if (this.measureMode && this.measurePoints.length < 2) {
            const hit = this.hitEntity(event);
            if (hit) this.showHoverFace(hit);
            else this.clearHoverFace();
            return;
        }
        if (this.sketchMode && !event.buttons) {
            this.clearSketchReferences();
            this.updateSketchFaceHover(event);
            this.setSketchHover(null);
            this.updateSketchCursor(event);
        }
        if (!event.buttons && !this.sketchMode) this.updateArrowHover(event);
        if (!event.buttons && !this.sketchMode) {
            const hit = this.hitEntity(event);
            const edgeHit = this.hitEntityEdge(event);
            const sketchId = hit && ['sketch', 'image'].includes(this.document?.entities.find((item) => item.id === hit.object.userData.entityId)?.kind || '') ? hit.object.userData.entityId : null;
            const sketchHits = sketchId ? this.hitSketchEntities(event) : [];
            const intersection = this.sketchIntersectionAnchor(sketchHits);
            this.setSketchHovers(intersection ? [] : sketchHits.map((item) => item.object.userData.entityId));
            if (intersection) {
                this.hoverGeometry = null;
                this.hoverFaceAnchor = intersection;
                this.refreshFaceFeedback();
                return;
            }
            if (edgeHit && (!hit || edgeHit.distance <= hit.distance + 0.5) && !sketchId) {
                this.hoverGeometry = null;
                this.hoverFaceAnchor = this.geometrySelector.createEdgeAnchor(edgeHit, this.includeTangent);
            } else if (hit) {
                const normal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone().transformDirection(hit.object.matrixWorld).toArray() as Vec3;
                this.hoverGeometry = { id: hit.object.userData.entityId, normal, point: hit.point.toArray() };
                this.hoverFaceAnchor = sketchId ? null : this.createGeometryAnchor(hit);
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
            this.clearSketchReferences();
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
            this.controls.enableDamping = true;
            this.controls.enabled = true;
            this.controls.update();
            return;
        }
        if (this.gizmo.active) {
            this.gizmo.finish(event, this.sketchMode, this.activePlane);
            return;
        }
        if (this.sketchMode && event.button === 0 && (this.sketchSelectionGuardPointerUp || performance.now() < this.sketchSelectionGuardUntil)) {
            this.clearSketchReferences();
            event.preventDefault(); event.stopImmediatePropagation();
            this.sketchSelectionGuardPointerUp = false;
            this.shapeDrag = null;
            this.sketchDrag = null;
            return;
        }
        if (this.assetEditor.end(event)) {
            event.preventDefault(); event.stopImmediatePropagation();
            return;
        }
        if (this.sketchDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!this.sketchDrag.moved) {
                if (this.shouldCloseSketchPath(event)) this.callbacks.onSketchClosePath();
                this.sketchDrag = null;
                this.container.classList.remove('is-handle-dragging');
                this.controls.enabled = true;
                return;
            }
            const point = this.sketchDragPoint(event);
            if (point) this.sketchDrag.center ? this.callbacks.onSketchCenterMove(point, 'end') : this.sketchDrag.sector ? this.callbacks.onSketchSectorMove(point, 'end') : this.sketchDrag.handle ? this.callbacks.onSketchHandleMove(this.sketchDrag.index, this.sketchDrag.handle, point, 'end') : this.callbacks.onSketchPointMove(this.sketchDrag.index, point, 'end');
            this.clearSketchReferences();
            this.sketchDrag = null;
            this.container.classList.remove('is-handle-dragging');
            this.controls.enabled = true;
            this.callbacks.onSketchDragEnd();
            this.sketchOperationPoint(event);
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
        if (this.directEditor.active) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.directEditor.end();
            this.callbacks.onDirectDragState({ x: event.clientX, y: event.clientY, active: false });
            this.activeArrowKey = null;
            this.container.classList.remove('is-handle-dragging');
            this.updateArrowColors();
            this.controls.enabled = true;
            return;
        }
        this.updateOrbitRotation();
        if (this.sketchMode && this.shapeDrag) {
            const edgeStart = this.shapeDrag.moved
                ? (['polygon', 'line'].includes(this.sketchProfileType) ? this.shapeDrag.start : undefined)
                : this.drawingEdgeStart();
            const point = this.sketchOperationPoint(event, { edgeStart });
            if (point && this.shapeDrag.moved) this.callbacks.onSketchDrag(this.shapeDrag.start, point, 'end');
            else if (point && this.shouldCloseSketchPath(event)) this.callbacks.onSketchClosePath();
            else if (point) { this.callbacks.onSketchPoint(point); this.callbacks.onSketchSelect(-1); }
            this.clearSketchReferences();
            this.shapeDrag = null;
            return;
        }
        if (event.button !== 0 || this.transform.dragging) return;
        if (this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
        if (this.measureMode) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (this.sketchMode) {
                const point = this.sketchOperationPoint(event);
                if (point) this.addSketchMeasurePoint(point);
                return;
            }
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
            if (this.shouldCloseSketchPath(event)) {
                this.callbacks.onSketchClosePath();
                return;
            }
            const point = this.sketchOperationPoint(event, { edgeStart: this.drawingEdgeStart() });
            if (point) { this.callbacks.onSketchPoint(point); this.callbacks.onSketchSelect(-1); }
            this.clearSketchReferences();
            return;
        }
        if (this.isBooleanActive()) {
            const hit = this.hitEntity(event);
            // Let OrbitControls receive the same pointerup; swallowing it leaves navigation stuck after Done.
            if (!hit) this.callbacks.onBlankCommit();
            return;
        }
        const hit = this.hitEntity(event);
        const edgeHit = this.hitEntityEdge(event);
        const vertexHit = this.hitEntityVertex(event);
        const additive = event.metaKey || event.ctrlKey || event.shiftKey;
        const planeHit = this.tool === 'select' && !this.sketchMode ? this.hitPlane(event) : null;
        const hitIsSketch = !!hit && ['sketch', 'image'].includes(this.document?.entities.find((item) => item.id === hit.object.userData.entityId)?.kind || '');
        if (planeHit && (!hit || (!hitIsSketch && planeHit.distance < hit.distance))) { this.callbacks.onPlaneSelect(planeHit.id); return; }
        if (hit && hitIsSketch) {
            const hits = this.hitSketchEntities(event);
            const intersection = this.sketchIntersectionAnchor(hits);
            const openSketch = this.document?.entities.find((item) => item.id === hit.object.userData.entityId && item.kind === 'sketch' && !entityProfileClosed(item));
            if (!intersection && openSketch) { this.geometryAnchor = this.hoverFaceAnchor = null; this.callbacks.onBodySelect(openSketch.id); return; }
            const normal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone().transformDirection(hit.object.matrixWorld).toArray() as Vec3;
            this.geometryAnchor = intersection || this.createGeometryAnchor(hit);
            this.hoverFaceAnchor = null;
            const selectedHits = intersection ? [hits[0]] : hits;
            selectedHits.forEach((sketchHit, index) => this.callbacks.onGeometrySelect(sketchHit.object.userData.entityId, 'face', normal, sketchHit.point.toArray() as Vec3, additive || index > 0, intersection?.profilePoints));
            return;
        }
        if (vertexHit && (!hit || vertexHit.distance <= hit.distance + 2)) {
            const anchor = this.geometrySelector.createVertexAnchor(vertexHit);
            if (anchor) {
                this.geometryAnchor = anchor;
                this.hoverFaceAnchor = null;
                this.callbacks.onGeometrySelect(anchor.id, 'vertex', anchor.normal, anchor.point, additive);
                return;
            }
        }
        if (edgeHit && (!hit || edgeHit.distance <= hit.distance + 2)) {
            this.geometryAnchor = this.geometrySelector.createEdgeAnchor(edgeHit, this.includeTangent);
            this.hoverFaceAnchor = null;
            this.callbacks.onGeometrySelect(this.geometryAnchor.id, 'edge', this.geometryAnchor.normal, this.geometryAnchor.point, additive);
        } else if (hit) {
            const normal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone().transformDirection(hit.object.matrixWorld).toArray();
            this.geometryAnchor = this.createGeometryAnchor(hit);
            this.hoverFaceAnchor = null;
            this.callbacks.onGeometrySelect(hit.object.userData.entityId, this.geometryAnchor.type, normal, this.geometryAnchor.point, additive);
        } else if (['extrude', 'offsetFace'].includes(this.tool)) this.callbacks.onBlankCommit();
        else this.callbacks.onSelect(null, additive);
    }
    private createGeometryAnchor(hit: THREE.Intersection): GeometryAnchor {
        const entity = this.document?.entities.find((item) => item.id === hit.object.userData.entityId);
        return this.geometrySelector.createFaceAnchor(hit, entity, this.includeTangent);
    }
    private updateSketchCursor(event: PointerEvent) {
        this.setPointer(event);
        this.container.classList.toggle('is-link-cursor', this.shouldCloseSketchPath(event));
        const marker = this.raycaster.intersectObjects(this.sketchRenderer.markers(), false)[0];
        const pointIndex = marker?.object.userData.pointIndex;
        this.altDeletePoint = event.altKey && this.sketchProfileType === 'polygon' && pointIndex >= 0 && !marker?.object.userData.centerHandle ? pointIndex : -1;
        if (this.altDeletePoint >= 0) this.clearAltBorder();
        else if (event.altKey) this.updateAltBorder(event);
        else this.clearAltBorder();
        this.container.classList.toggle('is-delete-point', this.altDeletePoint >= 0 || !!this.altBorderDelete);
        this.container.classList.toggle('is-handle-hover', !!marker && this.altDeletePoint < 0);
        const border = this.raycaster.intersectObjects(this.sketchRenderer.borderTargets(), false)[0];
        this.hoverBorder = border ? { entityId: border.object.userData.borderEntityId, index: border.object.userData.borderSegmentIndex } : null;
        if (!event.altKey) this.applyBorderHoverColors();
        const segment = this.raycaster.intersectObjects(this.sketch.children.filter((item) => item.userData.segmentIndex !== undefined), false)[0];
        this.sketchHoverSegment = segment ? segment.object.userData.segmentIndex : -1;
        this.container.classList.toggle('is-border-hover', !!border && !marker);
        this.sketchRenderer.updateMarkerColors();
        this.sketchRenderer.updateSegmentColors();
    }
    private shouldCloseSketchPath(event: PointerEvent) { return this.sketchRenderer.shouldClosePath(event); }
    private refreshSketchSelectionFeedback() { this.sketchRenderer.refreshSelectionFeedback(); }
    private clearAltBorder() { this.sketchRenderer.clearAltBorder(); }
    private applyBorderHoverColors() { this.sketchRenderer.applyBorderHoverColors(); }
    private updateAltBorder(event: PointerEvent) { this.sketchRenderer.updateAltBorder(event); }
    private updateSketchFaceHover(event: PointerEvent) { this.sketchRenderer.updateFaceHover(event); }
    private setSketchHover(id: string | null) { this.sceneSynchronizer.setSketchHover(id); }
    private setSketchHovers(ids: string[]) { this.sceneSynchronizer.setSketchHovers(ids); }
    private refreshFaceFeedback() { this.guideRenderer.refreshFaceFeedback(); }
    private clearHoverFace() { this.measurementRenderer.clearHoverFace(); }
    private showHoverFace(hit: THREE.Intersection) { this.measurementRenderer.showHoverFace(hit); }
    private addMeasurePoint(point: THREE.Vector3) { this.measurementRenderer.addPoint(point); }
    private addSketchMeasurePoint(point: Point2) { this.measurementRenderer.addSketchPoint(this.sketchRenderer.world(point, 0.4)); }
    private onDoubleClick(event: MouseEvent) {
        if (this.measureMode) return;
        if (this.sketchMode) {
            event.preventDefault();
            this.setPointer(event as unknown as PointerEvent);
            this.sketch.updateMatrixWorld(true);
            const border = this.raycaster.intersectObjects(this.sketchRenderer.borderTargets(), false)[0];
            if (border && !this.document?.entities.find((entity) => entity.id === border.object.userData.borderEntityId)?.trimmed) {
                this.callbacks.onSketchEntitySelect(border.object.userData.borderEntityId, false);
                return;
            }
            const handle = this.raycaster.intersectObjects(this.sketch.children.filter((item) => item.userData.handleSegment !== undefined), false)[0];
            if (handle) {
                this.callbacks.onSketchHandleReset(handle.object.userData.handleSegment, handle.object.userData.handleIndex);
                return;
            }
            const sector = this.raycaster.intersectObjects(this.sketch.children.filter((item) => item.userData.sectorHandle), false)[0];
            if (sector) this.callbacks.onSketchSectorReset();
            return;
        } else {
            const hit = this.hitEntity(event as unknown as PointerEvent);
            if (hit && !['sketch', 'image'].includes(this.document?.entities.find((item) => item.id === hit.object.userData.entityId)?.kind || '')) this.callbacks.onBodySelect(hit.object.userData.entityId);
        }
    }
    setMeasureMode(active: boolean) {
        this.measureMode = active;
        this.container.classList.toggle('is-measuring', active);
        this.measurementRenderer.clear();
        this.clearSketchReferences();
        this.updateOrbitRotation();
    }
    clearGeometrySelection() {
        this.geometryAnchor = null;
        this.hoverFaceAnchor = null;
        this.transform.detach();
        this.clearHoverFace();
        this.refreshFaceFeedback();
        if (this.document) this.guideRenderer.update(this.document);
    }
    offsetGeometryAnchor(offset: Vec3) {
        if (!this.geometryAnchor) return;
        const delta = new THREE.Vector3(...offset);
        this.geometryAnchor = {
            ...this.geometryAnchor,
            point: new THREE.Vector3(...this.geometryAnchor.point).add(delta).toArray(),
            vertices: this.geometryAnchor.vertices.map((point) => new THREE.Vector3(...point).add(delta).toArray()),
        };
    }
    resetSketchGesture() {
        this.sketchDrag = null;
        this.assetEditor.reset();
        this.shapeDrag = null;
    }
    clearSurfaceCache() {
        this.geometrySelector.clear();
    }
    dispose() {
        this.directEditor.dispose();
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('pointerdown', this.onPointerDown, true);
        canvas.removeEventListener('pointermove', this.onPointerMove, true);
        canvas.removeEventListener('pointerup', this.onPointerUp, true);
        canvas.removeEventListener('pointercancel', this.onPointerCancel, true);
        canvas.removeEventListener('pointerleave', this.onPointerLeave);
        canvas.removeEventListener('dblclick', this.onDoubleClick);
        canvas.removeEventListener('contextmenu', this.onContextMenu);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('keydown', this.onAltKey);
        window.removeEventListener('keyup', this.onAltKey);
        window.removeEventListener('blur', this.onKeyUp);
        window.removeEventListener('blur', this.onWindowBlur);
        this.selectionRectangle.remove();
    }
}
