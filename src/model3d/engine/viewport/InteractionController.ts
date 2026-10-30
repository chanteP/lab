import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { matchSketchGuide } from '../sketchGuides';
import { INTERACTION } from '../../config/const';
import type { Point2, Vec3 } from '../../types';
import type { ViewTool, ViewportCallbacks } from '../Viewport';
import type { CameraController } from './CameraController';
import type { ViewportEngine } from './ViewportEngine';
import type { SceneSynchronizer } from './SceneSynchronizer';
import type { SketchRenderer } from './SketchRenderer';
import type { GuideRenderer, GeometryAnchor } from './GuideRenderer';
import type { MeasurementRenderer } from './MeasurementRenderer';

type SketchGuideOptions = { edgeStart?: Point2; excludeEntityId?: string; excludePointIndex?: number; disabled?: boolean };

interface InteractionOptions {
    container: HTMLElement;
    engine: ViewportEngine;
    cameraController: CameraController;
    sceneSynchronizer: SceneSynchronizer;
    sketchRenderer: SketchRenderer;
    guideRenderer: GuideRenderer;
    measurementRenderer: MeasurementRenderer;
    transform: TransformControls;
    callbacks: ViewportCallbacks;
    getTool: () => ViewTool;
    isSketchMode: () => boolean;
}

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
    private readonly guideRenderer: GuideRenderer;
    private readonly measurementRenderer: MeasurementRenderer;
    private readonly transform: TransformControls;
    private readonly callbacks: ViewportCallbacks;
    private readonly getTool: () => ViewTool;
    private readonly isSketchMode: () => boolean;
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();
    private readonly pointerStart = new THREE.Vector2();
    private shapeDrag: { start: Point2; moved: boolean } | null = null;
    private viewRotateDrag: { x: number; y: number; startX: number; startY: number; centerX: number; centerY: number; moved: boolean } | null = null;
    private sketchSegmentHandled = false;
    private sketchSelectionGuardUntil = 0;
    private sketchSelectionGuardPointerUp = false;
    private spaceSketchPointerBlocked = false;
    private lastPointer: { clientX: number; clientY: number } | null = null;
    private directDrag: { id: string; normal: Vec3; worldNormal: Vec3; x: number; y: number } | null = null;
    private extrudeArrowDrag: { profileId: string; direction: 1 | -1; worldNormal: Vec3; x: number; y: number } | null = null;
    private gizmoDrag: { x: number; y: number; centerX: number; centerY: number; moved: boolean } | null = null;
    private hoverGeometry: { id: string; normal: Vec3; point: Vec3 } | null = null;
    private marquee: { startX: number; startY: number; x: number; y: number; additive: boolean; moved: boolean } | null = null;
    private readonly selectionRectangle: HTMLDivElement;
    private readonly surfaceCache = new Map<string, { vertices: Vec3[]; indices: number[]; point: Vec3 }>();
    private spacePressed = false;
    private spaceDragMoved = false;
    private spaceHover: { id: string; normal: Vec3; point: Vec3 } | null = null;
    private sketchGuideSnapEnabled = true;

    private get renderer() { return this.engine.renderer; }
    private get camera() { return this.cameraController.camera; }
    private get controls() { return this.cameraController.controls; }
    private get viewHelper() { return this.cameraController.viewHelper; }
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
        this.guideRenderer = options.guideRenderer;
        this.measurementRenderer = options.measurementRenderer;
        this.transform = options.transform;
        this.callbacks = options.callbacks;
        this.getTool = options.getTool;
        this.isSketchMode = options.isSketchMode;

        this.selectionRectangle = window.document.createElement('div');
        this.selectionRectangle.className = 'selection-rectangle';
        this.selectionRectangle.style.display = 'none';
        this.container.appendChild(this.selectionRectangle);

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onAltKey = this.onAltKey.bind(this);
        this.onPointerLeave = this.onPointerLeave.bind(this);
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown, true);
        canvas.addEventListener('pointermove', this.onPointerMove, true);
        canvas.addEventListener('pointerup', this.onPointerUp, true);
        canvas.addEventListener('pointercancel', this.onPointerUp, true);
        canvas.addEventListener('pointerleave', this.onPointerLeave);
        canvas.addEventListener('dblclick', this.onDoubleClick);
        canvas.addEventListener('contextmenu', this.onContextMenu);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('keydown', this.onAltKey);
        window.addEventListener('keyup', this.onAltKey);
        window.addEventListener('blur', this.onKeyUp);
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
        return this.raycaster.intersectObjects(this.model.children, false).find((item) => this.isVisible(item.object));
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

    private updateArrowColors() { this.guideRenderer.updateArrowColors(); }

    private isVisible(object: THREE.Object3D) {
        let current: THREE.Object3D | null = object;
        while (current && current !== this.engine.scene) {
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
    sketchPoint(event: PointerEvent): Point2 | null {
        if (!this.activePlane) return null;
        this.setPointer(event);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...this.activePlane.normal), new THREE.Vector3(...this.activePlane.origin));
        const point = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(plane, point)) return null;
        point.sub(new THREE.Vector3(...this.activePlane.origin));
        return [Math.round(point.dot(new THREE.Vector3(...this.activePlane.u)) * 10) / 10,
            Math.round(point.dot(new THREE.Vector3(...this.activePlane.v)) * 10) / 10];
    }

    private clearSketchReferences() { this.sketchRenderer.clearReferences(); }
    private sketchUnitsPerPixel() { return this.sketchRenderer.unitsPerPixel(); }

    setSketchGuideSnapEnabled(active: boolean) { this.sketchGuideSnapEnabled = active; }

    private sketchOperationPoint(event: PointerEvent, options: SketchGuideOptions = {}) {
        const point = this.sketchPoint(event);
        if (!point || options.disabled || !this.document || !this.activePlane) {
            this.clearSketchReferences();
            return point;
        }
        const match = matchSketchGuide({
            entities: this.document.entities.filter((item) => item.kind === 'sketch' && item.planeId === this.activePlane!.id),
            point,
            origins: [
                { id: 'plane', point: [0, 0] },
                { id: 'world', point: (() => {
                    const offset = new THREE.Vector3(...this.activePlane!.origin).negate();
                    return [offset.dot(new THREE.Vector3(...this.activePlane!.u)), offset.dot(new THREE.Vector3(...this.activePlane!.v))];
                })() },
            ],
            edgeStart: options.edgeStart,
            excludeEntityId: options.excludeEntityId || (!['polygon', 'line', 'arc'].includes(this.sketchProfileType) ? this.editingSketchId || undefined : undefined),
            excludePoint: options.excludePointIndex !== undefined && this.editingSketchId ? { entityId: this.editingSketchId, index: options.excludePointIndex } : undefined,
            threshold: this.sketchUnitsPerPixel() * INTERACTION.sketchGuideSnapPx,
        });
        if (match) this.sketchRenderer.renderReference(match);
        else this.clearSketchReferences();
        return match && this.sketchGuideSnapEnabled ? match.point : point;
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
        if (this.isGizmoEvent(event)) {
            this.clearSketchReferences();
            if (!this.sketchMode) this.camera.up.set(0, 1, 0);
            event.preventDefault(); event.stopImmediatePropagation();
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.gizmoDrag = { x: event.clientX, y: event.clientY, centerX: rect.right - 64, centerY: rect.bottom - 76, moved: false };
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
                    this.callbacks.onSketchBorderSelect(entityId, borderHit.object.userData.borderSegmentIndex, additive);
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

    private snapPlaneCamera(force = false) { this.cameraController.snapPlaneCamera(this.activePlane, force); }

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
        if (this.gizmoDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            const dx = event.clientX - this.gizmoDrag.x;
            const dy = event.clientY - this.gizmoDrag.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) this.gizmoDrag.moved = true;
            if (this.sketchMode) {
                this.rotatePlaneView(event, this.gizmoDrag);
                this.gizmoDrag.x = event.clientX;
                this.gizmoDrag.y = event.clientY;
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
            this.gizmoDrag = { x: event.clientX, y: event.clientY, centerX: this.gizmoDrag.centerX, centerY: this.gizmoDrag.centerY, moved: true };
            return;
        }
        if (this.sketchMode && performance.now() < this.sketchSelectionGuardUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
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
            if (Math.hypot(event.clientX - this.extrudeArrowDrag.x, event.clientY - this.extrudeArrowDrag.y) > 2) this.callbacks.onExtrudeGesture(this.extrudeArrowDrag.profileId, this.extrudeArrowDrag.direction, Math.max(0.1, delta), 'move');
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
        if (this.sketchMode && !event.buttons) {
            this.clearSketchReferences();
            this.updateSketchFaceHover(event);
            this.setSketchHover(null);
            this.updateSketchCursor(event);
        }
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
        if (this.gizmoDrag) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (!this.gizmoDrag.moved) this.sketchMode ? this.snapPlaneCamera(true) : this.viewHelper.handleClick(event);
            this.gizmoDrag = null;
            this.controls.enabled = true;
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
    private refreshFaceFeedback() { this.guideRenderer.refreshFaceFeedback(); }
    private clearHoverFace() { this.measurementRenderer.clearHoverFace(); }
    private showHoverFace(hit: THREE.Intersection) { this.measurementRenderer.showHoverFace(hit); }
    private addMeasurePoint(point: THREE.Vector3) { this.measurementRenderer.addPoint(point); }

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
            if (hit) this.callbacks.onBodySelect(hit.object.userData.entityId);
        }
    }

    setMeasureMode(active: boolean) {
        this.measureMode = active;
        this.container.classList.toggle('is-measuring', active);
        this.measurementRenderer.clear();
        this.updateOrbitRotation();
    }

    clearGeometrySelection() {
        this.geometryAnchor = null;
        this.hoverFaceAnchor = null;
        this.transform.detach();
        this.clearHoverFace();
        this.refreshFaceFeedback();
    }

    resetSketchGesture() {
        this.sketchDrag = null;
        this.shapeDrag = null;
    }

    clearSurfaceCache() {
        this.surfaceCache.clear();
    }

    dispose() {
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('pointerdown', this.onPointerDown, true);
        canvas.removeEventListener('pointermove', this.onPointerMove, true);
        canvas.removeEventListener('pointerup', this.onPointerUp, true);
        canvas.removeEventListener('pointercancel', this.onPointerUp, true);
        canvas.removeEventListener('pointerleave', this.onPointerLeave);
        canvas.removeEventListener('dblclick', this.onDoubleClick);
        canvas.removeEventListener('contextmenu', this.onContextMenu);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('keydown', this.onAltKey);
        window.removeEventListener('keyup', this.onAltKey);
        window.removeEventListener('blur', this.onKeyUp);
        this.selectionRectangle.remove();
    }
}


