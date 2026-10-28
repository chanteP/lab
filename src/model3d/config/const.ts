/** Shared hard-coded values. Change these only when the interaction specification changes. */
export { SKETCH_COLORS } from './colors';

/** Browser storage keys owned by model3d. */
export const STORAGE_KEYS = {
    lengthUnit: 'lab:model3d:sketch:lengthUnit',
} as const;

/** Timing and interaction thresholds shared by sketch tools. */
export const INTERACTION = {
    sketchSelectionGuardMs: 300,
    cameraTransitionMs: 600,
    clickTolerancePx: 5,
} as const;

/** Screen-space sketch appearance, independent of camera zoom. */
export const SKETCH_STYLE = {
    hatchLineWidthPx: 1,
    hatchSpacingPx: 14,
    defaultPolygonSides: 3,
    defaultDepthMm: 10,
} as const;
