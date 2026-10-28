export type Vec3 = [number, number, number];
export type Point2 = [number, number];
export type LengthUnit = 'mm' | 'cm' | 'm';
export type EntityKind = 'box' | 'cylinder' | 'sphere' | 'sketch' | 'extrude' | 'boolean';
export type BooleanOperation = 'union' | 'subtract' | 'intersect';
export type EdgeTreatment = { type: 'fillet' | 'chamfer'; size: number; segments: number };

export interface ModelFolder {
    id: string;
    name: string;
    visible: boolean;
    parentId: string | null;
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
}

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
    points?: Point2[];
    profileType?: 'polygon' | 'rectangle' | 'circle' | 'ellipse' | 'regular' | 'arc' | 'line';
    open?: boolean;
    profileStartAngle?: number;
    curves?: Record<number, { c1: Point2; c2: Point2 }>;
    lockedPoints?: number[];
    sectorAngle?: number;
    sides?: number;
    profileId?: string;
    planeId?: string;
    sideMode?: 'one' | 'symmetric';
    direction?: 1 | -1;
    draftAngle?: number;
    operation?: BooleanOperation;
    operands?: [string, string];
    edge?: EdgeTreatment | null;
    faceOffset?: { normal: Vec3; distance: number } | null;
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
    sketch: '草图轮廓',
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
        color: '#789e9b',
        visible: true,
        position: [0, 20, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        edge: null,
    };
    if (kind === 'box') return { ...base, width: 40, height: 40, depth: 40 };
    if (kind === 'cylinder') return { ...base, radius: 20, height: 40, position: [0, 20, 0] };
    if (kind === 'sphere') return { ...base, radius: 20 };
    return { ...base, name: ENTITY_NAMES.extrude, points: [], depth: 10, position: [0, 5, 0] };
}

export function cloneDocument(document: ModelDocument): ModelDocument {
    return JSON.parse(JSON.stringify(document));
}

export function normalizeDocument(document: ModelDocument): ModelDocument {
    document.lengthUnit = document.lengthUnit || 'mm';
    document.folders = Array.isArray(document.folders) ? document.folders : [];
    document.planes = Array.isArray(document.planes) ? document.planes : [];
    document.entities.forEach((entity) => entity.parentId = entity.parentId || null);
    document.folders.forEach((folder) => { folder.parentId = folder.parentId || null; folder.visible = folder.visible !== false; });
    return document;
}

export function isDocument(value: any): value is ModelDocument {
    return value?.version === 1 && value?.unit === 'mm' && Array.isArray(value?.entities);
}
