import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { profileArcCenter, profileClosed, profileEllipsePoint, profilePoints, type ProfileType, type ProfileCurves } from '../profiles';
import { borderInterval, borderSegments, sliceBorder } from '../sketchBorders';
import { computeSketchFaces, type SketchFace } from '../sketchFaces';
import type { SketchGuideResult } from '../sketchGuides';
import { SKETCH_COLORS } from '../../config/colors';
import { SKETCH_STYLE } from '../../config/const';
import type { LengthUnit, ModelDocument, ModelEntity, Point2, SketchElementRef, SketchEdgeConstraint, SketchPlane } from '../../types';
import type { SketchDimension } from '../Viewport';
import { clearGroup, createFatLine } from './renderUtils';
import type { OverlayController } from './OverlayController';

type SketchDragState = { index: number; handle?: 1 | 2; sector?: boolean; center?: boolean; moved: boolean } | null;

interface SketchRendererOptions {
    container: HTMLElement;
    renderer: THREE.WebGLRenderer;
    overlay: OverlayController;
    getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera;
    getTarget: () => THREE.Vector3;
    getDocument: () => ModelDocument | null;
    getActivePlane: () => SketchPlane | null;
    getEditingSketchId: () => string | null;
    getModel: () => THREE.Group;
    getSketchDrag: () => SketchDragState;
    isSketchMode: () => boolean;
    planeMatrix: (plane: SketchPlane) => THREE.Matrix4;
    raycast: (event: PointerEvent, targets: THREE.Object3D[]) => THREE.Intersection[];
    raycastPoint: (event: PointerEvent) => Point2 | null;
}

/** Sketch geometry, handles, reference overlays, closed faces and selection feedback. */
export class SketchRenderer {
    readonly group = new THREE.Group();
    readonly trimFeedback = new THREE.Group();
    readonly references = new THREE.Group();
    readonly faces = new THREE.Group();
    readonly selectionFeedback = new THREE.Group();
    selectedEdgeRefs: SketchElementRef[] = [];
    selectedPointRefs: SketchElementRef[] = [];
    activeConstraintRule: { entityId: string; index: number; ruleId: string } | null = null;
    activeConstraintReference: SketchElementRef | null = null;
    hoverSketchFace: THREE.Mesh | null = null;
    selectedSketchPoint = -1;
    activeSketchSegment = -1;
    profileType: ProfileType = 'polygon';
    currentPoints: Point2[] = [];
    selectionTool = false;
    hoverSegment = -1;
    hoverBorder: { entityId: string; index: number } | null = null;
    altDeletePoint = -1;
    altBorderDelete: { entityId: string; index: number; start: number; end: number } | null = null;

    constructor(private readonly options: SketchRendererOptions) {}

    world([u, v]: Point2, offset = 0.12) {
        const plane = this.options.getActivePlane();
        if (!plane) return new THREE.Vector3(u, offset, v);
        return new THREE.Vector3(...plane.origin)
            .add(new THREE.Vector3(...plane.u).multiplyScalar(u))
            .add(new THREE.Vector3(...plane.v).multiplyScalar(v))
            .add(new THREE.Vector3(...plane.normal).multiplyScalar(offset));
    }

    unitsPerPixel() {
        const height = Math.max(1, this.options.renderer.domElement.clientHeight);
        const camera = this.options.getCamera();
        if (camera instanceof THREE.OrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / height;
        const distance = camera.position.distanceTo(this.options.getTarget());
        return 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
    }

    private setScreenRadius(object: THREE.Mesh, pixels: number) {
        object.userData.screenRadius = { radius: (object.geometry as THREE.SphereGeometry).parameters.radius, pixels };
        this.updateScreenRadius(object);
    }

    private updateScreenRadius(object: THREE.Object3D) {
        const data = object.userData.screenRadius as { radius: number; pixels: number } | undefined;
        if (!data) return;
        const camera = this.options.getCamera();
        const position = object.getWorldPosition(new THREE.Vector3());
        const unitsPerPixel = camera instanceof THREE.OrthographicCamera
            ? this.unitsPerPixel()
            : 2 * position.distanceTo(camera.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, this.options.renderer.domElement.clientHeight);
        object.scale.setScalar(unitsPerPixel * data.pixels / data.radius);
    }

    updateScreenSpaceMarkers() {
        [this.group, this.references, this.selectionFeedback].forEach((group) => group.traverse((object) => this.updateScreenRadius(object)));
    }

    clearReferences() {
        clearGroup(this.references);
    }

    renderReference(result: SketchGuideResult) {
        this.clearReferences();
        const span = Math.max(10, this.unitsPerPixel() * this.options.renderer.domElement.clientHeight * 1.5);
        result.matches.forEach((match) => {
            const direction = new THREE.Vector2(match.b[0] - match.a[0], match.b[1] - match.a[1]).normalize();
            const a = this.world([match.a[0] - direction.x * span, match.a[1] - direction.y * span], 0.2);
            const b = this.world([match.a[0] + direction.x * span, match.a[1] + direction.y * span], 0.2);
            const color = match.reference.kind === 'origin' ? SKETCH_COLORS.guide : SKETCH_COLORS.reference;
            const guide = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([a, b]),
                new THREE.LineDashedMaterial({ color, dashSize: this.unitsPerPixel() * 7, gapSize: this.unitsPerPixel() * 4, depthTest: false, depthWrite: false }),
            );
            guide.computeLineDistances();
            guide.renderOrder = 1000;
            this.references.add(guide);

            if (match.reference.kind === 'line') {
                const border = this.createFatLine([this.world(match.reference.a, 0.22), this.world(match.reference.b, 0.22)]);
                (border.material as LineMaterial).color.set(SKETCH_COLORS.reference);
                border.renderOrder = 1002;
                this.references.add(border);
            } else if (match.reference.kind === 'point') {
                const marker = new THREE.Mesh(new THREE.SphereGeometry(SKETCH_STYLE.referencePointRadius, 16, 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.reference, depthTest: false, depthWrite: false }));
                marker.position.copy(this.world(match.reference.point, 0.24));
                this.setScreenRadius(marker, SKETCH_STYLE.referencePointPx);
                marker.renderOrder = 1004;
                this.references.add(marker);
            }
        });
    }

    setSelectionState(edges: SketchElementRef[], points: SketchElementRef[]) {
        this.selectedEdgeRefs = edges.map((item) => ({ ...item }));
        this.selectedPointRefs = points.map((item) => ({ ...item }));
        this.refreshSelectionFeedback();
    }

    setActiveConstraintRule(selection: { entityId: string; index: number; ruleId: string } | null, reference: SketchElementRef | null = null) {
        this.activeConstraintRule = selection;
        this.activeConstraintReference = reference;
        this.refreshSelectionFeedback();
    }

    refreshSelectionFeedback() {
        clearGroup(this.selectionFeedback);
        this.options.overlay.clear('sketch-lock:');
        const document = this.options.getDocument();
        const activePlane = this.options.getActivePlane();
        if (!this.options.isSketchMode() || !document) return;
        document.entities.filter((entity) => entity.kind === 'sketch' && entity.planeId === activePlane?.id).forEach((entity) => {
            (entity.lockedPoints || []).forEach((index) => {
                const point = entity.points?.[index];
                if (point) this.addLockBadge(point, entity.id, index, false);
            });
            (entity.constraintEdges || []).forEach((index) => {
                const a = entity.points?.[index], b = entity.points?.[(index + 1) % (entity.points?.length || 0)];
                if (a && b) this.addLockBadge([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], entity.id, index, true);
            });
            Object.entries(entity.edgeConstraints || {}).forEach(([key, value]) => {
                const index = Number(key), a = entity.points?.[index], b = entity.points?.[(index + 1) % (entity.points?.length || 0)];
                if (!a || !b) return;
                const rules = Array.isArray(value) ? value : [value];
                rules.forEach((rule, order) => this.addLockBadge([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], entity.id, index, true, rule, order));
            });
        });
        this.selectedEdgeRefs.forEach(({ entityId, index }, order) => {
            const entity = document.entities.find((item) => item.id === entityId);
            const segment = entity && borderSegments(entity).find((item) => item.index === index);
            if (!segment) return;
            const line = this.createFatLine(segment.points.map((point) => this.world(point, 0.25)), segment.closed);
            const material = line.material as LineMaterial;
            material.color.set(order === 0 && this.selectedEdgeRefs.length > 1 ? SKETCH_COLORS.referenceActive : SKETCH_COLORS.active);
            material.opacity = 1;
            line.renderOrder = 1005;
            this.selectionFeedback.add(line);
        });
        this.selectedPointRefs.forEach(({ entityId, index }) => {
            const drag = this.options.getSketchDrag();
            if (drag?.moved && entityId === this.options.getEditingSketchId() && index === drag.index) return;
            const entity = document.entities.find((item) => item.id === entityId);
            const point = entity?.points?.[index];
            if (!point) return;
            const outer = new THREE.Mesh(new THREE.SphereGeometry(SKETCH_STYLE.markerOuterRadius, 16, 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.border, depthTest: false, depthWrite: false }));
            const inner = new THREE.Mesh(new THREE.SphereGeometry(SKETCH_STYLE.markerInnerRadius, 16, 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.active, depthTest: false, depthWrite: false }));
            outer.position.copy(this.world(point, 0.26));
            inner.position.copy(this.world(point, 0.28));
            this.setScreenRadius(outer, SKETCH_STYLE.markerOuterPx);
            this.setScreenRadius(inner, SKETCH_STYLE.markerInnerPx);
            outer.renderOrder = inner.renderOrder = 1006;
            this.selectionFeedback.add(outer, inner);
        });
    }

    private addLockBadge(point: Point2, entityId: string, index: number, edge: boolean, rule?: SketchEdgeConstraint, order = 0) {
        const active = !!rule && this.activeConstraintRule?.ruleId === rule.id;
        const linked = !!(rule && this.activeConstraintRule && this.activeConstraintRule.ruleId !== rule.id && this.activeConstraintReference?.entityId === entityId && this.activeConstraintReference.index === index);
        this.options.overlay.set({
            id: `sketch-lock:${rule?.id || `${entityId}:${edge ? 'edge' : 'point'}:${index}`}`,
            kind: 'lock',
            position: this.world(point, 0.32).toArray(),
            entityId,
            index,
            edge,
            rule,
            order,
            active,
            linked,
            color: active ? SKETCH_COLORS.active : linked ? SKETCH_COLORS.referenceActive : SKETCH_COLORS.pointLocked,
        });
    }

    setSelection(index: number) {
        this.selectedSketchPoint = index;
        this.updateMarkerColors();
    }

    shouldClosePath(event: PointerEvent) {
        return event.shiftKey && !this.selectionTool && this.profileType === 'polygon' && this.currentPoints.length > 2;
    }

    markers() {
        return this.group.children.filter((item) => item.userData.pointIndex !== undefined || item.userData.handleSegment !== undefined || item.userData.sectorHandle || item.userData.centerHandle);
    }

    updateSegmentColors() {
        this.group.children.forEach((object) => {
            if (object.userData.segmentIndex === undefined) return;
            const material = (object as THREE.Line).material as THREE.LineBasicMaterial;
            const hovered = object.userData.segmentIndex === this.hoverSegment;
            material.color.set(hovered ? SKETCH_COLORS.hover : SKETCH_COLORS.edge);
            material.transparent = hovered;
            material.opacity = hovered ? 0.55 : 1;
        });
    }

    borderTargets() {
        const targets: THREE.Object3D[] = [];
        const modelEntities = new Set<string>();
        this.options.getModel().traverse((object) => {
            if (!object.userData.borderEntityId) return;
            targets.push(object);
            modelEntities.add(object.userData.borderEntityId);
        });
        this.group.children.forEach((object) => {
            if (object.userData.borderEntityId && !modelEntities.has(object.userData.borderEntityId)) targets.push(object);
        });
        return targets;
    }

    clearAltBorder() {
        this.altBorderDelete = null;
        clearGroup(this.trimFeedback);
        this.applyBorderHoverColors();
    }

    applyBorderHoverColors() {
        this.borderTargets().forEach((object) => {
            const hovered = this.hoverBorder?.entityId === object.userData.borderEntityId && this.hoverBorder.index === object.userData.borderSegmentIndex;
            const material = (object as THREE.Line).material as THREE.Material & { color: THREE.Color; opacity: number; transparent: boolean };
            material.color.set(hovered ? SKETCH_COLORS.hover : SKETCH_COLORS.edge);
            material.transparent = hovered;
            material.opacity = hovered ? 0.55 : 1;
        });
    }

    updateAltBorder(event: PointerEvent) {
        this.clearAltBorder();
        const document = this.options.getDocument();
        const activePlane = this.options.getActivePlane();
        if (!document || !activePlane) return;
        const hit = this.options.raycast(event, this.borderTargets())[0];
        const point = this.options.raycastPoint(event);
        if (!hit || !point) return;
        const entityId = hit.object.userData.borderEntityId;
        const index = hit.object.userData.borderSegmentIndex;
        const entity = document.entities.find((item) => item.id === entityId);
        const segment = entity && borderSegments(entity).find((item) => item.index === index);
        if (!segment) return;
        const all = document.entities.filter((item) => item.kind === 'sketch' && item.planeId === activePlane.id).flatMap((item) => borderSegments(item));
        const interval = borderInterval(segment, all, point);
        this.altBorderDelete = { entityId, index, ...interval };
        if (interval.start <= 0 && interval.end >= 1) {
            const material = (hit.object as THREE.Line).material as THREE.Material & { color: THREE.Color; opacity: number; transparent: boolean };
            material.color.set(SKETCH_COLORS.deletePoint);
            material.transparent = false;
            material.opacity = 1;
        } else {
            const border = this.createFatLine(sliceBorder(segment, interval.start, interval.end).map((value) => this.world(value)));
            (border.material as LineMaterial).color.set(SKETCH_COLORS.deletePoint);
            this.trimFeedback.add(border);
        }
        this.options.container.classList.add('is-delete-point');
    }

    private createFatLine(points: THREE.Vector3[], closed = false, segmentIndex?: number) {
        return createFatLine(points, this.options.renderer.domElement.clientWidth, this.options.renderer.domElement.clientHeight, closed, segmentIndex);
    }

    private hatchMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(SKETCH_COLORS.line) } },
            vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `uniform vec3 uColor; varying vec2 vUv; void main() { float stripe = mod(vUv.x + vUv.y, ${SKETCH_STYLE.hatchSpacing.toFixed(3)}); if (stripe > ${SKETCH_STYLE.hatchLineWidth.toFixed(3)}) discard; gl_FragColor = vec4(uColor, ${SKETCH_STYLE.hatchOpacity.toFixed(3)}); }`,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
    }

    refreshFaces() {
        clearGroup(this.faces);
        this.hoverSketchFace = null;
        const document = this.options.getDocument();
        const activePlane = this.options.getActivePlane();
        if (!this.options.isSketchMode() || !document || !activePlane) return;
        const faces = computeSketchFaces(document.entities, activePlane.id);
        faces.forEach((face: SketchFace, index) => {
            const shape = new THREE.Shape();
            shape.moveTo(...face.points[0]);
            face.points.slice(1).forEach((point) => shape.lineTo(...point));
            shape.closePath();
            const geometry = new THREE.ShapeGeometry(shape);
            const matrix = this.options.planeMatrix(activePlane);
            const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.fill, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
            fill.geometry.applyMatrix4(matrix);
            fill.position.add(new THREE.Vector3(...activePlane.normal).multiplyScalar(0.04));
            fill.renderOrder = 1;
            fill.userData.sketchFace = index;
            const hatch = new THREE.Mesh(geometry.clone(), this.hatchMaterial());
            hatch.position.copy(fill.position);
            hatch.renderOrder = 2;
            this.faces.add(fill, hatch);
        });
    }

    updateFaceHover(event: PointerEvent) {
        if (this.options.raycast(event, this.borderTargets()).length) {
            if (this.hoverSketchFace) {
                const material = this.hoverSketchFace.material as THREE.MeshBasicMaterial;
                material.color.set(SKETCH_COLORS.fill);
                material.opacity = 0.12;
                this.hoverSketchFace = null;
            }
            return;
        }
        const hit = this.options.raycast(event, this.faces.children.filter((object) => object.userData.sketchFace !== undefined))[0];
        const next = hit?.object as THREE.Mesh || null;
        if (next === this.hoverSketchFace) return;
        if (this.hoverSketchFace) {
            const material = this.hoverSketchFace.material as THREE.MeshBasicMaterial;
            material.color.set(SKETCH_COLORS.fill);
            material.opacity = 0.12;
        }
        this.hoverSketchFace = next;
        if (next) {
            const material = next.material as THREE.MeshBasicMaterial;
            material.color.set(SKETCH_COLORS.hoverFill);
            material.opacity = 0.3;
        }
    }

    updateMarkerColors() {
        this.group.children.forEach((object) => {
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

    private addMarker(point: Point2, index: number, color: string, center = false, locked = false) {
        const outer = new THREE.Mesh(new THREE.SphereGeometry(SKETCH_STYLE.markerOuterRadius, 16, 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.border, depthTest: false, depthWrite: false }));
        outer.position.copy(this.world(point));
        outer.userData = { pointIndex: index, pointBorder: true, centerHandle: center, locked };
        outer.renderOrder = 1001;
        const inner = new THREE.Mesh(new THREE.SphereGeometry(SKETCH_STYLE.markerInnerRadius, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }));
        inner.position.copy(this.world(point, 0.14));
        this.setScreenRadius(outer, SKETCH_STYLE.markerOuterPx);
        this.setScreenRadius(inner, SKETCH_STYLE.markerInnerPx);
        inner.userData = { pointIndex: index, centerHandle: center, locked };
        inner.renderOrder = 1002;
        this.group.add(outer, inner);
    }

    private addDimension(position: Point2, target: SketchDimension, value: number, unit: LengthUnit) {
        if (this.options.getSketchDrag()?.moved) return;
        this.options.overlay.set({
            id: `sketch-dimension:${this.options.getEditingSketchId() || 'draft'}:${target.kind}:${target.index ?? ''}:${target.handle ?? ''}`,
            kind: 'dimension',
            position: this.world(position, 0.3).toArray(),
            target,
            value,
            unit,
        });
    }

    private addGuide(a: Point2, b: Point2, dashed = true, color: string = SKETCH_COLORS.guide) {
        const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.world(a), this.world(b)]), material);
        if (dashed) line.computeLineDistances();
        line.renderOrder = 900;
        this.group.add(line);
    }

    update(points: Point2[], selectedIndex = this.selectedSketchPoint, profileType: ProfileType = 'polygon', curves: ProfileCurves = {}, sides = 3, selectedSegment = -1, lockedPoints: number[] = [], sectorAngle = 360, unit: LengthUnit = 'mm', open = false, startAngle?: number, controlPoints?: number[], trimmedCurve = false) {
        this.clearAltBorder();
        clearGroup(this.group);
        this.options.overlay.clear('sketch-dimension:');
        this.currentPoints = points.map((point) => [...point]);
        this.selectedSketchPoint = selectedIndex;
        this.activeSketchSegment = selectedSegment;
        this.profileType = profileType;
        if (!this.options.isSketchMode() || !points.length) return;
        const displayPoints = profilePoints(profileType, points, 64, curves, sides, sectorAngle, open, startAngle);
        const vertices = displayPoints.map((point) => this.world(point));
        const midpoint = (a: Point2, b: Point2): Point2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const controls = new Set(controlPoints || points.map((_, index) => index));
        const editingSketchId = this.options.getEditingSketchId();
        if (profileType === 'polygon') {
            const segments = borderSegments({ id: editingSketchId || '', kind: 'sketch', profileType: 'polygon', open, points, curves } as ModelEntity);
            segments.forEach((segment) => {
                const line = this.createFatLine(segment.points.map((point) => this.world(point)), segment.closed, segment.sourceCount === 1 ? segment.index : undefined);
                line.userData.borderEntityId = editingSketchId;
                line.userData.borderSegmentIndex = segment.index;
                this.group.add(line);
                if (segment.sourceCount === 1) {
                    const index = segment.index;
                    const a = points[index], b = points[(index + 1) % points.length];
                    if (editingSketchId && !trimmedCurve && controls.has(index)) this.addDimension(midpoint(a, b), { kind: 'segment', index }, Math.hypot(b[0] - a[0], b[1] - a[1]), unit);
                    if (curves[index]) this.addGuide(a, b);
                }
            });
        } else {
            const line = this.createFatLine(vertices, !open && profileClosed(profileType));
            line.userData.borderEntityId = editingSketchId;
            line.userData.borderSegmentIndex = 0;
            this.group.add(line);
        }
        if (profileType === 'rectangle' && points.length === 4 && editingSketchId) {
            this.addDimension(midpoint(points[0], points[1]), { kind: 'width' }, Math.abs(points[1][0] - points[0][0]), unit);
            this.addDimension(midpoint(points[1], points[2]), { kind: 'height' }, Math.abs(points[2][1] - points[1][1]), unit);
            this.addMarker(midpoint(points[0], points[2]), -1, SKETCH_COLORS.pointActive, true);
        }
        if (profileType === 'line' && points.length >= 2 && editingSketchId) this.addDimension(midpoint(points[0], points[1]), { kind: 'segment', index: 0 }, Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]), unit);
        if (['circle', 'ellipse', 'regular'].includes(profileType) && points.length >= 2) {
            const [center, edge] = points;
            const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
            const start = startAngle ?? (profileType === 'ellipse' ? 0 : Math.atan2(edge[1] - center[1], edge[0] - center[0]));
            const full = !open && (sectorAngle >= 359.999 || profileType === 'regular');
            if (full) this.addGuide(center, edge);
            if (editingSketchId) {
                const kind = profileType === 'regular' ? 'regularRadius' : profileType === 'circle' ? 'radius' : 'radiusX';
                this.addDimension(midpoint(center, edge), { kind }, radius, unit);
                if (profileType === 'ellipse' && points[2]) {
                    if (full) this.addGuide(center, points[2]);
                    this.addDimension(midpoint(center, points[2]), { kind: 'radiusY' }, Math.hypot(points[2][0] - center[0], points[2][1] - center[1]), unit);
                }
            }
            if (profileType !== 'regular' && editingSketchId) {
                const angle = start + sectorAngle * Math.PI / 180;
                const sectorPoint = profileType === 'circle' ? [center[0] + Math.cos(angle) * radius * 0.82, center[1] + Math.sin(angle) * radius * 0.82] as Point2 : profileEllipsePoint(center, edge, points[2], angle, 0.82);
                const handle = new THREE.Mesh(new THREE.SphereGeometry(SKETCH_STYLE.sectorHandleRadius, 16, 12), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.sectorHandle, depthTest: false, depthWrite: false }));
                handle.position.copy(this.world(sectorPoint));
                this.setScreenRadius(handle, SKETCH_STYLE.sectorHandlePx);
                handle.userData.sectorHandle = true;
                handle.renderOrder = 1003;
                this.group.add(handle);
                if (!full) {
                    const middle = start + sectorAngle * Math.PI / 360;
                    const anglePosition = profileType === 'circle' ? [center[0] + Math.cos(middle) * radius * 0.42, center[1] + Math.sin(middle) * radius * 0.42] as Point2 : profileEllipsePoint(center, edge, points[2], middle, 0.42);
                    this.addDimension(anglePosition, { kind: 'angle' }, sectorAngle, unit);
                }
            }
        }
        if (profileType === 'arc' && points.length >= 3 && editingSketchId) {
            const center = profileArcCenter(points);
            if (center) {
                this.addMarker(center, -1, SKETCH_COLORS.pointActive, true);
                this.addGuide(center, points[0]);
                this.addDimension(midpoint(center, points[0]), { kind: 'arcRadius' }, Math.hypot(points[0][0] - center[0], points[0][1] - center[1]), unit);
            }
        }
        if (profileType === 'regular' && points.length >= 2 && editingSketchId) {
            const color = selectedIndex === 1 ? SKETCH_COLORS.pointActive : lockedPoints.includes(1) ? SKETCH_COLORS.pointLocked : SKETCH_COLORS.point;
            profilePoints('regular', points, 64, undefined, sides).slice(1).forEach((point) => this.addMarker(point, 1, color, false, lockedPoints.includes(1)));
        }
        if (selectedSegment >= 0 && curves[selectedSegment]) {
            const a = points[selectedSegment], b = points[(selectedSegment + 1) % points.length], curve = curves[selectedSegment];
            [[a, curve.c1], [b, curve.c2]].forEach(([from, to], handleIndex) => {
                this.addGuide(from, to, true, SKETCH_COLORS.guideActive);
                if (editingSketchId) this.addDimension(midpoint(from, to), { kind: 'control', index: selectedSegment, handle: handleIndex + 1 as 1 | 2 }, Math.hypot(to[0] - from[0], to[1] - from[1]), unit);
            });
            [curve.c1, curve.c2].forEach((point, handleIndex) => {
                const handle = new THREE.Mesh(new THREE.SphereGeometry(SKETCH_STYLE.bezierHandleRadius, 12, 8), new THREE.MeshBasicMaterial({ color: SKETCH_COLORS.handle, depthTest: false, depthWrite: false }));
                handle.position.copy(this.world(point));
                this.setScreenRadius(handle, SKETCH_STYLE.bezierHandlePx);
                handle.userData.handleSegment = selectedSegment;
                handle.userData.handleIndex = handleIndex + 1;
                handle.renderOrder = 1003;
                this.group.add(handle);
            });
        }
        points.forEach((point, index) => {
            if (!controls.has(index)) return;
            const color = index === selectedIndex ? SKETCH_COLORS.pointActive : lockedPoints.includes(index) ? SKETCH_COLORS.pointLocked : SKETCH_COLORS.point;
            const center = index === 0 && ['circle', 'ellipse', 'regular'].includes(profileType);
            this.addMarker(point, index, color, center, lockedPoints.includes(index));
        });
        this.updateMarkerColors();
        this.updateSegmentColors();
    }

    dispose() {
        [this.group, this.trimFeedback, this.references, this.faces, this.selectionFeedback].forEach(clearGroup);
        this.options.overlay.clear('sketch-dimension:');
        this.options.overlay.clear('sketch-lock:');
    }
}
