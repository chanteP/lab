import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildScene } from '../geometry';
import { borderSegments } from '../sketchBorders';
import { SKETCH_COLORS, VIEWPORT_COLORS } from '../../config/colors';
import type { ModelDocument, SketchPlane, Vec3 } from '../../types';
import type { ViewTool } from '../Viewport';
import { clearGroup, createFatLine } from './renderUtils';

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
}

/** Rebuilds Three.js scene content from the document and owns scene-wide display state. */
export class SceneSynchronizer {
    readonly model = new THREE.Group();
    readonly planes = new THREE.Group();
    document: ModelDocument | null = null;
    selected: string[] = [];
    activePlane: SketchPlane | null = null;
    editingSketchId: string | null = null;
    editingBorderIndex: number | null = null;
    booleanRoles: { target: string; tool: string } | null = null;

    private displayMode: 'shaded' | 'wireframe' | 'xray' = 'shaded';
    private showEdges = true;
    private sectionPlane: THREE.Plane | null = null;
    private isolateIds: Set<string> | null = null;
    private sketchHoverId: string | null = null;

    constructor(private readonly options: SceneSynchronizerOptions) {}

    sync(document: ModelDocument) {
        this.document = document;
        this.options.onClearAltBorder();
        this.options.transform.detach();
        clearGroup(this.model);
        const next = buildScene(document);
        [...next.children].forEach((child) => {
            this.model.add(child);
            const entity = document.entities.find((item) => item.id === child.userData.entityId);
            if (child instanceof THREE.Mesh && entity?.kind !== 'sketch') {
                const edges = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 28), new THREE.LineBasicMaterial({ color: VIEWPORT_COLORS.bodyEdge, transparent: true, opacity: 0.48 }));
                edges.userData.displayEdge = true;
                child.add(edges);
            } else if (entity?.kind === 'sketch' && this.options.isSketchMode()) {
                const material = (child as THREE.Mesh).material as THREE.Material & { opacity?: number; transparent?: boolean };
                if (material) { material.transparent = true; material.opacity = 0; }
                const plane = entity.planeId ? document.planes.find((item) => item.id === entity.planeId) : null;
                const matrix = plane ? this.planeMatrix(plane) : new THREE.Matrix4().makeRotationX(-Math.PI / 2);
                borderSegments(entity).forEach((segment) => {
                    const points = segment.points.map((point) => new THREE.Vector3(point[0], point[1], 0).applyMatrix4(matrix));
                    const border = createFatLine(points, this.options.renderer.domElement.clientWidth, this.options.renderer.domElement.clientHeight, segment.closed);
                    border.userData.borderEntityId = entity.id;
                    border.userData.borderSegmentIndex = segment.index;
                    child.add(border);
                });
            }
            this.applyObjectDisplay(child);
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
        this.updatePlaneAppearance();
        this.options.onUpdateExtrudeGuide(document);
        this.options.onRefreshSketchFaces();
    }

    private applyObjectDisplay(object: THREE.Object3D) {
        object.traverse((child) => {
            if (child.userData.displayEdge) {
                child.visible = this.showEdges && this.displayMode !== 'wireframe';
                const material = (child as THREE.LineSegments).material as THREE.LineBasicMaterial;
                material.depthTest = this.displayMode !== 'xray';
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
                }
                if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = this.displayMode === 'wireframe';
                material.transparent = this.displayMode === 'xray' || material.userData.baseTransparent;
                material.opacity = this.displayMode === 'xray' ? Math.min(0.28, material.userData.baseOpacity) : material.userData.baseOpacity;
                material.depthWrite = this.displayMode === 'xray' ? false : material.userData.baseDepthWrite;
                material.clippingPlanes = this.sectionPlane ? [this.sectionPlane] : [];
                material.needsUpdate = true;
            });
        });
    }

    setDisplayMode(mode: 'shaded' | 'wireframe' | 'xray', showEdges = this.showEdges) {
        this.displayMode = mode;
        this.showEdges = showEdges;
        this.model.children.forEach((child) => this.applyObjectDisplay(child));
    }

    setSection(active: boolean, normal: Vec3 = [0, 1, 0], point: Vec3 = [0, 0, 0]) {
        const direction = new THREE.Vector3(...normal).normalize();
        this.sectionPlane = active ? new THREE.Plane(direction, -direction.dot(new THREE.Vector3(...point))) : null;
        this.model.children.forEach((child) => this.applyObjectDisplay(child));
    }

    applyIsolation() {
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
        if (this.sketchHoverId === id) return;
        const paint = (entityId: string | null, hovered: boolean) => {
            if (!entityId) return;
            const object = this.model.children.find((item) => item.userData.entityId === entityId);
            if (!object) return;
            const materials = Array.isArray((object as THREE.Mesh).material) ? (object as THREE.Mesh).material as THREE.Material[] : [(object as THREE.Mesh).material as THREE.Material];
            materials.forEach((material: any) => {
                if (!material?.color) return;
                if (!material.userData.sketchBaseColor) {
                    material.userData.sketchBaseColor = material.color.getHex();
                    material.userData.sketchBaseOpacity = material.opacity;
                }
                material.color.set(hovered ? (material.transparent ? SKETCH_COLORS.hoverFill : SKETCH_COLORS.hoverLine) : material.userData.sketchBaseColor);
                if (hovered && material.transparent) material.opacity = 0.42;
                else if (!hovered) material.opacity = material.userData.sketchBaseOpacity;
            });
        };
        paint(this.sketchHoverId, false);
        this.sketchHoverId = id;
        paint(this.sketchHoverId, true);
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

    setSelected(ids: string[]) {
        this.selected = ids;
        this.applySelection();
        if (this.document) this.options.onUpdateExtrudeGuide(this.document);
    }

    setBooleanRoles(roles: { target: string; tool: string } | null) {
        this.booleanRoles = roles;
        this.applySelection();
    }

    applySelection() {
        this.options.transform.detach();
        this.model.children.forEach((object) => {
            const mesh = object as THREE.Mesh;
            const material = mesh.material as THREE.MeshStandardMaterial;
            const active = this.selected.includes(mesh.userData.entityId) && !['offsetFace', 'fillet', 'chamfer'].includes(this.options.getTool());
            if (material.emissive) {
                const role = this.booleanRoles?.target === mesh.userData.entityId ? VIEWPORT_COLORS.booleanTarget : this.booleanRoles?.tool === mesh.userData.entityId ? VIEWPORT_COLORS.booleanTool : active ? VIEWPORT_COLORS.selectedEmissive : VIEWPORT_COLORS.noEmissive;
                material.emissive.set(role);
                material.emissiveIntensity = role === VIEWPORT_COLORS.noEmissive ? 0 : 0.35;
            } else if (material.color) {
                material.color.set(active ? SKETCH_COLORS.active : SKETCH_COLORS.line);
            }
        });
        const id = this.selected[this.selected.length - 1];
        const object = this.model.children.find((item) => item.userData.entityId === id);
        const planeObject = this.planes.children.find((item) => item.userData.planeId === id);
        if (planeObject && ['translate', 'rotate'].includes(this.options.getTool()) && !this.options.isSketchMode()) this.options.transform.attach(planeObject);
        else if (object && ['translate', 'rotate', 'scale'].includes(this.options.getTool()) && !this.options.isSketchMode()) this.options.transform.attach(object);
        this.options.onRefreshSketchSelectionFeedback();
    }

    dispose() {
        clearGroup(this.model);
        clearGroup(this.planes);
    }
}
