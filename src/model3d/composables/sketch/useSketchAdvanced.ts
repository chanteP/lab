import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { ViewTool, Viewport } from '../../engine/Viewport';
import type { ProfileType } from '../../engine/profiles';
import {
    cloneProfilePart, entityProfileParts, hitProfilePart, profilePartCenter, profilePartsCenter, radialSymmetry, supportsMirrorSymmetry, symmetryRayAngles,
    regenerateProfilePart, rotateProfilePart, scaleProfilePart, sectorAtPoint, translateProfilePart,
    type SymmetryMode,
} from '../../engine/sketchAdvanced';
import { SKETCH_COLORS, VIEWPORT_COLORS } from '../../config/colors';
import { createEntity, type LengthUnit, type ModelDocument, type ModelEntity, type Point2, type SketchProfilePart } from '../../types';
import { uid } from '../../utils/id';
import { uniqueEntityName } from '../../utils/entity';
import { profilePoints } from '../../engine/profiles';
import { borderInterval, sliceBorder, type BorderSegment } from '../../engine/sketchBorders';
import { matchSketchGuide, type SketchGuideMatch } from '../../engine/sketchGuides';

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
    sources?: Map<string, { points: Point2[]; curves: ModelEntity['curves'] }>;
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
    sketchGuideSnapEnabled: Ref<boolean>;
    selectedShapes: Ref<string[]>;
    selectedIds: Ref<string[]>;
    lengthUnit: Ref<LengthUnit>;
    setLengthUnit: (unit: LengthUnit) => void;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    setTransforming: (value: boolean) => void;
    refreshSketch: () => void;
    syncSketchFromDocument: () => void;
    selectSketchEntity: (id: string, additive?: boolean) => void;
    clearSketchSelection: () => void;
    activateSketchSelectionTool: () => void;
}

/** Owns temporary symmetry geometry and direct 2D transforms without altering the source sketch. */
export function useSketchAdvanced(options: AdvancedOptions) {
    const {
        document, activePlaneId, activeTool, sketchType, sketchSides, sketchSelectionTool,
        sketchGuideSnapEnabled, selectedShapes, selectedIds, lengthUnit, setLengthUnit, viewport, message, pushHistory, setTransforming,
        refreshSketch, syncSketchFromDocument, selectSketchEntity, clearSketchSelection, activateSketchSelectionTool,
    } = options;
    const symmetry = ref<SymmetrySession | null>(null);
    const draft = ref<SketchProfilePart | null>(null);
    const draftStart = ref<Point2 | null>(null);
    const workingSelection = ref<number[]>([]);
    const transformCenter = ref<Point2>([0, 0]);
    const transformInput = ref({ x: 0, y: 0, angle: 0, scale: 1 });
    const inputPositions = ref<Record<string, { x: number; y: number }>>({});
    const hoverSector = ref<number | null>(null);
    const altTarget = ref<{ partIndex: number; start: number; end: number; points: Point2[] } | null>(null);
    const centerSnapMatches = ref<SketchGuideMatch[]>([]);
    let gesture: Gesture | null = null;
    let editGesture: { pointerId: number; partIndex: number; pointIndex: number; startPoint: Point2; before: SketchProfilePart } | null = null;
    const editHandles: { center: { x: number; y: number } | null; points: { index: number; x: number; y: number }[] } = { center: null, points: [] };
    let viewGesture = false;
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
        editGesture = null;
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
            editGesture = null;
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
            if (!supportsMirrorSymmetry(session.count)) session.mode = 'rotate';
        } else if (key === 'offset') session.offset = Math.max(0, Math.min(360, Number(value)));
        else if (key === 'selectedSector') session.selectedSector = Number(value);
        else session.mode = value === 'mirror' && !supportsMirrorSymmetry(session.count) ? 'rotate' : value as SymmetryMode;
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
        const sources = new Map<string, { points: Point2[]; curves: ModelEntity['curves'] }>();
        const workingBefore = workingParts.value.map(cloneProfilePart);
        if (symmetry.value) {
            if (!workingSelection.value.length) return false;
        } else {
            if (!selectedEntities().length) return false;
            selectedEntities().forEach((entity) => {
                before.set(entity.id, entityProfileParts(entity));
                sources.set(entity.id, { points: (entity.points || []).map((point) => [...point]), curves: JSON.parse(JSON.stringify(entity.curves || {})) });
            });
            if (kind !== 'center') pushHistory();
            setTransforming(kind !== 'center');
        }
        const center = [...transformCenter.value] as Point2;
        gesture = {
            kind, pointerId: event.pointerId, startClient: [event.clientX, event.clientY], startPoint: point,
            moved: false, before, sources, workingBefore, center,
            angle: Math.atan2(point[1] - center[1], point[0] - center[0]),
            distance: Math.hypot(point[0] - center[0], point[1] - center[1]),
        };
        return true;
    }
    function writeEntityParts(entity: ModelEntity, parts: SketchProfilePart[], mapper: (part: SketchProfilePart) => SketchProfilePart, source?: { points: Point2[]; curves: ModelEntity['curves'] }) {
        if (entity.parts?.length || entity.analyticCurves && Object.keys(entity.analyticCurves).length) {
            entity.parts = parts.map(cloneProfilePart);
            entity.points = [];
            entity.profileType = 'polygon';
            delete entity.curves;
            delete entity.analyticCurves;
            return;
        }
        const mapPoint = (point: Point2) => mapper({ points: [point], closed: false }).points[0];
        entity.points = (source?.points || entity.points || []).map(mapPoint);
        entity.curves = source ? JSON.parse(JSON.stringify(source.curves || {})) : entity.curves;
        Object.values(entity.curves || {}).forEach((curve) => {
            curve.c1 = mapPoint(curve.c1);
            curve.c2 = mapPoint(curve.c2);
        });
    }
    function snapCenterPoint(point: Point2, excludeWorkingIndex?: number): Point2 {
        centerSnapMatches.value = [];
        if (!sketchGuideSnapEnabled.value) return point;
        const plane = document.value.planes.find((item) => item.id === activePlaneId.value);
        if (!plane) return point;
        const excluded = new Set(selectedShapes.value);
        const entities = document.value.entities.filter((entity) => entity.kind === 'sketch' && entity.planeId === plane.id && !excluded.has(entity.id));
        if (symmetry.value) {
            workingParts.value.forEach((part, index) => {
                if (index === excludeWorkingIndex || workingSelection.value.includes(index) || !part.editor) return;
                entities.push({
                    id: `advanced:${index}`, parentId: null, kind: 'sketch', name: '', color: '', visible: true,
                    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], planeId: plane.id,
                    profileType: part.editor.type, points: part.editor.source, sides: part.editor.sides,
                });
            });
        }
        const offset = [-plane.origin[0], -plane.origin[1], -plane.origin[2]];
        const origins = [
            { id: 'plane' as const, point: [0, 0] as Point2 },
            { id: 'world' as const, point: [
                offset[0] * plane.u[0] + offset[1] * plane.u[1] + offset[2] * plane.u[2],
                offset[0] * plane.v[0] + offset[1] * plane.v[1] + offset[2] * plane.v[2],
            ] as Point2 },
        ];
        const match = matchSketchGuide({ entities, point, origins, threshold: (viewport()?.sketchUnitsPerPixel() || 0.1) * 8 });
        if (!match) return point;
        centerSnapMatches.value = match.matches;
        return match.point;
    }
    function transformAt(point: Point2, final = false) {
        const current = gesture;
        if (!current || current.kind === 'draw') return;
        if (current.kind === 'center') {
            transformCenter.value = snapCenterPoint(point);
            return;
        }
        const center = current.center!;
        let mapper: (part: SketchProfilePart) => SketchProfilePart;
        if (current.kind === 'translate-x' || current.kind === 'translate-y') {
            const delta: Point2 = [point[0] - current.startPoint[0], point[1] - current.startPoint[1]];
            if (current.kind === 'translate-x') delta[1] = 0;
            else delta[0] = 0;
            transformCenter.value = [center[0] + delta[0], center[1] + delta[1]];
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
                if (before) writeEntityParts(entity, applyParts(before, mapper), mapper, current.sources?.get(entity.id));
            });
            syncSketchFromDocument();
            refreshSketch();
        }
        updateTranslationInput();
        if (final) refreshSketch();
    }
    function endTransform() {
        if (!gesture || gesture.kind === 'draw') return;
        gesture = null;
        centerSnapMatches.value = [];
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
        if (!symmetry.value) syncSketchFromDocument();
        updateTranslationInput();
        if (kind === 'x' || kind === 'y') transformCenter.value = profilePartsCenter(currentParts());
        refreshSketch();
    }

    function shapePoints(type: ProfileType, start: Point2, point: Point2): SketchProfilePart {
        if (type === 'rectangle') {
            const source: Point2[] = [start, [point[0], start[1]], point, [start[0], point[1]]];
            return { points: source, closed: true, editor: { type, source } };
        }
        if (type === 'circle' || type === 'ellipse' || type === 'regular') {
            const vertical: Point2 = [start[0], start[1] + Math.abs(point[1] - start[1]) || start[1] + Math.abs(point[0] - start[0])];
            const source = type === 'ellipse' ? [start, point, vertical] : [start, point];
            return { points: profilePoints(type, source, 64, undefined, sketchSides.value), closed: true, editor: { type, source, sides: sketchSides.value } };
        }
        return { points: [start, point], closed: false, editor: { type, source: [start, point] } };
    }
    function commitDraft() {
        if (!symmetry.value || !draft.value || draft.value.points.length < 2) return;
        if (['polygon', 'line'].includes(sketchType.value)) draft.value.editor = { type: sketchType.value, source: draft.value.points.map((point) => [...point]) };
        symmetry.value.drawings.push(cloneProfilePart(draft.value));
        draft.value = null;
        draftStart.value = null;
        pendingShape = false;
        workingSelection.value = [workingParts.value.length - 1];
        resetTransformValue();
    }

    function eventPoint(event: PointerEvent) { return viewport()?.sketchPointAt(event.clientX, event.clientY, true) || null; }
    function hitGizmo(point: { x: number; y: number }): Gesture['kind'] | null {
        const positions = inputPositions.value;
        const center = positions.center;
        if (!center) return null;
        const near = (target?: { x: number; y: number }, radius = 12) => !!target && Math.hypot(point.x - target.x, point.y - target.y) <= radius;
        if (near(center, 16) && activeTool.value !== 'translate') return 'center';
        if (activeTool.value === 'translate') {
            if (near(positions.xArrow, 18)) return 'translate-x';
            if (near(positions.yArrow, 18)) return 'translate-y';
        } else if (activeTool.value === 'rotate' && near(positions.rotateHandle, 18)) return 'rotate';
        else if (activeTool.value === 'scale') {
            if (near(positions.xArrow, 18) || near(positions.xNegativeArrow, 18)) return 'scale';
            if (near(positions.yArrow, 18) || near(positions.yNegativeArrow, 18)) return 'scale';
        }
        return null;
    }

    function setWorkingPart(index: number, part: SketchProfilePart) {
        const session = symmetry.value;
        if (!session) return;
        if (index < session.source.length) session.source.splice(index, 1, part);
        else session.drawings.splice(index - session.source.length, 1, part);
    }
    function hitEditHandle(screen: { x: number; y: number }) {
        const near = (point: { x: number; y: number }, radius = 10) => Math.hypot(screen.x - point.x, screen.y - point.y) <= radius;
        const point = editHandles.points.find((handle) => near(handle));
        if (point) return point.index;
        if (editHandles.center && near(editHandles.center, 12)) return -1;
        return null;
    }
    function beginEditGesture(partIndex: number, pointIndex: number, point: Point2, event: PointerEvent) {
        const part = workingParts.value[partIndex];
        if (!part) return;
        editGesture = { pointerId: event.pointerId, partIndex, pointIndex, startPoint: point, before: cloneProfilePart(part) };
        (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
    }
    function updateEditGesture(point: Point2) {
        const current = editGesture;
        if (!current) return;
        if (current.pointIndex < 0) {
            const snapped = snapCenterPoint(point, current.partIndex);
            const delta: Point2 = [snapped[0] - current.startPoint[0], snapped[1] - current.startPoint[1]];
            setWorkingPart(current.partIndex, translateProfilePart(current.before, delta));
            return;
        }
        centerSnapMatches.value = [];
        const editor = current.before.editor;
        if (!editor) return;
        const nextEditor = { ...editor, source: editor.source.map((value) => [...value]) };
        if (editor.type === 'rectangle') {
            const opposite = editor.source[(current.pointIndex + 2) % 4];
            nextEditor.source = [opposite, [point[0], opposite[1]], point, [opposite[0], point[1]]];
        } else nextEditor.source[current.pointIndex] = point;
        setWorkingPart(current.partIndex, regenerateProfilePart(nextEditor, current.before.closed));
    }
    function workingBorders(): BorderSegment[] {
        return workingParts.value.map((part, partIndex) => ({
            entityId: String(partIndex), index: 0, sourceCount: part.points.length,
            points: part.closed ? [...part.points, part.points[0]] : part.points,
            closed: part.closed,
        }));
    }
    function updateAltTarget(point: Point2) {
        const borders = workingBorders();
        const tolerance = (viewport()?.sketchUnitsPerPixel() || 0.1) * 7;
        let closest: { partIndex: number; segmentIndex: number; distance: number } | null = null;
        borders.forEach((border, partIndex) => {
            for (let segmentIndex = 0; segmentIndex < border.points.length - 1; segmentIndex++) {
                const a = border.points[segmentIndex], b = border.points[segmentIndex + 1];
                const dx = b[0] - a[0], dy = b[1] - a[1];
                const lengthSquared = dx * dx + dy * dy;
                const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)) : 0;
                const distance = Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
                if (!closest || distance < closest.distance) closest = { partIndex, segmentIndex, distance };
            }
        });
        if (!closest || closest.distance > tolerance) { altTarget.value = null; return; }
        const target = closest as { partIndex: number; segmentIndex: number; distance: number };
        const border = borders[target.partIndex];
        const interval = borderInterval(border, borders, point);
        altTarget.value = { partIndex: target.partIndex, ...interval, points: sliceBorder(border, interval.start, interval.end) };
    }
    function replaceWorkingPart(index: number, replacements: SketchProfilePart[]) {
        const session = symmetry.value;
        if (!session) return;
        if (index < session.source.length) session.source.splice(index, 1, ...replacements);
        else session.drawings.splice(index - session.source.length, 1, ...replacements);
        workingSelection.value = [];
        altTarget.value = null;
    }
    function deleteAltTarget() {
        const target = altTarget.value;
        const part = target && workingParts.value[target.partIndex];
        if (!target || !part) return;
        if (target.start <= 0 && target.end >= 1) { replaceWorkingPart(target.partIndex, []); return; }
        const border = workingBorders()[target.partIndex];
        if (part.closed) {
            const remaining = sliceBorder(border, target.end, target.start + 1);
            replaceWorkingPart(target.partIndex, remaining.length >= 2 ? [{ points: remaining, closed: false }] : []);
            return;
        }
        const left = sliceBorder(border, 0, target.start), right = sliceBorder(border, target.end, 1);
        replaceWorkingPart(target.partIndex, [left, right].filter((points) => points.length >= 2).map((points) => ({ points, closed: false })));
    }
    function pointerDown(event: PointerEvent) {
        if (!overlayActive.value) return;
        const session = symmetry.value;
        if ((session?.step === 3 || transformActive.value) && event.button === 2) {
            viewGesture = true;
            (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
            viewport()?.forwardSketchPointer(event, 'down');
            event.preventDefault();
            return;
        }
        if (event.button !== 0) return;
        if (session?.step === 3 && event.altKey && altTarget.value) {
            deleteAltTarget();
            event.preventDefault();
            return;
        }
        const point = eventPoint(event);
        if (!point) return;
        if (session?.step === 2) {
            session.selectedSector = sectorAtPoint(point, session.count, session.offset);
            event.preventDefault();
            return;
        }
        if (session?.step === 1) return;
        const canvas = event.currentTarget as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        if (session?.step === 3 && sketchSelectionTool.value && activeTool.value === 'select') {
            const pointIndex = hitEditHandle(screen);
            if (pointIndex !== null && workingSelection.value.length === 1) {
                beginEditGesture(workingSelection.value[0], pointIndex, point, event);
                event.preventDefault();
                return;
            }
        }
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
        draft.value = ['polygon', 'line'].includes(sketchType.value) ? { points: [point], closed: false, editor: { type: sketchType.value, source: [point] } } : shapePoints(sketchType.value, point, point);
        gesture = { kind: 'draw', pointerId: event.pointerId, startClient: [event.clientX, event.clientY], startPoint: point, moved: false };
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function pointerMove(event: PointerEvent) {
        if (viewGesture) {
            viewport()?.forwardSketchPointer(event, 'move');
            event.preventDefault();
            return;
        }
        const point = eventPoint(event);
        if (!point) { hoverSector.value = null; altTarget.value = null; return; }
        if (editGesture) {
            updateEditGesture(point);
            event.preventDefault();
            return;
        }
        if (!gesture && symmetry.value?.step === 2) hoverSector.value = sectorAtPoint(point, symmetry.value.count, symmetry.value.offset);
        if (!gesture && symmetry.value?.step === 3 && event.altKey) updateAltTarget(point);
        else altTarget.value = null;
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
        if (viewGesture) {
            viewGesture = false;
            viewport()?.forwardSketchPointer(event, 'up');
            event.preventDefault();
            return;
        }
        if (editGesture) {
            if (event.pointerId === editGesture.pointerId) editGesture = null;
            centerSnapMatches.value = [];
            event.preventDefault();
            return;
        }
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
    function wheel(event: WheelEvent) {
        event.preventDefault();
        event.stopPropagation();
        viewport()?.forwardWheel(event);
    }
    function changeLengthUnit(unit: LengthUnit) { setLengthUnit(unit); }
    function pointerLeave() {
        hoverSector.value = null;
        altTarget.value = null;
        centerSnapMatches.value = [];
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
        context.lineWidth = 4;
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
        context.beginPath();
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - 13 * Math.cos(angle - Math.PI / 6), to.y - 13 * Math.sin(angle - Math.PI / 6));
        context.lineTo(to.x - 13 * Math.cos(angle + Math.PI / 6), to.y - 13 * Math.sin(angle + Math.PI / 6));
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

    function drawSketchGrid(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, project: (point: Point2) => { x: number; y: number }) {
        const view = viewport();
        if (!view) return;
        const rect = canvas.getBoundingClientRect();
        const corners = [
            view.sketchPointAt(rect.left, rect.top), view.sketchPointAt(rect.right, rect.top),
            view.sketchPointAt(rect.left, rect.bottom), view.sketchPointAt(rect.right, rect.bottom),
        ].filter(Boolean) as Point2[];
        if (corners.length !== 4) return;
        const xs = corners.map((point) => point[0]), ys = corners.map((point) => point[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const spacing = 10;
        if ((maxX - minX + maxY - minY) / spacing > 500) return;
        context.strokeStyle = VIEWPORT_COLORS.gridMajor;
        context.globalAlpha = 0.48;
        context.lineWidth = 1;
        for (let x = Math.floor(minX / spacing) * spacing; x <= maxX; x += spacing) {
            const a = project([x, minY]), b = project([x, maxY]);
            context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
        }
        for (let y = Math.floor(minY / spacing) * spacing; y <= maxY; y += spacing) {
            const a = project([minX, y]), b = project([maxX, y]);
            context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
        }
        context.globalAlpha = 0.8;
        [[project([minX, 0]), project([maxX, 0]), SKETCH_COLORS.pointActive], [project([0, minY]), project([0, maxY]), SKETCH_COLORS.planeBlue]].forEach(([a, b, color]) => {
            const start = a as { x: number; y: number }, end = b as { x: number; y: number };
            context.strokeStyle = color as string;
            context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
        });
        context.globalAlpha = 1;
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
            if (session.step === 3) drawSketchGrid(context, canvas, project);
            drawParts(context, renderedParts.value, project);
            if (session.step >= 2) {
                // Mask both the temporary plane and source copies outside the single active wedge.
                context.fillStyle = SKETCH_COLORS.point;
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
            if (session.step === 2 && hoverSector.value !== null) {
                wedgePath(context, origin, session.offset + hoverSector.value * 360 / session.count, session.offset + (hoverSector.value + 1) * 360 / session.count, radius);
                context.fillStyle = SKETCH_COLORS.active;
                context.globalAlpha = hoverSector.value === session.selectedSector ? 0.12 : 0.22;
                context.fill();
                context.globalAlpha = 1;
            }
            if (altTarget.value?.points.length) {
                const points = altTarget.value.points.map(project);
                context.strokeStyle = SKETCH_COLORS.deletePoint;
                context.lineWidth = 4;
                context.beginPath(); context.moveTo(points[0].x, points[0].y);
                points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
                context.stroke();
            }
            context.strokeStyle = SKETCH_COLORS.planeBlue;
            context.globalAlpha = 0.65;
            context.lineWidth = 1.2;
            symmetryRayAngles(session.count, session.offset).forEach((degrees) => {
                const angle = degrees * Math.PI / 180;
                const end = project([Math.sin(angle) * radius, Math.cos(angle) * radius]);
                context.beginPath(); context.moveTo(origin.x, origin.y); context.lineTo(end.x, end.y); context.stroke();
            });
            context.globalAlpha = 1;
            context.fillStyle = SKETCH_COLORS.planeBlue;
            context.beginPath(); context.arc(origin.x, origin.y, 4, 0, Math.PI * 2); context.fill();
        } else drawParts(context, currentParts(), project, true);

        inputPositions.value = {};
        if (centerSnapMatches.value.length) {
            const radius = Math.hypot(width, height) * 2;
            centerSnapMatches.value.forEach((match) => {
                const direction: Point2 = [match.b[0] - match.a[0], match.b[1] - match.a[1]];
                const length = Math.hypot(direction[0], direction[1]) || 1;
                const unit: Point2 = [direction[0] / length, direction[1] / length];
                const a = project([match.a[0] - unit[0] * radius, match.a[1] - unit[1] * radius]);
                const b = project([match.a[0] + unit[0] * radius, match.a[1] + unit[1] * radius]);
                context.strokeStyle = match.reference.kind === 'origin' ? SKETCH_COLORS.guide : SKETCH_COLORS.reference;
                context.globalAlpha = 0.8;
                context.lineWidth = 1.5;
                context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
                const reference = project(match.a);
                context.fillStyle = context.strokeStyle;
                context.beginPath(); context.arc(reference.x, reference.y, 4, 0, Math.PI * 2); context.fill();
            });
            context.globalAlpha = 1;
        }
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
                    next.x = position(ux, length + 72); next.y = position(uy, length + 72);
                } else if (activeTool.value === 'rotate') {
                    context.strokeStyle = SKETCH_COLORS.planeBlue; context.lineWidth = 4;
                    context.beginPath(); context.arc(center.x, center.y, 56, 0, Math.PI * 2); context.stroke();
                    const handleAngle = -transformInput.value.angle * Math.PI / 180;
                    const handle = { x: center.x + 56 * Math.cos(handleAngle), y: center.y + 56 * Math.sin(handleAngle) };
                    context.fillStyle = SKETCH_COLORS.pointActive; context.beginPath(); context.arc(handle.x, handle.y, 8, 0, Math.PI * 2); context.fill();
                    next.rotateHandle = handle; next.angle = { x: center.x, y: center.y - 96 };
                } else {
                    const xNegative = position({ x: -ux.x, y: -ux.y }), yNegative = position({ x: -uy.x, y: -uy.y });
                    drawArrow(context, center, xArrow, SKETCH_COLORS.pointActive); drawArrow(context, center, xNegative, SKETCH_COLORS.pointActive);
                    drawArrow(context, center, yArrow, SKETCH_COLORS.planeBlue); drawArrow(context, center, yNegative, SKETCH_COLORS.planeBlue);
                    Object.assign(next, { xNegativeArrow: xNegative, yNegativeArrow: yNegative, scale: { x: center.x, y: center.y - 96 } });
                }
                context.fillStyle = SKETCH_COLORS.point;
                context.strokeStyle = SKETCH_COLORS.pointActive;
                context.lineWidth = 3;
                context.beginPath(); context.arc(center.x, center.y, 8, 0, Math.PI * 2); context.fill(); context.stroke();
                inputPositions.value = next;
            }
        }
        editHandles.center = null;
        editHandles.points = [];
        if (session?.step === 3 && sketchSelectionTool.value && activeTool.value === 'select' && workingSelection.value.length === 1) {
            const part = workingParts.value[workingSelection.value[0]];
            if (part) {
                drawParts(context, [part], project, true);
                const center = project(profilePartCenter(part));
                editHandles.center = center;
                context.fillStyle = SKETCH_COLORS.point;
                context.strokeStyle = SKETCH_COLORS.pointActive;
                context.lineWidth = 2;
                context.beginPath(); context.arc(center.x, center.y, 7, 0, Math.PI * 2); context.fill(); context.stroke();
                const centerIsSemantic = ['circle', 'ellipse', 'regular'].includes(part.editor?.type || '');
                part.editor?.source.forEach((source, index) => {
                    if (centerIsSemantic && index === 0) return;
                    const handle = project(source);
                    editHandles.points.push({ index, x: handle.x, y: handle.y });
                    context.fillStyle = SKETCH_COLORS.point;
                    context.strokeStyle = SKETCH_COLORS.planeBlue;
                    context.beginPath(); context.arc(handle.x, handle.y, 5, 0, Math.PI * 2); context.fill(); context.stroke();
                });
            }
        }
    }

    watch([selectedShapes, activeTool], () => {
        if (gesture) return;
        editGesture = null;
        draft.value = null;
        draftStart.value = null;
        pendingShape = false;
        resetTransformValue();
    }, { deep: true });
    watch(() => symmetry.value?.step, () => resetTransformValue());

    return {
        symmetry, symmetryActive, transformActive, overlayActive, transformInput, inputPositions, lengthUnit,
        startSymmetry, cancelSymmetry, nextSymmetryStep, updateSymmetry, setTransformInput,
        pointerDown, pointerMove, pointerUp, pointerLeave, wheel, changeLengthUnit, doubleClick, contextMenu, render,
    };
}

export type SketchAdvanced = ReturnType<typeof useSketchAdvanced>;
