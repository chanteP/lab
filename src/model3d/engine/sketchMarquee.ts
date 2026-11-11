import type { ModelEntity, Point2, SketchElementRef } from '../types';
import { borderSegments } from './sketchBorders';
import { entityProfileParts } from './sketchAdvanced';

export interface SketchMarqueeRect { left: number; top: number; right: number; bottom: number }
export interface SketchItemSelection { shapes: string[]; edges: SketchElementRef[]; points: SketchElementRef[] }
export type SketchProjectPoint = (point: Point2) => { x: number; y: number };

const sameRef = (a: SketchElementRef, b: SketchElementRef) => a.entityId === b.entityId && a.index === b.index;
const inside = (point: { x: number; y: number }, rect: SketchMarqueeRect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
const allInside = (points: Point2[], rect: SketchMarqueeRect, project: SketchProjectPoint) => points.length > 0 && points.every((point) => inside(project(point), rect));

/** Fully contained shapes win over their edges; contained edges win over their endpoints. */
export function sketchMarqueeSelection(entities: ModelEntity[], planeId: string | null, rect: SketchMarqueeRect, project: SketchProjectPoint): SketchItemSelection {
    const result: SketchItemSelection = { shapes: [], edges: [], points: [] };
    const coveredPoints = new Set<string>();
    entities.filter((entity) => entity.kind === 'sketch' && entity.visible && (!planeId || entity.planeId === planeId)).forEach((entity) => {
        const parts = entityProfileParts(entity);
        if (parts.length && parts.every((part) => allInside(part.points, rect, project))) {
            result.shapes.push(entity.id);
            return;
        }
        borderSegments(entity).forEach((segment) => {
            if (!allInside(segment.points, rect, project)) return;
            result.edges.push({ entityId: entity.id, index: segment.index });
            const count = entity.points?.length || 0;
            for (let offset = 0; offset <= segment.sourceCount; offset++) coveredPoints.add(`${entity.id}:${(segment.index + offset) % Math.max(1, count)}`);
        });
        const controls = entity.controlPoints || (entity.points || []).map((_, index) => index);
        controls.forEach((index) => {
            const point = entity.points?.[index];
            if (point && inside(project(point), rect) && !coveredPoints.has(`${entity.id}:${index}`)) result.points.push({ entityId: entity.id, index });
        });
    });
    return result;
}

/** Additive marquees preserve prior items without introducing nested duplicate selections. */
export function mergeSketchItemSelection(current: SketchItemSelection, incoming: SketchItemSelection, entities: ModelEntity[]): SketchItemSelection {
    const shapes = [...new Set([...current.shapes, ...incoming.shapes])];
    const edges = [...current.edges, ...incoming.edges].filter((edge, index, all) => !shapes.includes(edge.entityId)
        && all.findIndex((candidate) => sameRef(candidate, edge)) === index);
    const covered = new Set<string>();
    edges.forEach((edge) => {
        const entity = entities.find((candidate) => candidate.id === edge.entityId);
        const segment = entity && borderSegments(entity).find((candidate) => candidate.index === edge.index);
        if (!entity || !segment) return;
        for (let offset = 0; offset <= segment.sourceCount; offset++) covered.add(`${edge.entityId}:${(edge.index + offset) % Math.max(1, entity.points?.length || 0)}`);
    });
    const points = [...current.points, ...incoming.points].filter((point, index, all) => !shapes.includes(point.entityId)
        && !covered.has(`${point.entityId}:${point.index}`) && all.findIndex((candidate) => sameRef(candidate, point)) === index);
    return { shapes, edges, points };
}
