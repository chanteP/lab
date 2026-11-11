import { computed, ref, watch, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import { SKETCH_COLORS } from '../../config/colors';
import { entityProfileParts, profilePartsCenter, sketchOperationPoints } from '../../engine/sketchAdvanced';
import {
    linearPatternCopies, linearPatternEntities, snapLinearPatternDirection,
    type LinearPatternReference, type LinearPatternSnap, type LinearPatternValue,
} from '../../engine/sketchLinearPattern';
import type { ViewTool, Viewport } from '../../engine/Viewport';
import type { LengthUnit, ModelDocument, ModelEntity, Point2, SketchProfilePart } from '../../types';

interface LinearPatternOptions {
    document: Ref<ModelDocument>;
    activePlaneId: Ref<string | null>;
    activeTool: Ref<ViewTool>;
    selectedShapes: Ref<string[]>;
    selectedIds: Ref<string[]>;
    spaceActive: Ref<boolean>;
    sketchGuideSnapEnabled: Ref<boolean>;
    lengthUnit: Ref<LengthUnit>;
    setLengthUnit: (unit: LengthUnit) => void;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    clearSketchSelection: () => void;
    selectSketchEntity: (id: string, additive?: boolean) => void;
    activateSketchSelectionTool: () => void;
}

type LinearPatternSession = LinearPatternValue & { sourceIds: string[]; origin: Point2 };
type Drag = { pointerId: number; client: Point2; moved: boolean; direction: Point2; spacing: number };

/** Shapr3D-style live linear copies: count, spacing and one draggable direction arrow. */
export function useSketchLinearPattern(options: LinearPatternOptions) {
    const {
        document, activePlaneId, activeTool, selectedShapes, selectedIds, spaceActive, sketchGuideSnapEnabled,
        lengthUnit, setLengthUnit, viewport, message, pushHistory,
        clearSketchSelection, selectSketchEntity, activateSketchSelectionTool,
    } = options;
    const session = ref<LinearPatternSession | null>(null);
    const snap = ref<LinearPatternSnap | null>(null);
    const inputPosition = ref<{ x: number; y: number } | null>(null);
    let drag: Drag | null = null;
    let viewGesture = false;

    const active = computed(() => !!session.value);
    const sourceEntities = computed(() => session.value?.sourceIds
        .map((id) => document.value.entities.find((entity) => entity.id === id && entity.kind === 'sketch'))
        .filter(Boolean) as ModelEntity[] || []);
    const sourceParts = computed(() => sourceEntities.value.flatMap(entityProfileParts));
    const previewParts = computed(() => session.value ? linearPatternCopies(sourceParts.value, session.value) : []);

    function start() {
        if (session.value) return;
        const sourceIds = [...selectedShapes.value];
        const entities = sourceIds.map((id) => document.value.entities.find((entity) => entity.id === id && entity.kind === 'sketch')).filter(Boolean) as ModelEntity[];
        const parts = entities.flatMap(entityProfileParts);
        if (!parts.length) return message.warning('请先选择要复制的草图形状');
        const points = parts.flatMap((part) => part.points);
        const xs = points.map((point) => point[0]);
        const extent = Math.max(...xs) - Math.min(...xs);
        session.value = { sourceIds, origin: profilePartsCenter(parts), count: 1, direction: [1, 0], spacing: Math.max(10, extent + 10) };
        snap.value = null;
        activeTool.value = 'select';
        activateSketchSelectionTool();
        viewport()?.setTool('select');
    }

    function cancel() {
        drag = null;
        viewGesture = false;
        session.value = null;
        snap.value = null;
        inputPosition.value = null;
    }

    function updateCount(value: number) {
        if (!session.value || !Number.isFinite(value)) return;
        session.value.count = Math.max(1, Math.min(100, Math.round(value)));
    }
    function updateSpacing(value: number) {
        if (!session.value || !Number.isFinite(value)) return;
        session.value.spacing = Math.max(0.01, value);
    }
    function changeLengthUnit(unit: LengthUnit) { setLengthUnit(unit); }

    function references(): LinearPatternReference {
        const excluded = new Set(session.value?.sourceIds || []);
        const entities = document.value.entities.filter((entity) => entity.kind === 'sketch' && entity.planeId === activePlaneId.value && !excluded.has(entity.id));
        return {
            points: entities.flatMap(sketchOperationPoints),
            edges: entities.flatMap((entity) => entityProfileParts(entity).flatMap((part) => part.points.slice(1).map((b, index) => ({
                a: part.points[index], b,
            })))),
        };
    }

    function updateDirection(point: Point2) {
        const current = session.value;
        if (!current) return;
        if (!sketchGuideSnapEnabled.value) {
            const distance = Math.hypot(point[0] - current.origin[0], point[1] - current.origin[1]);
            if (distance < 1e-7) return;
            const length = distance / current.count;
            current.direction = [(point[0] - current.origin[0]) / distance, (point[1] - current.origin[1]) / distance];
            current.spacing = Math.max(0.01, length);
            snap.value = null;
            return;
        }
        const threshold = (viewport()?.sketchUnitsPerPixel() || 0.1) * 9;
        const matched = snapLinearPatternDirection(current.origin, point, references(), threshold);
        const distance = Math.hypot(matched.endpoint[0] - current.origin[0], matched.endpoint[1] - current.origin[1]);
        if (distance < 1e-7) return;
        current.direction = matched.direction;
        current.spacing = Math.max(0.01, distance / current.count);
        snap.value = matched.kind ? matched : null;
    }

    function pointerDown(event: PointerEvent) {
        if (!session.value) return;
        if (event.button === 0 && spaceActive.value) {
            viewport()?.forwardSpacePan(event);
            event.preventDefault();
            return;
        }
        if (event.button === 2) {
            viewGesture = true;
            (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
            viewport()?.forwardSketchPointer(event, 'down');
            event.preventDefault();
            return;
        }
        if (event.button !== 0) return;
        const canvas = event.currentTarget as HTMLCanvasElement;
        drag = { pointerId: event.pointerId, client: [event.clientX, event.clientY], moved: false, direction: [...session.value.direction], spacing: session.value.spacing };
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }
    function pointerMove(event: PointerEvent) {
        if (viewGesture) {
            viewport()?.forwardSketchPointer(event, 'move');
            event.preventDefault();
            return;
        }
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.moved ||= Math.hypot(event.clientX - drag.client[0], event.clientY - drag.client[1]) > 4;
        if (!drag.moved) return;
        const point = viewport()?.sketchPointAt(event.clientX, event.clientY, true);
        if (point) updateDirection(point);
        event.preventDefault();
    }
    function pointerUp(event: PointerEvent) {
        if (viewGesture) {
            viewGesture = false;
            viewport()?.forwardSketchPointer(event, 'up');
            event.preventDefault();
            return;
        }
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (drag.moved) {
            const point = viewport()?.sketchPointAt(event.clientX, event.clientY, true);
            if (point) updateDirection(point);
        } else if (session.value) {
            session.value.direction = drag.direction;
            session.value.spacing = drag.spacing;
        }
        drag = null;
        snap.value = null;
        event.preventDefault();
    }
    function pointerLeave() { if (!drag) snap.value = null; }
    function wheel(event: WheelEvent) {
        event.preventDefault();
        event.stopPropagation();
        viewport()?.forwardWheel(event);
    }
    function contextMenu(event: MouseEvent) { event.preventDefault(); }

    function complete() {
        const current = session.value;
        if (!current || current.spacing <= 0 || !sourceParts.value.length) return;
        const copies = linearPatternEntities(document.value, current.sourceIds, current);
        if (!copies.length) return message.warning('没有可复制的草图形状');
        pushHistory();
        document.value.entities.push(...copies);
        session.value = null;
        snap.value = null;
        clearSketchSelection();
        copies.forEach((entity) => selectSketchEntity(entity.id, true));
        selectedIds.value = copies.map((entity) => entity.id);
        viewport()?.sync(document.value);
    }

    function drawParts(context: CanvasRenderingContext2D, parts: SketchProfilePart[], project: (point: Point2) => { x: number; y: number }) {
        context.strokeStyle = SKETCH_COLORS.line;
        context.fillStyle = SKETCH_COLORS.fill;
        context.lineWidth = 1.5;
        parts.forEach((part) => {
            if (part.points.length < 2) return;
            const points = part.points.map(project);
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
            if (part.closed) context.closePath();
            if (part.closed) {
                context.globalAlpha = 0.12;
                context.fill();
            }
            context.globalAlpha = 0.78;
            context.stroke();
        });
        context.globalAlpha = 1;
    }
    function drawArrow(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        context.strokeStyle = SKETCH_COLORS.planeBlue;
        context.fillStyle = SKETCH_COLORS.planeBlue;
        context.lineWidth = 4;
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
        context.beginPath();
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - 13 * Math.cos(angle - Math.PI / 6), to.y - 13 * Math.sin(angle - Math.PI / 6));
        context.lineTo(to.x - 13 * Math.cos(angle + Math.PI / 6), to.y - 13 * Math.sin(angle + Math.PI / 6));
        context.closePath(); context.fill();
    }
    function render(canvas: HTMLCanvasElement) {
        const current = session.value, view = viewport();
        if (!current || !view) return;
        const width = canvas.clientWidth, height = canvas.clientHeight, ratio = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
        }
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const project = (point: Point2) => view.sketchScreen(point);
        drawParts(context, previewParts.value, project);
        const origin = project(current.origin);
        const endPoint: Point2 = [
            current.origin[0] + current.direction[0] * current.spacing * current.count,
            current.origin[1] + current.direction[1] * current.spacing * current.count,
        ];
        const end = project(endPoint);
        if (snap.value) {
            const direction = snap.value.direction;
            const radius = Math.hypot(width, height) * 2;
            const a = project([current.origin[0] - direction[0] * radius, current.origin[1] - direction[1] * radius]);
            const b = project([current.origin[0] + direction[0] * radius, current.origin[1] + direction[1] * radius]);
            context.strokeStyle = snap.value.kind === 'axis' ? SKETCH_COLORS.guide : SKETCH_COLORS.reference;
            context.lineWidth = 1.5;
            context.setLineDash([6, 4]);
            context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
            context.setLineDash([]);
        }
        drawArrow(context, origin, end);
        context.fillStyle = SKETCH_COLORS.point;
        context.strokeStyle = SKETCH_COLORS.planeBlue;
        context.lineWidth = 3;
        context.beginPath(); context.arc(end.x, end.y, 8, 0, Math.PI * 2); context.fill(); context.stroke();
        const dx = end.x - origin.x, dy = end.y - origin.y, length = Math.hypot(dx, dy) || 1;
        inputPosition.value = { x: end.x - dy / length * 52, y: end.y + dx / length * 52 };
    }

    watch(selectedShapes, (ids) => {
        if (session.value && (ids.length !== session.value.sourceIds.length || ids.some((id) => !session.value!.sourceIds.includes(id)))) cancel();
    }, { deep: true });

    return {
        session, active, inputPosition, lengthUnit, start, cancel, complete, updateCount, updateSpacing, changeLengthUnit,
        pointerDown, pointerMove, pointerUp, pointerLeave, wheel, contextMenu, render,
    };
}

export type SketchLinearPattern = ReturnType<typeof useSketchLinearPattern>;
