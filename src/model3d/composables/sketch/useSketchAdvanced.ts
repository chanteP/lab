import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { ViewTool, Viewport } from '../../engine/Viewport';
import type { ProfileType } from '../../engine/profiles';
import {
    cloneProfilePart, entityProfileParts, hitProfilePart, profilePartsCenter, radialSymmetry,
    rotateProfilePart, scaleProfilePart, sectorAtPoint, translateProfilePart,
    type SymmetryMode,
} from '../../engine/sketchAdvanced';
import { SKETCH_COLORS, VIEWPORT_COLORS } from '../../config/colors';
import { createEntity, type ModelDocument, type ModelEntity, type Point2, type SketchProfilePart } from '../../types';
import { uid } from '../../utils/id';
import { uniqueEntityName } from '../../utils/entity';
import { profilePoints } from '../../engine/profiles';

export type SymmetrySession = {
    step: 1 | 2 | 3;
    count: number;
    offset: number;
    selectedSector: number;
    mode: SymmetryMode;
    source: SketchProfilePart[];
    drawings: SketchProfilePart[];
};

type Gesture = {
    kind: 'draw' | 'translate-x' | 'translate-y' | 'rotate' | 'scale' | 'center';
    pointerId: number;
    startClient: Point2;
    startPoint: Point2;
    moved: boolean;
    before?: Map<string, SketchProfilePart[]>;
    workingBefore?: SketchProfilePart[];
    center?: Point2;
    angle?: number;
    distance?: number;
};

interface AdvancedOptions {
    document: Ref<ModelDocument>;
    activePlaneId: Ref<string | null>;
    activeTool: Ref<ViewTool>;
    sketchType: Ref<ProfileType>;
    sketchSides: Ref<number>;
    sketchSelectionTool: Ref<boolean>;
    selectedShapes: Ref<string[]>;
    selectedIds: Ref<string[]>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    setTransforming: (value: boolean) => void;
    refreshSketch: () => void;
    selectSketchEntity: (id: string, additive?: boolean) => void;
    clearSketchSelection: () => void;
    activateSketchSelectionTool: () => void;
}

/** Owns temporary symmetry geometry and direct 2D transforms without altering the source sketch. */
export function useSketchAdvanced(options: AdvancedOptions) {
    const {
        document, activePlaneId, activeTool, sketchType, sketchSides, sketchSelectionTool,
        selectedShapes, selectedIds, viewport, message, pushHistory, setTransforming,
        refreshSketch, selectSketchEntity, clearSketchSelection, activateSketchSelectionTool,
    } = options;
    const symmetry = ref<SymmetrySession | null>(null);
    const draft = ref<SketchProfilePart | null>(null);
    const draftStart = ref<Point2 | null>(null);
    const workingSelection = ref<number[]>([]);
    const transformCenter = ref<Point2>([0, 0]);
    const transformInput = ref({ x: 0, y: 0, angle: 0, scale: 1 });
    const inputPositions = ref<Record<string, { x: number; y: number }>>({});
    let gesture: Gesture | null = null;
    let pendingShape = false;

    const symmetryActive = computed(() => !!symmetry.value);
    const transformActive = computed(() => !symmetry.value && ['translate', 'rotate', 'scale'].includes(activeTool.value));
    const overlayActive = computed(() => !!symmetry.value || transformActive.value);
    const workingParts = computed(() => symmetry.value ? [...symmetry.value.source, ...symmetry.value.drawings] : []);
    const renderedParts = computed(() => {
        const session = symmetry.value;
        if (!session) return [];
        if (session.step < 3) return session.source.map(cloneProfilePart);
        const parts = [...workingParts.value.map(cloneProfilePart)];
        if (draft.value) parts.push(cloneProfilePart(draft.value));
        return radialSymmetry(parts, session.count, session.offset, session.selectedSector, session.mode);
    });

    function selectedEntities() {
        return selectedShapes.value.map((id) => document.value.entities.find((entity) => entity.id === id)).filter(Boolean) as ModelEntity[];
    }
    function currentParts() {
        if (symmetry.value) return workingSelection.value.map((index) => workingParts.value[index]).filter(Boolean);
        return selectedEntities().flatMap((entity) => entityProfileParts(entity));
    }
    function resetTransformValue() {
        const center = profilePartsCenter(currentParts());
        transformCenter.value = center;
        transformInput.value = { x: center[0], y: center[1], angle: 0, scale: 1 };
    }
    function updateTranslationInput() {
        const center = profilePartsCenter(currentParts());
        transformInput.value.x = center[0];
        transformInput.value.y = center[1];
    }

    function startSymmetry() {
        if (symmetry.value) return;
        const source = selectedEntities().flatMap(entityProfileParts).map(cloneProfilePart);
        symmetry.value = { step: 1, count: 2, offset: 0, selectedSector: 0, mode: 'mirror', source, drawings: [] };
        draft.value = null;
        draftStart.value = null;
        workingSelection.value = [];
        activeTool.value = 'select';
        activateSketchSelectionTool();
        viewport()?.setTool('select');
    }
    function cancelSymmetry() {
        gesture = null;
        draft.value = null;
        draftStart.value = null;
        pendingShape = false;
        symmetry.value = null;
        workingSelection.value = [];
        activeTool.value = 'select';
        viewport()?.setTool('select');
        clearSketchSelection();
    }
    function nextSymmetryStep() {
        const session = symmetry.value;
        if (!session) return;
        if (session.step < 3) {
            session.step = session.step === 1 ? 2 : 3;
            draft.value = null;
            draftStart.value = null;
            workingSelection.value = [];
            resetTransformValue();
            return;
        }
        completeSymmetry();
    }
    function completeSymmetry() {
        const session = symmetry.value;
        if (!session || !activePlaneId.value) return;
        const source = [...workingParts.value.map(cloneProfilePart)];
        if (draft.value && draft.value.points.length >= 2) source.push(cloneProfilePart(draft.value));
        const parts = radialSymmetry(source, session.count, session.offset, session.selectedSector, session.mode);
        if (!parts.length) {
            message.warning('选中区域内还没有可完成的对称内容');
            return;
        }
        pushHistory();
        const entity = createEntity('sketch', uid());
        entity.name = uniqueEntityName(document.value, 'sketch');
        entity.planeId = activePlaneId.value;
        entity.profileType = 'polygon';
        entity.points = [];
        entity.parts = parts;
        entity.open = parts.every((part) => !part.closed);
        entity.position = [0, 0, 0];
        delete entity.depth;
        document.value.entities.push(entity);
        symmetry.value = null;
        draft.value = null;
        draftStart.value = null;
        pendingShape = false;
        activeTool.value = 'select';
        viewport()?.setTool('select');
        clearSketchSelection();
        selectedShapes.value = [entity.id];
        selectedIds.value = [entity.id];
        viewport()?.sync(document.value);
    }
    function updateSymmetry(key: 'count' | 'offset' | 'selectedSector' | 'mode', value: number | SymmetryMode) {
        const session = symmetry.value;
        if (!session) return;
        if (key === 'count') {
            session.count = Math.max(2, Math.min(24, Math.round(Number(value))));
            session.selectedSector = Math.min(session.selectedSector, session.count - 1);
        } else if (key === 'offset') session.offset = Math.max(0, Math.min(360, Number(value)));
        else if (key === 'selectedSector') session.selectedSector = Number(value);
        else session.mode = value as SymmetryMode;
    }

    function applyParts(parts: SketchProfilePart[], mapper: (part: SketchProfilePart) => SketchProfilePart) {
        return parts.map(mapper);
    }
    function replaceWorkingParts(before: SketchProfilePart[], next: SketchProfilePart[]) {
        const session = symmetry.value;
        if (!session) return;
        let cursor = 0;
        const take = () => next.slice(cursor, cursor += 1)[0];
        session.source = session.source.map((_, index) => take() || before[index]);
        session.drawings = session.drawings.map((_, index) => take() || before[session.source.length + index]);
    }
    function beginTransform(kind: Gesture['kind'], point: Point2, event: PointerEvent) {
        const before = new Map<string, SketchProfilePart[]>();
        const workingBefore = workingParts.value.map(cloneProfilePart);
        if (symmetry.value) {
            if (!workingSelection.value.length) return false;
        } else {
            if (!selectedEntities().length) return false;
            selectedEntities().forEach((entity) => before.set(entity.id, entityProfileParts(entity)));
            if (kind !== 'center') pushHistory();
            setTransforming(kind !== 'center');
        }
        const center = [...transformCenter.value] as Point2;
        gesture = {
            kind, pointerId: event.pointerId, startClient: [event.clientX, event.clientY], startPoint: point,
            moved: false, before, workingBefore, center,
            angle: Math.atan2(point[1] - center[1], point[0] - center[0]),
            distance: Math.hypot(point[0] - center[0], point[1] - center[1]),
        };
        return true;
    }
    function writeEntityParts(entity: ModelEntity, parts: SketchProfilePart[], mapper: (part: SketchProfilePart) => SketchProfilePart) {
        if (entity.parts?.length || entity.analyticCurves && Object.keys(entity.analyticCurves).length) {
            entity.parts = parts.map(cloneProfilePart);
            entity.points = [];
            entity.profileType = 'polygon';
            delete entity.curves;
            delete entity.analyticCurves;
            return;
        }
        const mapPoint = (point: Point2) => mapper({ points: [point], closed: false }).points[0];
        entity.points = (entity.points || []).map(mapPoint);
        Object.values(entity.curves || {}).forEach((curve) => {
            curve.c1 = mapPoint(curve.c1);
            curve.c2 = mapPoint(curve.c2);
        });
    }
    function transformAt(point: Point2, final = false) {
        const current = gesture;
        if (!current || current.kind === 'draw') return;
        if (current.kind === 'center') {
            transformCenter.value = point;
            return;
        }
        const center = current.center!;
        let mapper: (part: SketchProfilePart) => SketchProfilePart;
        if (current.kind === 'translate-x' || current.kind === 'translate-y') {
            const delta: Point2 = [point[0] - current.startPoint[0], point[1] - current.startPoint[1]];
            if (current.kind === 'translate-x') delta[1] = 0;
            else delta[0] = 0;
            mapper = (part) => translateProfilePart(part, delta);
        } else if (current.kind === 'rotate') {
            const angle = Math.atan2(point[1] - center[1], point[0] - center[0]);
            const degrees = (angle - current.angle!) * 180 / Math.PI;
            transformInput.value.angle = degrees;
            mapper = (part) => rotateProfilePart(part, center, degrees);
        } else {
            const distance = Math.hypot(point[0] - center[0], point[1] - center[1]);
            const scale = Math.max(0.01, distance / Math.max(current.distance!, 0.0001));
            transformInput.value.scale = scale;
            mapper = (part) => scaleProfilePart(part, center, scale);
        }
        if (symmetry.value) {
            const next = current.workingBefore!.map((part, index) => workingSelection.value.includes(index) ? mapper(part) : cloneProfilePart(part));
            replaceWorkingParts(current.workingBefore!, next);
        } else {
            selectedEntities().forEach((entity) => {
                const before = current.before!.get(entity.id);
                if (before) writeEntityParts(entity, applyParts(before, mapper), mapper);
            });
        }
        updateTranslationInput();
        if (final) refreshSketch();
    }
    function endTransform() {
        if (!gesture || gesture.kind === 'draw') return;
        gesture = null;
        setTransforming(false);
        viewport()?.sync(document.value);
        refreshSketch();
    }

    function setTransformInput(kind: 'x' | 'y' | 'angle' | 'scale', value: number) {
        if (!Number.isFinite(value) || !currentParts().length) return;
        const center = profilePartsCenter(currentParts());
        const before = currentParts().map(cloneProfilePart);
        let mapper: ((part: SketchProfilePart) => SketchProfilePart) | null = null;
        if (kind === 'x' || kind === 'y') {
            const delta: Point2 = kind === 'x' ? [value - center[0], 0] : [0, value - center[1]];
            mapper = (part) => translateProfilePart(part, delta);
        } else if (kind === 'angle') {
            const delta = value - transformInput.value.angle;
            mapper = (part) => rotateProfilePart(part, transformCenter.value, delta);
            transformInput.value.angle = value;
        } else {
            const next = Math.max(0.01, value);
            const factor = next / transformInput.value.scale;
            mapper = (part) => scaleProfilePart(part, transformCenter.value, factor);
            transformInput.value.scale = next;
        }
        if (!symmetry.value) {
            pushHistory();
            const selected = selectedEntities();
            selected.forEach((entity, index) => {
                const entityParts = before.slice(index ? selected.slice(0, index).reduce((sum, item) => sum + entityProfileParts(item).length, 0) : 0);
                writeEntityParts(entity, entityParts.slice(0, entityProfileParts(entity).length).map(mapper!), mapper!);
            });
            viewport()?.sync(document.value);
        } else {
            const next = before.map((part, index) => workingSelection.value.includes(index) ? mapper(part) : cloneProfilePart(part));
            replaceWorkingParts(before, next);
        }
        updateTranslationInput();
        refreshSketch();
    }

    function shapePoints(type: ProfileType, start: Point2, point: Point2): SketchProfilePart {
        if (type === 'rectangle') return { points: [start, [point[0], start[1]], point, [start[0], point[1]]], closed: true };
        if (type === 'circle' || type === 'ellipse' || type === 'regular') {
            const vertical: Point2 = [start[0], start[1] + Math.abs(point[1] - start[1]) || start[1] + Math.abs(point[0] - start[0])];
            const source = type === 'ellipse' ? [start, point, vertical] : [start, point];
            return { points: profilePoints(type, source, 64, undefined, sketchSides.value), closed: true };
        }
        return { points: [start, point], closed: false };
    }
    function commitDraft() {
        if (!symmetry.value || !draft.value || draft.value.points.length < 2) return;
        symmetry.value.drawings.push(cloneProfilePart(draft.value));
        draft.value = null;
        draftStart.value = null;
        pendingShape = false;
        workingSelection.value = [workingParts.value.length - 1];
        resetTransformValue();
    }

    function eventPoint(event: PointerEvent) { return viewport()?.sketchPointAt(event.clientX, event.clientY) || null; }
    function hitGizmo(point: { x: number; y: number }): Gesture['kind'] | null {
        const positions = inputPositions.value;
        const center = positions.center;
        if (!center) return null;
        const near = (target?: { x: number; y: number }, radius = 12) => !!target && Math.hypot(point.x - target.x, point.y - target.y) <= radius;
        if (near(center, 10) && activeTool.value !== 'translate') return 'center';
        if (activeTool.value === 'translate') {
            if (near(positions.xArrow)) return 'translate-x';
            if (near(positions.yArrow)) return 'translate-y';
        } else if (activeTool.value === 'rotate' && near(positions.rotateHandle, 14)) return 'rotate';
        else if (activeTool.value === 'scale') {
            if (near(positions.xArrow) || near(positions.xNegativeArrow)) return 'scale';
            if (near(positions.yArrow) || near(positions.yNegativeArrow)) return 'scale';
        }
        return null;
    }

    function pointerDown(event: PointerEvent) {
        if (!overlayActive.value || event.button !== 0) return;
        const point = eventPoint(event);
        if (!point) return;
        const session = symmetry.value;
        if (session?.step === 2) {
            session.selectedSector = sectorAtPoint(point, session.count, session.offset);
            event.preventDefault();
            return;
        }
        if (session?.step === 1) return;
        const canvas = event.currentTarget as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        if (['translate', 'rotate', 'scale'].includes(activeTool.value)) {
            const gizmo = hitGizmo(screen);
            if (gizmo && beginTransform(gizmo, point, event)) {
                canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
                return;
            }
            if (session) {
                const index = [...workingParts.value].reverse().findIndex((part) => hitProfilePart(part, point, viewport()?.sketchUnitsPerPixel() * 6));
                workingSelection.value = index >= 0 ? [workingParts.value.length - 1 - index] : [];
            } else {
                const entities = document.value.entities.filter((entity) => entity.kind === 'sketch' && entity.planeId === activePlaneId.value).reverse();
                const entity = entities.find((item) => entityProfileParts(item).some((part) => hitProfilePart(part, point, viewport()?.sketchUnitsPerPixel() * 6)));
                if (entity) selectSketchEntity(entity.id, event.shiftKey || event.metaKey || event.ctrlKey);
                else clearSketchSelection();
            }
            resetTransformValue();
            event.preventDefault();
            return;
        }
        if (!session || session.step !== 3 || sketchSelectionTool.value) {
            if (session && sketchSelectionTool.value) {
                const index = [...workingParts.value].reverse().findIndex((part) => hitProfilePart(part, point, viewport()?.sketchUnitsPerPixel() * 6));
                workingSelection.value = index >= 0 ? [workingParts.value.length - 1 - index] : [];
                resetTransformValue();
            }
            return;
        }
        if (pendingShape && draftStart.value) {
            draft.value = shapePoints(sketchType.value, draftStart.value, point);
            commitDraft();
            event.preventDefault();
            return;
        }
        if (['polygon', 'line'].includes(sketchType.value) && draft.value && !gesture) {
            if (sketchType.value === 'line') {
                draft.value.points.push(point);
                commitDraft();
            } else {
                const first = draft.value.points[0];
                if (draft.value.points.length >= 3 && Math.hypot(first[0] - point[0], first[1] - point[1]) < viewport()!.sketchUnitsPerPixel() * 8) {
                    draft.value.closed = true;
                    commitDraft();
                } else draft.value.points.push(point);
            }
            event.preventDefault();
            return;
        }
        draftStart.value = point;
        draft.value = ['polygon', 'line'].includes(sketchType.value) ? { points: [point], closed: false } : shapePoints(sketchType.value, point, point);
        gesture = { kind: 'draw', pointerId: event.pointerId, startClient: [event.clientX, event.clientY], startPoint: point, moved: false };
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function pointerMove(event: PointerEvent) {
        const point = eventPoint(event);
        if (!point) return;
        if (!gesture) {
            if (pendingShape && draftStart.value) draft.value = shapePoints(sketchType.value, draftStart.value, point);
            return;
        }
        if (event.pointerId !== gesture.pointerId) return;
        gesture.moved ||= Math.hypot(event.clientX - gesture.startClient[0], event.clientY - gesture.startClient[1]) > 4;
        if (gesture.kind === 'draw') {
            if (gesture.moved && draftStart.value) draft.value = shapePoints(sketchType.value, draftStart.value, point);
        } else transformAt(point);
        event.preventDefault();
    }
    function pointerUp(event: PointerEvent) {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const point = eventPoint(event);
        if (gesture.kind === 'draw') {
            if (gesture.moved && point && draftStart.value) {
                draft.value = shapePoints(sketchType.value, draftStart.value, point);
                commitDraft();
            } else if (!['polygon', 'line'].includes(sketchType.value)) pendingShape = true;
            gesture = null;
        } else {
            if (point) transformAt(point, true);
            endTransform();
        }
        event.preventDefault();
    }
    function doubleClick(event: MouseEvent) {
        if (draft.value && ['polygon', 'line'].includes(sketchType.value)) {
            commitDraft();
            event.preventDefault();
        }
    }
    function contextMenu(event: MouseEvent) {
        event.preventDefault();
        if (draft.value?.points.length) commitDraft();
    }

    function drawArrow(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, color: string) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = 2;
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
        context.beginPath();
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - 10 * Math.cos(angle - Math.PI / 6), to.y - 10 * Math.sin(angle - Math.PI / 6));
        context.lineTo(to.x - 10 * Math.cos(angle + Math.PI / 6), to.y - 10 * Math.sin(angle + Math.PI / 6));
        context.closePath(); context.fill();
    }
    function drawParts(context: CanvasRenderingContext2D, parts: SketchProfilePart[], project: (point: Point2) => { x: number; y: number }, active = false) {
        parts.forEach((part) => {
            if (part.points.length < 2) return;
            const points = part.points.map(project);
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
            if (part.closed) context.closePath();
            if (part.closed) {
                context.fillStyle = active ? SKETCH_COLORS.active : SKETCH_COLORS.fill;
                context.globalAlpha = active ? 0.1 : 0.16;
                context.fill();
            }
            context.globalAlpha = 1;
            context.strokeStyle = active ? SKETCH_COLORS.active : SKETCH_COLORS.line;
            context.lineWidth = active ? 2.5 : 1.7;
            context.stroke();
        });
        context.globalAlpha = 1;
    }
    function wedgePath(context: CanvasRenderingContext2D, center: { x: number; y: number }, start: number, end: number, radius: number) {
        const point = (degrees: number) => {
            const vector: Point2 = [Math.sin(degrees * Math.PI / 180) * radius, Math.cos(degrees * Math.PI / 180) * radius];
            const world = viewport()?.sketchScreen(vector) || { x: center.x + vector[0], y: center.y - vector[1] };
            return world;
        };
        const a = point(start), b = point(end);
        context.beginPath(); context.moveTo(center.x, center.y); context.lineTo(a.x, a.y); context.lineTo(b.x, b.y); context.closePath();
    }

    function render(canvas: HTMLCanvasElement) {
        const view = viewport();
        if (!view || !overlayActive.value) return;
        const width = canvas.clientWidth, height = canvas.clientHeight;
        const ratio = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
        }
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const project = (point: Point2) => view.sketchScreen(point);
        const origin = project([0, 0]);
        const session = symmetry.value;
        if (session) {
            context.fillStyle = VIEWPORT_COLORS.sketchBackground;
            context.fillRect(0, 0, width, height);
            const radius = Math.hypot(width, height) * 2;
            drawParts(context, renderedParts.value, project);
            if (session.step >= 2) {
                // Mask both the temporary plane and source copies outside the single active wedge.
                context.fillStyle = SKETCH_COLORS.edge;
                context.globalAlpha = 0.5;
                context.fillRect(0, 0, width, height);
                context.save();
                wedgePath(context, origin, session.offset + session.selectedSector * 360 / session.count, session.offset + (session.selectedSector + 1) * 360 / session.count, radius);
                context.clip();
                context.clearRect(0, 0, width, height);
                context.fillStyle = VIEWPORT_COLORS.sketchBackground;
                context.globalAlpha = 1;
                context.fillRect(0, 0, width, height);
                drawParts(context, renderedParts.value, project);
                context.restore();
                context.globalAlpha = 1;
            }
            context.strokeStyle = SKETCH_COLORS.planeBlue;
            context.globalAlpha = 0.65;
            context.lineWidth = 1.2;
            for (let index = 0; index < session.count; index++) {
                const angle = (session.offset + index * 360 / session.count) * Math.PI / 180;
                const a = project([Math.sin(angle) * radius, Math.cos(angle) * radius]);
                const b = project([-Math.sin(angle) * radius, -Math.cos(angle) * radius]);
                context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
            }
            context.globalAlpha = 1;
            context.fillStyle = SKETCH_COLORS.planeBlue;
            context.beginPath(); context.arc(origin.x, origin.y, 4, 0, Math.PI * 2); context.fill();
        } else drawParts(context, currentParts(), project, true);

        inputPositions.value = {};
        if (!session || session.step === 3) {
            if (['translate', 'rotate', 'scale'].includes(activeTool.value) && currentParts().length) {
                const center = project(transformCenter.value);
                const x = project([transformCenter.value[0] + 1, transformCenter.value[1]]);
                const y = project([transformCenter.value[0], transformCenter.value[1] + 1]);
                const length = 62;
                const unit = (target: { x: number; y: number }) => {
                    const dx = target.x - center.x, dy = target.y - center.y, size = Math.hypot(dx, dy) || 1;
                    return { x: dx / size, y: dy / size };
                };
                const ux = unit(x), uy = unit(y);
                const position = (direction: { x: number; y: number }, distance = length) => ({ x: center.x + direction.x * distance, y: center.y + direction.y * distance });
                const xArrow = position(ux), yArrow = position(uy);
                const next: Record<string, { x: number; y: number }> = { center, xArrow, yArrow };
                if (activeTool.value === 'translate') {
                    drawArrow(context, center, xArrow, SKETCH_COLORS.pointActive);
                    drawArrow(context, center, yArrow, SKETCH_COLORS.planeBlue);
                    next.x = position(ux, length + 34); next.y = position(uy, length + 34);
                } else if (activeTool.value === 'rotate') {
                    context.strokeStyle = SKETCH_COLORS.planeBlue; context.lineWidth = 2;
                    context.beginPath(); context.arc(center.x, center.y, 56, 0, Math.PI * 2); context.stroke();
                    const handle = { x: center.x + 56, y: center.y };
                    context.fillStyle = SKETCH_COLORS.pointActive; context.beginPath(); context.arc(handle.x, handle.y, 6, 0, Math.PI * 2); context.fill();
                    next.rotateHandle = handle; next.angle = { x: center.x + 16, y: center.y - 72 };
                } else {
                    const xNegative = position({ x: -ux.x, y: -ux.y }), yNegative = position({ x: -uy.x, y: -uy.y });
                    drawArrow(context, center, xArrow, SKETCH_COLORS.pointActive); drawArrow(context, center, xNegative, SKETCH_COLORS.pointActive);
                    drawArrow(context, center, yArrow, SKETCH_COLORS.planeBlue); drawArrow(context, center, yNegative, SKETCH_COLORS.planeBlue);
                    Object.assign(next, { xNegativeArrow: xNegative, yNegativeArrow: yNegative, scale: { x: center.x + 18, y: center.y - 76 } });
                }
                context.fillStyle = SKETCH_COLORS.point;
                context.strokeStyle = SKETCH_COLORS.pointActive;
                context.lineWidth = 2;
                context.beginPath(); context.arc(center.x, center.y, 6, 0, Math.PI * 2); context.fill(); context.stroke();
                inputPositions.value = next;
            }
        }
    }

    watch([selectedShapes, activeTool], () => {
        if (gesture) return;
        draft.value = null;
        draftStart.value = null;
        pendingShape = false;
        resetTransformValue();
    }, { deep: true });
    watch(() => symmetry.value?.step, () => resetTransformValue());

    return {
        symmetry, symmetryActive, transformActive, overlayActive, transformInput, inputPositions,
        startSymmetry, cancelSymmetry, nextSymmetryStep, updateSymmetry, setTransformInput,
        pointerDown, pointerMove, pointerUp, doubleClick, contextMenu, render,
    };
}

export type SketchAdvanced = ReturnType<typeof useSketchAdvanced>;
