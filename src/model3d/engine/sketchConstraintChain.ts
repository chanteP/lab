import { solveDocumentConstraints, SKETCH_CONSTRAINT_TOLERANCE, type SketchConstraintOperation } from './sketchConstraintSolver';
import { entityProfileClosed } from './profiles';
import { cloneDocument, type ModelDocument, type SketchElementRef, type TrimmedSelection } from '../types';

export { SKETCH_CONSTRAINT_TOLERANCE };
export type { SketchConstraintOperation };

/** Single entry point for sketch constraint propagation; viewport and Vue state stay outside the solver. */
export function runConstraintChain(document: ModelDocument, rootId: string | null, preservedAnchors: SketchElementRef[], limit: number, operation?: SketchConstraintOperation, before?: ModelDocument) {
    return solveDocumentConstraints(document, rootId, preservedAnchors, limit, operation, before);
}

function uniqueAnchors(anchors: SketchElementRef[]) {
    return [...new Map(anchors.map((anchor) => [`${anchor.entityId}:${anchor.index}`, { ...anchor }])).values()];
}

/** Build hard-preservation candidates from strongest shape preservation to a free solve. */
export function sketchConstraintAnchorLevels(document: ModelDocument, current: SketchElementRef[], selectedEdges: SketchElementRef[], trimmedSelection: TrimmedSelection | null) {
    const edges: SketchElementRef[] = [];
    selectedEdges.forEach(({ entityId, index }) => {
        const entity = document.entities.find((item) => item.id === entityId);
        if (!entity?.points) return;
        edges.push({ entityId, index }, { entityId, index: (index + 1) % entity.points.length });
    });
    const primary = uniqueAnchors([...current, ...edges]);
    if (!primary.length) return [[]];

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

    const withoutCounterparts = [...shape.values()].filter((anchor) => !counterparts.has(`${anchor.entityId}:${anchor.index}`));
    const levels = [
        [...shape.values()],
        uniqueAnchors([...primary, ...counterparts.values()]),
        uniqueAnchors([...primary, ...withoutCounterparts]),
    ];
    // Before freeing the whole shape, prove that no single secondary vertex can remain stationary.
    [...shape.values()].forEach((anchor) => {
        if (!primary.some((item) => item.entityId === anchor.entityId && item.index === anchor.index)) levels.push(uniqueAnchors([...primary, anchor]));
    });
    levels.push(primary, []);
    return [...new Map(levels.map((anchors) => [anchors.map((anchor) => `${anchor.entityId}:${anchor.index}`).sort().join('|'), anchors])).values()];
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

/** Evaluate all priorities atomically; changed-vertex count wins, then stronger preservation wins. */
export function solveWithSketchConstraintCandidates(document: ModelDocument, before: ModelDocument, rootId: string | null, levels: SketchElementRef[][], limit: number, operation?: SketchConstraintOperation) {
    let best: { document: ModelDocument; changed: number } | null = null;
    for (const anchors of levels) {
        const candidate = cloneDocument(document);
        const result = runConstraintChain(candidate, rootId, anchors, limit, operation, before);
        if (result === 'limit') return { result, document: candidate } as const;
        if (result !== 'ok') continue;
        const changed = changedConstraintPointCount(document, candidate);
        if (!best || changed < best.changed) best = { document: candidate, changed };
        if (changed === 0) break;
    }
    if (best) return { result: 'ok', document: best.document, changed: best.changed } as const;
    return { result: 'conflict', document: cloneDocument(before) } as const;
}
