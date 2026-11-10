import { solveDocumentConstraints, SKETCH_CONSTRAINT_TOLERANCE, type SketchConstraintOperation } from './sketchConstraintSolver';
import { entityProfileClosed } from './profiles';
import { constraintRules } from './sketchConstraints';
import { standardShapeCenter } from './sketchWholeShapeSnap';
import { cloneDocument, type ModelDocument, type SketchElementRef, type TrimmedSelection } from '../types';

export { SKETCH_CONSTRAINT_TOLERANCE };
export type { SketchConstraintOperation };

export type SketchConstraintAnchorLevel = {
    anchors: SketchElementRef[];
    centers: string[];
    current: SketchElementRef[];
    edges: SketchElementRef[];
    adjacent: SketchElementRef[];
};

/** Single entry point for sketch constraint propagation; viewport and Vue state stay outside the solver. */
export function runConstraintChain(document: ModelDocument, rootId: string | null, preservedAnchors: SketchElementRef[], limit: number, operation?: SketchConstraintOperation, before?: ModelDocument, preservedCenters: string[] = []) {
    return solveDocumentConstraints(document, rootId, preservedAnchors, limit, operation, before, preservedCenters);
}

function anchorKey(anchor: SketchElementRef) {
    return `${anchor.entityId}:${anchor.index}`;
}

function uniqueAnchors(anchors: SketchElementRef[]) {
    return [...new Map(anchors.map((anchor) => [anchorKey(anchor), { ...anchor }])).values()];
}

function moved(source: ModelDocument, target: ModelDocument, anchor: SketchElementRef) {
    const a = source.entities.find((entity) => entity.id === anchor.entityId)?.points?.[anchor.index];
    const b = target.entities.find((entity) => entity.id === anchor.entityId)?.points?.[anchor.index];
    return !!a && !!b && Math.hypot(b[0] - a[0], b[1] - a[1]) > SKETCH_CONSTRAINT_TOLERANCE;
}

function changedAnchors(source: ModelDocument, target: ModelDocument, anchors: SketchElementRef[]) {
    return uniqueAnchors(anchors).filter((anchor) => moved(source, target, anchor)).length;
}

/** Point distance follows incident edges and constraint references, including recursive entity chains. */
function constraintPointDistances(document: ModelDocument, current: SketchElementRef[]) {
    const distances = new Map<string, number>();
    const queue: SketchElementRef[] = [];
    current.forEach((anchor) => {
        const key = anchorKey(anchor);
        if (distances.has(key)) return;
        distances.set(key, 0);
        queue.push(anchor);
    });
    const connect = (a: SketchElementRef, b: SketchElementRef) => {
        if (!distances.has(anchorKey(a)) || distances.has(anchorKey(b))) return;
        distances.set(anchorKey(b), distances.get(anchorKey(a))! + 1);
        queue.push(b);
    };
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const anchor = queue[cursor];
        const entity = document.entities.find((item) => item.id === anchor.entityId);
        if (!entity?.points) continue;
        const count = entity.points.length;
        const previous = anchor.index > 0 ? anchor.index - 1 : entityProfileClosed(entity) ? count - 1 : -1;
        const next = anchor.index < count - 1 || entityProfileClosed(entity) ? (anchor.index + 1) % count : -1;
        if (previous >= 0) connect(anchor, { entityId: entity.id, index: previous });
        if (next >= 0) connect(anchor, { entityId: entity.id, index: next });
        document.entities.forEach((other) => Object.entries(other.edgeConstraints || {}).forEach(([key, value]) => {
            const index = Number(key);
            constraintRules(value).forEach((rule) => {
                const own = [{ entityId: other.id, index }, { entityId: other.id, index: (index + 1) % (other.points?.length || 0) }];
                const reference = rule.reference;
                if (!reference) return;
                const target = document.entities.find((item) => item.id === reference.entityId);
                if (!target?.points) return;
                const linked = [{ entityId: target.id, index: reference.index }, { entityId: target.id, index: (reference.index + 1) % target.points.length }];
                own.forEach((point) => linked.forEach((otherPoint) => {
                    if (anchorKey(point) === anchorKey(anchor)) connect(point, otherPoint);
                    if (anchorKey(otherPoint) === anchorKey(anchor)) connect(otherPoint, point);
                }));
            });
        }));
    }
    return distances;
}

/** Build candidates without ever releasing the current operation points. */
export function sketchConstraintAnchorLevels(document: ModelDocument, current: SketchElementRef[], selectedEdges: SketchElementRef[], trimmedSelection: TrimmedSelection | null): SketchConstraintAnchorLevel[] {
    const edges: SketchElementRef[] = [];
    selectedEdges.forEach(({ entityId, index }) => {
        const entity = document.entities.find((item) => item.id === entityId);
        if (!entity?.points) return;
        edges.push({ entityId, index }, { entityId, index: (index + 1) % entity.points.length });
    });
    const edgeAnchors = uniqueAnchors(edges);
    const primary = uniqueAnchors([...current, ...edgeAnchors]);
    const centers = [...new Set(current.map(({ entityId }) => entityId).filter((entityId) => {
        const entity = document.entities.find((item) => item.id === entityId);
        if (!entity || !standardShapeCenter(entity)) return false;
        const semanticCenter = ['circle', 'ellipse'].includes(entity.profileType || '') || entity.profileType === 'regular';
        return !semanticCenter || !current.some((anchor) => anchor.entityId === entityId && anchor.index === 0);
    }))];
    const shape = new Map<string, SketchElementRef>();
    const counterparts = new Map<string, SketchElementRef>();
    primary.forEach((anchor) => {
        const entity = document.entities.find((item) => item.id === anchor.entityId);
        if (!entity?.points) return;
        entity.points.forEach((_, index) => shape.set(`${entity.id}:${index}`, { entityId: entity.id, index }));
        if (trimmedSelection?.entityId === entity.id) {
            const start = trimmedSelection.index, end = start + trimmedSelection.sourceCount;
            const counterpart = anchor.index === start ? end : anchor.index === end ? start : -1;
            if (counterpart >= 0) counterparts.set(`${entity.id}:${counterpart}`, { entityId: entity.id, index: counterpart });
            return;
        }
        const previous = anchor.index > 0 ? anchor.index - 1 : entityProfileClosed(entity) ? entity.points.length - 1 : -1;
        const next = anchor.index < entity.points.length - 1 || entityProfileClosed(entity) ? (anchor.index + 1) % entity.points.length : -1;
        if (previous >= 0) counterparts.set(`${entity.id}:${previous}`, { entityId: entity.id, index: previous });
        if (next >= 0) counterparts.set(`${entity.id}:${next}`, { entityId: entity.id, index: next });
    });

    const currentKeys = new Set(current.map(anchorKey));
    const adjacent = [...counterparts.values()].filter((anchor) => !currentKeys.has(anchorKey(anchor)));
    const secondary = [...shape.values()].filter((anchor) => !primary.some((item) => anchorKey(item) === anchorKey(anchor)) && !counterparts.has(anchorKey(anchor)));
    const distances = constraintPointDistances(document, current);
    const distanceLayers = [...new Set([...distances.values()].filter((distance) => distance > 0))].sort((a, b) => a - b);
    const levels: SketchConstraintAnchorLevel[] = [];
    const add = (anchors: SketchElementRef[], preservedCenters: string[]) => levels.push({
        anchors: uniqueAnchors(anchors), centers: preservedCenters, current, edges: edgeAnchors, adjacent,
    });
    const edgeChoices = edgeAnchors.length ? [edgeAnchors, []] : [[]];
    const centerChoices = centers.length ? [centers, []] : [[]];

    edgeChoices.forEach((edgeChoice) => centerChoices.forEach((centerChoice) => {
        const base = [...current, ...edgeChoice];
        add([...base, ...shape.values()], centerChoice);
        add([...base, ...adjacent], centerChoice);
        add([...base, ...secondary], centerChoice);
        adjacent.forEach((anchor) => add([...base, anchor], centerChoice));
        secondary.forEach((anchor) => add([...base, anchor], centerChoice));

        // Recursive layers are attempted cumulatively so nearer constraints never trade stability for farther ones.
        const cumulative: SketchElementRef[] = [];
        distanceLayers.forEach((distance) => {
            const layer = [...distances].filter(([, value]) => value === distance).map(([key]) => {
                const [entityId, index] = key.split(':');
                return { entityId, index: Number(index) };
            });
            cumulative.push(...layer);
            add([...base, ...adjacent, ...cumulative], centerChoice);
            add([...base, ...cumulative], centerChoice);
        });
        add(base, centerChoice);
    }));
    if (!current.length && !edgeAnchors.length) return [{ anchors: [], centers: [], current: [], edges: [], adjacent: [] }];
    return [...new Map(levels.map((level) => [
        `${level.anchors.map(anchorKey).sort().join('|')}::${level.centers.sort().join('|')}`, level,
    ])).values()];
}

export function changedConstraintPointCount(source: ModelDocument, target: ModelDocument) {
    let count = 0;
    target.entities.forEach((entity) => {
        const original = source.entities.find((item) => item.id === entity.id);
        entity.points?.forEach((point, index) => {
            const before = original?.points?.[index];
            if (before && Math.hypot(point[0] - before[0], point[1] - before[1]) > SKETCH_CONSTRAINT_TOLERANCE) count++;
        });
    });
    return count;
}

function centerMovement(source: ModelDocument, target: ModelDocument, entityIds: string[]) {
    return entityIds.filter((entityId) => {
        const a = source.entities.find((entity) => entity.id === entityId);
        const b = target.entities.find((entity) => entity.id === entityId);
        const centerA = a && standardShapeCenter(a), centerB = b && standardShapeCenter(b);
        return !!centerA && !!centerB && Math.hypot(centerB[0] - centerA[0], centerB[1] - centerA[1]) > SKETCH_CONSTRAINT_TOLERANCE;
    }).length;
}

function comparePriority(a: number[], b: number[]) {
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const difference = (a[index] || 0) - (b[index] || 0);
        if (difference) return difference;
    }
    return 0;
}

/** Priorities are lexicographic: fewer total changes can never override a stronger preservation tier. */
export function solveWithSketchConstraintCandidates(document: ModelDocument, before: ModelDocument, rootId: string | null, levels: SketchConstraintAnchorLevel[], limit: number, operation?: SketchConstraintOperation) {
    const first = levels[0];
    const strongest = first?.current || [];
    const centers = [...new Set(levels.flatMap((level) => level.centers))];
    const edgeAnchors = first?.edges || [];
    const adjacent = first?.adjacent || [];
    const distances = constraintPointDistances(document, strongest);
    const distanceValues = [...new Set([...distances.values()].filter((distance) => distance > 0))].sort((a, b) => a - b);
    let best: { document: ModelDocument; changed: number; priority: number[] } | null = null;

    for (const level of levels) {
        const candidate = cloneDocument(document);
        const result = runConstraintChain(candidate, rootId, level.anchors, limit, operation, before, level.centers);
        if (result === 'limit') return { result, document: candidate } as const;
        if (result !== 'ok') continue;
        if (changedAnchors(document, candidate, strongest)) continue;
        const changed = changedConstraintPointCount(document, candidate);
        const higherKeys = new Set([...strongest, ...edgeAnchors, ...adjacent].map(anchorKey));
        const recursiveChanges = distanceValues.map((distance) => [...distances]
            .filter(([key, value]) => value === distance && !higherKeys.has(key))
            .filter(([key]) => {
                const [entityId, index] = key.split(':');
                return moved(document, candidate, { entityId, index: Number(index) });
            }).length);
        const priority = [
            changedAnchors(document, candidate, edgeAnchors),
            centerMovement(before, candidate, centers),
            changedAnchors(document, candidate, adjacent),
            ...recursiveChanges,
            changed,
        ];
        if (!best || comparePriority(priority, best.priority) < 0) best = { document: candidate, changed, priority };
    }
    if (best) return { result: 'ok', document: best.document, changed: best.changed } as const;
    return { result: 'conflict', document: cloneDocument(before) } as const;
}
