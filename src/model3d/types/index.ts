import { ENTITY_COLORS } from '../config/colors';

export type Vec3 = [number, number, number];
export type Point2 = [number, number];

/** A disconnected polygon/polyline owned by one compound sketch entity. */
export interface SketchProfileEditor {
    type: 'polygon' | 'rectangle' | 'circle' | 'ellipse' | 'regular' | 'arc' | 'line';
    source: Point2[];
    sides?: number;
    sectorAngle?: number;
    startAngle?: number;
}
export interface SketchProfilePart {
    points: Point2[];
    closed: boolean;
    editor?: SketchProfileEditor;
}
export type SketchElementRef = { entityId: string; index: number };
export type SketchRulerSide = 'top' | 'left';
/** Persistent construction lines owned by a sketch plane; they never enter profile geometry. */
export type SketchReferenceGuide = { id: string; axis: 'u' | 'v'; offset: number };
export type SketchConstraintKind = 'auto' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'equal' | 'length' | 'angle' | 'tangent' | 'concentric';
export type SketchEdgeConstraint = { id?: string; type: SketchConstraintKind; reference?: SketchElementRef; length?: number; angle?: number; tangentMode?: 'external' | 'internal' };
export type LengthUnit = 'mm' | 'cm' | 'm';
export type DisplayMode = 'shaded' | 'clay' | 'wireframe' | 'xray';
export type EntityKind = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'sketch' | 'image' | 'extrude' | 'boolean';
export type PrimitiveKind = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus';
export type BooleanOperation = 'union' | 'subtract' | 'intersect';
export type BooleanOperandSign = 1 | -1;

export interface ModelFolder {
    id: string;
    name: string;
    visible: boolean;
    parentId: string | null;
    /** Imported SVG groups remain selectable and scalable as one sketch asset. */
    kind?: 'svg';
    planeId?: string;
    sketchCorners?: Point2[];
    aspectLocked?: boolean;
}

export interface SketchPlane {
    id: string;
    name: string;
    kind: 'XZ' | 'XY' | 'YZ';
    origin: Vec3;
    normal: Vec3;
    u: Vec3;
    v: Vec3;
    visible: boolean;
    guides?: SketchReferenceGuide[];
}

export type EdgeTreatment = {
    id: string;
    type: 'fillet' | 'chamfer';
    size: number;
    /** Original body-local edge and adjacent outward normals; survives generated topology changes. */
    edge: { a: Vec3; b: Vec3; normals: Vec3[] };
};

export type VertexTreatment = {
    id: string;
    type: 'fillet' | 'chamfer';
    size: number;
    /** Original body-local vertex and adjacent outward normals. */
    vertex: { point: Vec3; normals: Vec3[] };
};

export interface ModelEntity {
    id: string;
    name: string;
    parentId: string | null;
    kind: EntityKind;
    color: string;
    visible: boolean;
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
    tubeRadius?: number;
    points?: Point2[];
    parts?: SketchProfilePart[];
    controlPoints?: number[];
    trimmed?: boolean;
    /** Standard toolbar origin used only for whole-face selection/dragging, never for geometry solving. */
    standardShape?: 'rectangle' | 'regular';
    constraintEdges?: number[];
    edgeConstraints?: Record<number, SketchEdgeConstraint | SketchEdgeConstraint[]>;
    profileType?: 'polygon' | 'rectangle' | 'circle' | 'ellipse' | 'regular' | 'arc' | 'line';
    open?: boolean;
    profileStartAngle?: number;
    curves?: Record<number, { c1: Point2; c2: Point2 }>;
    analyticCurves?: Record<number, SketchCurve>;
    lockedPoints?: number[];
    sectorAngle?: number;
    sides?: number;
    profileId?: string;
    planeId?: string;
    sideMode?: 'one' | 'symmetric';
    direction?: 1 | -1;
    draftAngle?: number;
    operation?: BooleanOperation;
    operands?: string[];
    /** Signed multi-body CSG inputs; legacy two-body results keep using operation alone. */
    operandSigns?: Record<string, BooleanOperandSign>;
    /** Signs of Venn regions keyed by the operand membership bitmask. */
    regionSigns?: Record<string, BooleanOperandSign>;
    faceOffset?: { normal: Vec3; distance: number; vertices?: Vec3[]; indices?: number[]; faceIds?: string[] } | null;
    /** Last committed direct edit, consumed only when reconciling the immediately following body revision. */
    faceEdit?: { faceId: string; normal: Vec3; distance: number; revision: number };
    meshGeometry?: { positions: number[]; indices: number[]; normals?: number[]; mergeFromVert?: number[]; mergeToVert?: number[]; sourceFaceIDs?: number[] };
    axisBox?: { min: Vec3; max: Vec3 };
    compositeGeometry?: boolean;
    /** Monotonic body revision used to invalidate direct-edit gestures and topology references. */
    revision?: number;
    assetSource?: string;
    aspectLocked?: boolean;
    edgeTreatments?: EdgeTreatment[];
    vertexTreatments?: VertexTreatment[];
}

export interface ModelDocument {
    version: 1;
    unit: 'mm';
    lengthUnit: LengthUnit;
    entities: ModelEntity[];
    folders: ModelFolder[];
    planes: SketchPlane[];
}

export interface ProjectRecord {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    document: ModelDocument;
}

export type GeometryQuality = 'preview' | 'high' | 'ultra';

export const ENTITY_NAMES: Record<EntityKind, string> = {
    box: '立方体',
    cylinder: '圆柱体',
    sphere: '球体',
    cone: '圆锥体',
    torus: '圆环',
    sketch: '草图轮廓',
    image: '图片',
    extrude: '草图拉伸',
    boolean: '布尔实体',
};

export function createDocument(lengthUnit: LengthUnit = 'mm'): ModelDocument {
    return { version: 1, unit: 'mm', lengthUnit, entities: [], folders: [], planes: [] };
}

export function createEntity(kind: Exclude<EntityKind, 'boolean'>, id: string): ModelEntity {
    const base: ModelEntity = {
        id,
        parentId: null,
        kind,
        name: ENTITY_NAMES[kind],
        color: ENTITY_COLORS.primitive,
        visible: true,
        position: [0, 20, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
    };
    if (kind === 'box') return { ...base, width: 40, height: 40, depth: 40 };
    if (kind === 'cylinder') return { ...base, radius: 20, height: 40, position: [0, 20, 0] };
    if (kind === 'sphere') return { ...base, radius: 20 };
    if (kind === 'cone') return { ...base, radius: 20, height: 40, position: [0, 20, 0] };
    if (kind === 'torus') return { ...base, radius: 20, tubeRadius: 6, position: [0, 6, 0] };
    if (kind === 'image') return { ...base, name: ENTITY_NAMES.image, points: [], profileType: 'rectangle', position: [0, 0, 0], aspectLocked: true };
    return { ...base, name: ENTITY_NAMES.extrude, points: [], depth: 10, position: [0, 5, 0] };
}

export function cloneDocument(document: ModelDocument): ModelDocument {
    return JSON.parse(JSON.stringify(document));
}

export function normalizeDocument(document: ModelDocument): ModelDocument {
    let legacyConstraintId = 0;
    document.lengthUnit = document.lengthUnit || 'mm';
    document.folders = Array.isArray(document.folders) ? document.folders : [];
    document.planes = Array.isArray(document.planes) ? document.planes : [];
    document.entities.forEach((entity) => entity.parentId = entity.parentId || null);
    document.entities.forEach((entity) => Object.entries(entity.edgeConstraints || {}).forEach(([key, value]) => {
        const rules = Array.isArray(value) ? value : [value];
        rules.forEach((rule) => {
            if (!rule.id) rule.id = `constraint-${legacyConstraintId++}`;
            if (rule.type === 'length' && !(rule.length! > 0) && entity.points) {
                const index = Number(key), a = entity.points[index], b = entity.points[(index + 1) % entity.points.length];
                if (a && b) rule.length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            }
        });
    }));
    document.folders.forEach((folder) => { folder.parentId = folder.parentId || null; folder.visible = folder.visible !== false; });
    return document;
}

export function isDocument(value: any): value is ModelDocument {
    return value?.version === 1 && value?.unit === 'mm' && Array.isArray(value?.entities);
}

export type PrimaryPanel = 'search' | 'sketch' | 'insert' | 'construct' | 'tools';
export type SelectionKind = 'face' | 'edge' | 'vertex' | 'body' | 'plane' | 'sketch' | 'mixed' | null;
export type TrimmedSelection = { entityId: string; index: number; sourceCount: number; kind: 'line' | 'curve' };
export type ConstraintRuleListItem = { id: string; label: string; entityId: string; index: number; ruleId?: string; lock?: 'point' | 'edge' };
export type OperationState = {
    type: 'extrude'; profileId: string; bodyId: string; profileIds: string[]; bodyIds: string[]; before: ModelDocument; result: 'new' | BooleanOperation; targetId: string | null; existing: boolean; combinedResultId?: string;
} | {
    type: 'boolean'; resultId: string; operation: BooleanOperation; operandIds: string[]; regionSigns: Record<string, BooleanOperandSign>; before: ModelDocument; keepTarget: boolean; existing: boolean;
};

/** Analytic sketch curves; sampling is a render detail, not the logical edge representation. */
export type SketchCurve = {
    kind: 'line'; a: Point2; b: Point2;
} | {
    kind: 'cubic'; a: Point2; c1: Point2; c2: Point2; b: Point2;
} | {
    kind: 'ellipse'; center: Point2; radiusX: number; radiusY: number; rotation: number; orientation: 1 | -1; startAngle: number; endAngle: number;
};
