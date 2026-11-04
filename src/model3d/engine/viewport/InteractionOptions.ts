import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { ViewTool, ViewportCallbacks } from '../Viewport';
import type { CameraController } from './CameraController';
import type { ViewportEngine } from './ViewportEngine';
import type { SceneSynchronizer } from './SceneSynchronizer';
import type { SketchRenderer } from './SketchRenderer';
import type { SketchAssetRenderer } from './SketchAssetRenderer';
import type { GuideRenderer } from './GuideRenderer';
import type { MeasurementRenderer } from './MeasurementRenderer';

export interface InteractionOptions {
    container: HTMLElement;
    engine: ViewportEngine;
    cameraController: CameraController;
    sceneSynchronizer: SceneSynchronizer;
    sketchRenderer: SketchRenderer;
    sketchAssetRenderer: SketchAssetRenderer;
    guideRenderer: GuideRenderer;
    measurementRenderer: MeasurementRenderer;
    transform: TransformControls;
    callbacks: ViewportCallbacks;
    getTool: () => ViewTool;
    isSketchMode: () => boolean;
    isBooleanActive: () => boolean;
}
