/** Shared hard-coded values. Change these only when the interaction specification changes. */
export { SKETCH_COLORS } from './colors';

/** Browser storage keys owned by model3d. */
export const STORAGE_KEYS = {
    lengthUnit: 'lab:model3d:sketch:lengthUnit',
    constraintLimit: 'lab:model3d:sketch:constraintLimit',
} as const;

/** Timing and interaction thresholds shared by sketch tools. */
export const INTERACTION = {
    sketchSelectionGuardMs: 300,
    cameraTransitionMs: 600,
    clickTolerancePx: 5,
    sketchDragThresholdPx: 4,
    sectorQuarterSnapThresholdDeg: 4,
    sketchGuideSnapPx: 8,
    // Reconnected intersection endpoints may differ slightly from the sampled host edge.
    sketchIntersectionTolerance: 0.01,
} as const;

/** Plane-space sketch appearance; hatch coordinates do not follow the camera. */
export const SKETCH_STYLE = {
    borderWidthPx: 4,
    markerOuterRadius: 0.84,
    markerInnerRadius: 0.6,
    markerOuterPx: 7,
    markerInnerPx: 5,
    sectorHandlePx: 6,
    bezierHandlePx: 5,
    referencePointPx: 7,
    sectorHandleRadius: 0.75,
    bezierHandleRadius: 0.66,
    referencePointRadius: 0.99,
    hatchLineWidth: 0.55,
    hatchSpacing: 7,
    hatchOpacity: 0.5,
    defaultPolygonSides: 3,
    defaultDepthMm: 10,
} as const;
