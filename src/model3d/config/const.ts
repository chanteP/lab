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
    sectorQuarterSnapThresholdDeg: 4,
    sketchGuideSnapPx: 8,
} as const;

/** Plane-space sketch appearance; hatch coordinates do not follow the camera. */
export const SKETCH_STYLE = {
    borderWidthPx: 6.4,
    markerOuterRadius: 0.84,
    markerOuterSelectedRadius: 1.05,
    markerInnerRadius: 0.6,
    markerInnerSelectedRadius: 0.78,
    sectorHandleRadius: 0.75,
    bezierHandleRadius: 0.66,
    referencePointRadius: 0.99,
    hatchLineWidth: 0.55,
    hatchSpacing: 7,
    hatchOpacity: 0.5,
    defaultPolygonSides: 3,
    defaultDepthMm: 10,
} as const;
