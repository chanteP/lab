import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildScene } from '../geometry';
import { borderSegments } from '../sketchBorders';
import { SKETCH_COLORS, VIEWPORT_COLORS } from '../../config/colors';
import type { DisplayMode, ModelDocument, SelectionKind, SketchPlane } from '../../types';
import type { ViewTool } from '../Viewport';
import { clearGroup, createDisplayEdgeGeometry, createFatLine } from './renderUtils';
import { buildMeshTopology } from '../topology/MeshTopology';
import { reconcileTopology } from '../topology/TopologyTracker';
import { createTopologyEdgeGeometry } from './TopologyEdges';
import type { BodyTopology } from '../topology/types';
import { BooleanPreviewController, type BooleanPreviewState } from './BooleanPreviewController';
import type { OverlayController } from './OverlayController';

/** Smallest origin-centered sphere enclosing the supplied meshes guarantees view-independent section limits. */
export function measureSectionRadius(objects: THREE.Object3D[]) {
    let radiusSquared = 0;
    const point = new THREE.Vector3();
    objects.forEach((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.updateWorldMatrix(true, false);
        const positions = object.geometry.attributes.position;
        if (!positions) return;
        for (let index = 0; index < positions.count; index++) {
            point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
            radiusSquared = Math.max(radiusSquared, point.lengthSq());
        }
    });
    return Math.sqrt(radiusSquared);
}

interface SceneSynchronizerOptions {
    transform: TransformControls;
    renderer: THREE.WebGLRenderer;
    isSketchMode: () => boolean;
    getTool: () => ViewTool;
    onStats: (stats: { vertices: number; triangles: number; objects: number }) => void;
    onClearAltBorder: () => void;
    onClearSketchReferences: () => void;
    onUpdateExtrudeGuide: (document: ModelDocument) => void;
    onRefreshSketchFaces: () => void;
    onRefreshSketchSelectionFeedback: () => void;
    onPlaneOrientation: (plane: SketchPlane) => void;
    isProfileIntersection: () => boolean;
    overlay: OverlayController;
}

/** Rebuilds Three.js scene content from the document and owns scene-wide display state. */
export class SceneSynchronizer {
    readonly model = new THREE.Group();
    readonly planes = new THREE.Group();
    readonly sectionOutlines = new THREE.Group();
    document: ModelDocument | null = null;
    selected: string[] = [];
    selectionKind: SelectionKind = null;
    activePlane: SketchPlane | null = null;
    editingSketchId: string | null = null;
    editingBorderIndex: number | null = null;
    readonly booleanPreview: BooleanPreviewController;
    booleanState: BooleanPreviewState | null = null;

    private displayMode: DisplayMode = 'shaded';
    private showEdges = true;
    sectionPlane: THREE.Plane | null = null;
    private sectionInversePlane: THREE.Plane | null = null;
    private sectionOffset = 0;
    private isolateIds: Set<string> | null = null;
    private sketchHoverIds = new Set<string>();

    constructor(private readonly options: SceneSynchronizerOptions) { this.booleanPreview = new BooleanPreviewController(options.overlay); }

    sync(document: ModelDocument) {
        this.document = document;
        this.booleanPreview.reset();
        this.options.onClearAltBorder();
        this.options.transform.detach();
        const previousTopology = new Map<string, BodyTopology>();
        this.model.children.forEach((child) => { if (child.userData.topology) previousTopology.set(child.userData.entityId, child.userData.topology); });
        clearGroup(this.sectionOutlines);
        clearGroup(this.model);
        const next = buildScene(document);
        [...next.children].forEach((child) => {
            this.model.add(child);
            const entity = document.entities.find((item) => item.id === child.userData.entityId);
            if (child instanceof THREE.Mesh && entity?.kind !== 'sketch') {
                const topology = reconcileTopology(previousTopology.get(entity.id), buildMeshTopology(child.geometry, entity.id, entity, document), entity.faceEdit);
                child.userData.topology = topology;
                const display = createTopologyEdgeGeometry(topology);
                const edges = new THREE.LineSegments(display.geometry, new THREE.LineBasicMaterial({ color: VIEWPORT_COLORS.bodyEdge, transparent: true, opacity: 0.48 }));
                edges.userData.displayEdge = true;
                edges.userData.segmentEdgeIds = display.segmentEdgeIds;
                child.add(edges);
            } else if (entity?.kind === 'sketch' && this.options.isSketchMode()) {
                child.traverse((object) => { if (object.userData.compoundOutline) object.visible = false; });
                const material = (child as THREE.Mesh).material as THREE.Material & { opacity?: number; transparent?: boolean };
                if (material) { material.transparent = true; material.opacity = 0; }
                const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
                const matrix = plane ? this.planeMatrix(plane) : new THREE.Matrix4().makeRotationX(-Math.PI / 2);
                if (entity.parts?.length) {
                    entity.parts.forEach((part, partIndex) => {
                        const points = part.points.map((point) => new THREE.Vector3(point[0], point[1], 0).applyMatrix4(matrix));
                        const border = createFatLine(points, this.options.renderer.domElement.clientWidth, this.options.renderer.domElement.clientHeight, part.closed);
                        border.userData.borderEntityId = entity.id;
                        border.userData.borderSegmentIndex = partIndex;
                        border.userData.borderWholeOnly = true;
                        child.add(border);
                    });
                } else borderSegments(entity).forEach((segment) => {
                    const points = segment.points.map((point) => new THREE.Vector3(point[0], point[1], 0).applyMatrix4(matrix));
                    const border = createFatLine(points, this.options.renderer.domElement.clientWidth, this.options.renderer.domElement.clientHeight, segment.closed);
                    border.userData.borderEntityId = entity.id;
                    border.userData.borderSegmentIndex = segment.index;
                    border.userData.borderWholeOnly = false;
                    child.add(border);
                });
            }
            if (entity?.kind !== 'sketch') this.applyObjectDisplay(child);
        });

        let vertices = 0, triangles = 0;
        this.model.children.forEach((object) => {
            const entity = document.entities.find((item) => item.id === object.userData.entityId);
            if (!entity || entity.kind === 'sketch') return;
            const geometry = (object as THREE.Mesh).geometry;
            vertices += geometry.attributes.position?.count || 0;
            triangles += (geometry.index?.count || geometry.attributes.position?.count || 0) / 3;
        });
        const objects = this.model.children.filter((object) => document.entities.find((item) => item.id === object.userData.entityId)?.kind !== 'sketch').length;
        this.options.onStats({ vertices, triangles: Math.round(triangles), objects });

        clearGroup(this.planes);
        document.planes.filter((plane) => plane.visible).forEach((plane) => this.addPlaneHelper(plane));
        this.applyIsolation();
        this.activePlane = this.activePlane ? document.planes.find((plane) => plane.id === this.activePlane!.id) || null : null;
        this.applySelection();
        this.rebuildSectionOutlines();
        this.updatePlaneAppearance();
        this.options.onUpdateExtrudeGuide(document);
        this.options.onRefreshSketchFaces();
        if (this.booleanState) this.booleanPreview.apply(this.model, document, this.booleanState);
    }

    private applyObjectDisplay(object: THREE.Object3D) {
        object.traverse((child) => {
            if (child.userData.displayEdge) {
                child.visible = this.showEdges && this.displayMode !== 'wireframe';
                const material = (child as THREE.LineSegments).material as THREE.LineBasicMaterial;
                material.depthTest = this.displayMode !== 'xray';
                material.opacity = 0.48;
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
                    material.userData.baseColorWrite = material.colorWrite;
                }
                if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = this.displayMode === 'wireframe';
                // Outline mode retains the depth of the solid surface so hidden edges stay occluded.
                material.colorWrite = material.userData.baseColorWrite;
                material.transparent = this.displayMode === 'xray' || material.userData.baseTransparent;
                material.opacity = this.displayMode === 'xray' ? Math.min(0.28, material.userData.baseOpacity) : material.userData.baseOpacity;
                material.depthWrite = this.displayMode === 'xray' ? false : material.userData.baseDepthWrite;
                material.clippingPlanes = this.sectionPlane ? [this.sectionPlane] : [];
                material.needsUpdate = true;
            });
        });
    }

    setDisplayMode(mode: DisplayMode, showEdges = this.showEdges) {
        this.displayMode = mode;
        this.showEdges = showEdges;
        this.model.children.forEach((child) => { if (this.document?.entities.find((item) => item.id === child.userData.entityId)?.kind !== 'sketch') this.applyObjectDisplay(child); });
        this.applySelection();
    }

    setSection(active: boolean, offset = 0) {
        this.sectionOffset = offset;
        this.sectionPlane = active ? new THREE.Plane(new THREE.Vector3(0, -1, 0), offset) : null;
        this.sectionInversePlane = active ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -offset) : null;
        this.sectionOutlines.visible = active;
        if (active) this.rebuildSectionOutlines();
        else clearGroup(this.sectionOutlines);
        this.model.children.forEach((child) => { if (this.document?.entities.find((item) => item.id === child.userData.entityId)?.kind !== 'sketch') this.applyObjectDisplay(child); });
    }

    setSectionOffset(offset: number) {
        this.sectionOffset = offset;
    }

    getSectionRadius() {
        const objects = this.model.children.filter((child) => child.visible && this.document?.entities.find((item) => item.id === child.userData.entityId)?.kind !== 'sketch');
        return measureSectionRadius(objects);
    }

    updateSection(camera: THREE.Camera) {
        if (!this.sectionPlane || !this.sectionInversePlane) return;
        const normal = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const point = normal.clone().multiplyScalar(this.sectionOffset);
        this.sectionPlane.normal.copy(normal);
        this.sectionPlane.constant = -normal.dot(point);
        this.sectionInversePlane.normal.copy(normal).negate();
        this.sectionInversePlane.constant = -this.sectionInversePlane.normal.dot(point);
    }

    isSectionPointClipped(point: THREE.Vector3) {
        return !!this.sectionPlane && this.sectionPlane.distanceToPoint(point) < 0;
    }

    private rebuildSectionOutlines() {
        clearGroup(this.sectionOutlines);
        if (!this.sectionPlane || !this.sectionInversePlane) return;
        this.model.children.forEach((child) => {
            if (!(child instanceof THREE.Mesh) || !child.visible || this.document?.entities.find((item) => item.id === child.userData.entityId)?.kind === 'sketch') return;
            const outline = new THREE.LineSegments(createDisplayEdgeGeometry(child.geometry), new THREE.LineBasicMaterial({
                color: VIEWPORT_COLORS.bodyEdge, transparent: true, opacity: 0.3, depthWrite: false,
                clippingPlanes: [this.sectionInversePlane!],
            }));
            outline.position.copy(child.position);
            outline.quaternion.copy(child.quaternion);
            outline.scale.copy(child.scale);
            outline.userData.sourceEntityId = child.userData.entityId;
            this.sectionOutlines.add(outline);
        });
    }

    applyIsolation() {
        if (this.booleanState) return;
        this.model.children.forEach((child) => {
            const entity = this.document?.entities.find((item) => item.id === child.userData.entityId);
            const inSketch = !this.options.isSketchMode() || (entity?.kind === 'sketch' && entity.planeId === this.activePlane?.id);
            child.traverse((border) => { if (border.userData.borderEntityId) border.visible = true; });
            child.visible = inSketch && (this.editingBorderIndex !== null || child.userData.entityId !== this.editingSketchId) && (!this.isolateIds || this.isolateIds.has(child.userData.entityId));
            if (this.editingBorderIndex !== null && child.userData.entityId === this.editingSketchId) {
                child.traverse((border) => {
                    if (border.userData.borderSegmentIndex === this.editingBorderIndex) border.visible = false;
                });
            }
        });
        this.planes.children.forEach((child) => child.visible = !this.isolateIds || this.isolateIds.has(child.userData.planeId));
        this.sectionOutlines.children.forEach((outline) => {
            const source = this.model.children.find((child) => child.userData.entityId === outline.userData.sourceEntityId);
            outline.visible = !!source?.visible;
        });
    }

    setIsolate(ids: string[] | null) {
        this.isolateIds = ids?.length ? new Set(ids) : null;
        this.applyIsolation();
    }

    setSketchEditing(id: string | null) {
        if (this.editingSketchId !== id) {
            this.setSketchHover(null);
            this.options.onClearSketchReferences();
        }
        this.editingSketchId = id;
        this.applyIsolation();
    }

    setSketchEdgeEditing(index: number | null) {
        this.editingBorderIndex = index;
        this.applyIsolation();
    }

    setSketchHover(id: string | null) {
        this.setSketchHovers(id ? [id] : []);
    }

    setSketchHovers(ids: string[]) {
        const next = new Set(ids);
        if (this.sketchHoverIds.size === next.size && [...next].every((id) => this.sketchHoverIds.has(id))) return;
        const paint = (entityId: string | null, hovered: boolean) => {
            if (!entityId) return;
            const object = this.model.children.find((item) => item.userData.entityId === entityId);
            if (!object) return;
            const materials = Array.isArray((object as THREE.Mesh).material) ? (object as THREE.Mesh).material as THREE.Material[] : [(object as THREE.Mesh).material as THREE.Material];
            materials.forEach((material: any) => {
                if (!material?.color) return;
                if (material.userData.sketchBaseColor === undefined) {
                    material.userData.sketchBaseColor = material.color.getHex();
                    material.userData.sketchBaseOpacity = material.opacity;
                }
                material.color.set(hovered ? (material.transparent ? SKETCH_COLORS.hoverFill : SKETCH_COLORS.hoverLine) : material.userData.sketchBaseColor);
                if (hovered && material.transparent) material.opacity = 0.42;
                else if (!hovered) material.opacity = material.userData.sketchBaseOpacity;
            });
        };
        this.sketchHoverIds.forEach((id) => paint(id, false));
        this.sketchHoverIds = next;
        this.sketchHoverIds.forEach((id) => paint(id, true));
    }

    planeMatrix(plane: SketchPlane) {
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
        if (plane) this.options.onPlaneOrientation(plane);
        this.applyIsolation();
        this.updatePlaneAppearance();
        this.options.onRefreshSketchFaces();
    }

    setSelected(ids: string[], kind: SelectionKind = 'body') {
        this.selected = ids;
        this.selectionKind = kind;
        this.applySelection();
        if (this.document) this.options.onUpdateExtrudeGuide(this.document);
    }

    setBooleanPreview(state: BooleanPreviewState | null) {
        this.booleanPreview.restore();
        this.booleanState = state;
        this.model.children.forEach((object) => object.userData.bodySelected = false);
        if (state && this.document) this.booleanPreview.apply(this.model, this.document, state);
        else {
            this.applyIsolation();
            this.applySelection();
        }
    }

    applySelection() {
        this.options.transform.detach();
        if (this.booleanState) return;
        this.model.children.forEach((object) => {
            const mesh = object as THREE.Mesh;
            const material = mesh.material as THREE.MeshStandardMaterial;
            const active = this.selected.includes(mesh.userData.entityId) && this.options.getTool() !== 'offsetFace';
            const entity = this.document?.entities.find((item) => item.id === mesh.userData.entityId);
            const bodyActive = active && entity?.kind !== 'sketch' && ['body', 'mixed'].includes(this.selectionKind || '');
            if (material.emissive) {
                if (!material.userData.baseColor && material.color) material.userData.baseColor = material.color.getHex();
                if (material.color) material.color.set(bodyActive ? VIEWPORT_COLORS.selectedBody : this.displayMode === 'clay' ? VIEWPORT_COLORS.clayBody : material.userData.baseColor);
                const role = active && !bodyActive && !['face', 'edge'].includes(this.selectionKind || '') ? VIEWPORT_COLORS.selectedEmissive : VIEWPORT_COLORS.noEmissive;
                material.emissive.set(role);
                material.emissiveIntensity = role === VIEWPORT_COLORS.noEmissive ? 0 : 0.35;
                mesh.userData.bodySelected = bodyActive && role === VIEWPORT_COLORS.noEmissive;
            } else if (material.color) {
                if (material.userData.sketchBaseColor === undefined) material.userData.sketchBaseColor = material.color.getHex();
                material.color.set(active && !this.options.isProfileIntersection() ? SKETCH_COLORS.active : material.userData.sketchBaseColor);
            }
        });
        const id = this.selected[this.selected.length - 1];
        const object = this.model.children.find((item) => item.userData.entityId === id);
        const planeObject = this.planes.children.find((item) => item.userData.planeId === id);
        if (planeObject && ['translate', 'rotate'].includes(this.options.getTool()) && !this.options.isSketchMode()) this.options.transform.attach(planeObject);
        else if (object && ['translate', 'rotate', 'scale'].includes(this.options.getTool()) && !this.options.isSketchMode()) this.options.transform.attach(object);
        this.options.onRefreshSketchSelectionFeedback();
    }

    updateSelectionAnimation(time: number) {
        if (this.booleanState) return;
        const intensity = 0.04 + (Math.sin(time * 2.4) + 1) * 0.16;
        this.model.children.forEach((object) => {
            if (!object.userData.bodySelected) return;
            const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial;
            material.emissive.set(VIEWPORT_COLORS.selectedBody);
            material.emissiveIntensity = intensity;
        });
    }

    dispose() {
        this.booleanPreview.dispose();
        clearGroup(this.model);
        clearGroup(this.planes);
        clearGroup(this.sectionOutlines);
    }
}
