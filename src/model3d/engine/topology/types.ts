import type { Vec3 } from '../../types';

export type SurfaceDomain =
    | { kind: 'plane'; normal: Vec3; offset: number; analytic: boolean }
    | { kind: 'cylinder'; axis: Vec3; origin: Vec3; radius: number; analytic: boolean }
    | { kind: 'sphere'; center: Vec3; radius: number; analytic: boolean }
    | { kind: 'smooth'; analytic: boolean };

export interface TopologicalVertex {
    id: string;
    point: Vec3;
    renderVertices: number[];
}

export interface TopologicalTriangle {
    id: number;
    renderVertices: [number, number, number];
    vertexIds: [string, string, string];
    normal: Vec3;
    center: Vec3;
}

export interface TopologicalEdge {
    id: string;
    vertexIds: [string, string];
    triangleIds: number[];
}

export interface LogicalFace {
    id: string;
    triangleIds: number[];
    domain: SurfaceDomain;
    normal: Vec3;
    point: Vec3;
    planar: boolean;
    boundaryLoops: string[][];
    edgeIds: string[];
    adjacentFaceIds: string[];
    sourceIds: string[];
}

export interface EdgeDisplaySegment {
    id: string;
    a: Vec3;
    b: Vec3;
}

export interface LogicalEdge {
    id: string;
    vertexIds: [string, string];
    faceIds: string[];
    rawEdgeIds: string[];
    segments: EdgeDisplaySegment[];
    /** Ordered centerline for continuous hover/selection rendering, including closed-loop closure. */
    points: Vec3[];
    kind: 'sharp' | 'feature' | 'open' | 'nonmanifold';
    sourceIds: string[];
}

export type TopologyChangeKind = 'unchanged' | 'split' | 'merge' | 'deleted' | 'created' | 'ambiguous';
export interface TopologyChange {
    kind: TopologyChangeKind;
    previousIds: string[];
    nextIds: string[];
}

export interface BodyTopology {
    bodyId: string;
    revision: number;
    vertices: TopologicalVertex[];
    triangles: TopologicalTriangle[];
    rawEdges: TopologicalEdge[];
    faces: LogicalFace[];
    logicalEdges: LogicalEdge[];
    triangleFaceIds: string[];
    changes: { faces: TopologyChange[]; edges: TopologyChange[] };
}
