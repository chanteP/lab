import { solveDocumentConstraints, SKETCH_CONSTRAINT_TOLERANCE, type SketchConstraintOperation } from './sketchConstraintSolver';
import type { ModelDocument, SketchElementRef } from '../types';

export { SKETCH_CONSTRAINT_TOLERANCE };
export type { SketchConstraintOperation };

/** Single entry point for sketch constraint propagation; viewport and Vue state stay outside the solver. */
export function runConstraintChain(document: ModelDocument, rootId: string | null, softAnchors: SketchElementRef[], limit: number, operation?: SketchConstraintOperation, before?: ModelDocument) {
    return solveDocumentConstraints(document, rootId, softAnchors, limit, operation, before);
}
