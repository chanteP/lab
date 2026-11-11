import { computed, ref, watch, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import { SKETCH_COLORS } from '../../config/colors';
import { entityProfileParts, profilePartsCenter, rotateProfilePart } from '../../engine/sketchAdvanced';
import { matchSketchGuide, type SketchGuideMatch } from '../../engine/sketchGuides';
import { radialPatternCopies, radialPatternEntities, type RadialPatternValue } from '../../engine/sketchRadialPattern';
import type { ViewTool, Viewport } from '../../engine/Viewport';
import type { ModelDocument, ModelEntity, Point2, SketchProfilePart } from '../../types';

interface RadialPatternOptions {
    document: Ref<ModelDocument>;
    activePlaneId: Ref<string | null>;
    activeTool: Ref<ViewTool>;
    selectedShapes: Ref<string[]>;
    selectedIds: Ref<string[]>;
    spaceActive: Ref<boolean>;
    sketchGuideSnapEnabled: Ref<boolean>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    clearSketchSelection: () => void;
    selectSketchEntity: (id: string, additive?: boolean) => void;
    activateSketchSelectionTool: () => void;
}

type RadialSession = RadialPatternValue & { sourceIds: string[]; center: Point2 };
type Drag = { kind: 'center' | 'angle'; pointerId: number; client: Point2; moved: boolean; pointerAngle: number; before: Point2 | number };

/** Circular Shapr3D-style pattern with a magnetic pivot, count and signed total angle. */
export function useSketchRadialPattern(options: RadialPatternOptions) {
    const {
        document, activePlaneId, activeTool, selectedShapes, selectedIds, spaceActive, sketchGuideSnapEnabled,
        viewport, message, pushHistory, clearSketchSelection, selectSketchEntity, activateSketchSelectionTool,
    } = options;
    const session = ref<RadialSession | null>(null);
    const snapMatches = ref<SketchGuideMatch[]>([]);
    const handles: { center: { x: number; y: number } | null; angle: { x: number; y: number } | null } = { center: null, angle: null };
    let drag: Drag | null = null;
    let viewGesture = false;

    const active = computed(() => !!session.value);
    const sourceEntities = computed(() => session.value?.sourceIds
        .map((id) => document.value.entities.find((entity) => entity.id === id && entity.kind === 'sketch'))
        .filter(Boolean) as ModelEntity[] || []);
    const sourceParts = computed(() => sourceEntities.value.flatMap(entityProfileParts));
    const previewParts = computed(() => session.value ? radialPatternCopies(sourceParts.value, session.value.center, session.value) : []);

    function start() {
        if (session.value) return;
        const sourceIds = [...selectedShapes.value];
        const entities = sourceIds.map((id) => document.value.entities.find((entity) => entity.id === id && entity.kind === 'sketch')).filter(Boolean) as ModelEntity[];
        const parts = entities.flatMap(entityProfileParts);
        if (!parts.length) return message.warning('请先选择要旋转复制的草图形状');
        session.value = { sourceIds, center: profilePartsCenter(parts), count: 1, angle: 360 };
        activeTool.value = 'select';
        activateSketchSelectionTool();
        viewport()?.setTool('select');
    }
    function cancel() {
        drag = null;
        viewGesture = false;
        session.value = null;
        snapMatches.value = [];
        handles.center = handles.angle = null;
    }
    function updateCount(value: number) {
        if (session.value && Number.isFinite(value)) session.value.count = Math.max(1, Math.min(100, Math.round(value)));
    }
    function updateAngle(value: number) {
        if (!session.value || !Number.isFinite(value)) return;
        session.value.angle = Math.max(-360, Math.min(360, value)) || 1;
    }
    function reverse() { if (session.value) session.value.angle *= -1; }

    function snapCenter(point: Point2) {
        snapMatches.value = [];
        if (!sketchGuideSnapEnabled.value) return point;
        const plane = document.value.planes.find((item) => item.id === activePlaneId.value);
        if (!plane) return point;
        const offset = [-plane.origin[0], -plane.origin[1], -plane.origin[2]];
        const match = matchSketchGuide({
            entities: document.value.entities.filter((entity) => entity.kind === 'sketch' && entity.planeId === plane.id),
            point, excludeEntityIds: session.value?.sourceIds || [], guides: plane.guides,
            origins: [{ id: 'plane', point: [0, 0] }, { id: 'world', point: [
                offset[0] * plane.u[0] + offset[1] * plane.u[1] + offset[2] * plane.u[2],
                offset[0] * plane.v[0] + offset[1] * plane.v[1] + offset[2] * plane.v[2],
            ] }], threshold: (viewport()?.sketchUnitsPerPixel() || 0.1) * 8,
        });
        if (!match) return point;
        snapMatches.value = match.matches;
        return match.point;
    }
    function pointerAngle(point: Point2) {
        const center = session.value?.center || [0, 0];
        return Math.atan2(point[1] - center[1], point[0] - center[0]) * 180 / Math.PI;
    }
    function near(point: { x: number; y: number }, target: { x: number; y: number } | null, radius: number) {
        return !!target && Math.hypot(point.x - target.x, point.y - target.y) <= radius;
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
        const point = viewport()?.sketchPointAt(event.clientX, event.clientY, true);
        if (!point) return;
        const rect = (event.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const centerDrag = near(screen, handles.center, 15);
        drag = {
            kind: centerDrag ? 'center' : 'angle', pointerId: event.pointerId, client: [event.clientX, event.clientY], moved: false,
            pointerAngle: pointerAngle(point), before: centerDrag ? [...session.value.center] : session.value.angle,
        };
        (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
        event.preventDefault();
    }
    function pointerMove(event: PointerEvent) {
        if (viewGesture) {
            viewport()?.forwardSketchPointer(event, 'move');
            event.preventDefault();
            return;
        }
        if (!drag || event.pointerId !== drag.pointerId || !session.value) return;
        drag.moved ||= Math.hypot(event.clientX - drag.client[0], event.clientY - drag.client[1]) > 4;
        if (!drag.moved) return;
        const point = viewport()?.sketchPointAt(event.clientX, event.clientY, true);
        if (!point) return;
        if (drag.kind === 'center') session.value.center = snapCenter(point);
        else {
            const delta = pointerAngle(point) - drag.pointerAngle;
            updateAngle((drag.before as number) + delta);
        }
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
        drag = null;
        snapMatches.value = [];
        event.preventDefault();
    }
    function pointerLeave() { if (!drag) snapMatches.value = []; }
    function wheel(event: WheelEvent) { event.preventDefault(); event.stopPropagation(); viewport()?.forwardWheel(event); }
    function contextMenu(event: MouseEvent) { event.preventDefault(); }

    function complete() {
        const current = session.value;
        if (!current || !sourceParts.value.length) return;
        const copies = radialPatternEntities(document.value, current.sourceIds, current.center, current);
        if (!copies.length) return message.warning('没有可旋转复制的草图形状');
        pushHistory();
        document.value.entities.push(...copies);
        session.value = null;
        snapMatches.value = [];
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
            context.beginPath(); context.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
            if (part.closed) context.closePath();
            if (part.closed) { context.globalAlpha = 0.12; context.fill(); }
            context.globalAlpha = 0.78; context.stroke();
        });
        context.globalAlpha = 1;
    }
    function rotated(point: Point2, center: Point2, angle: number) { return rotateProfilePart({ points: [point], closed: false }, center, angle).points[0]; }
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
        const center = project(current.center);
        const radius = 70 * view.sketchUnitsPerPixel();
        const steps = Math.max(2, Math.ceil(Math.abs(current.angle) / 5));
        const arc = Array.from({ length: steps + 1 }, (_, index) => project(rotated([current.center[0] + radius, current.center[1]], current.center, current.angle * index / steps)));
        context.strokeStyle = SKETCH_COLORS.planeBlue;
        context.lineWidth = 3;
        context.beginPath(); context.moveTo(arc[0].x, arc[0].y);
        arc.slice(1).forEach((point) => context.lineTo(point.x, point.y)); context.stroke();
        const end = arc[arc.length - 1], previous = arc[arc.length - 2];
        const tangent = Math.atan2(end.y - previous.y, end.x - previous.x);
        context.fillStyle = SKETCH_COLORS.planeBlue;
        context.beginPath(); context.moveTo(end.x, end.y);
        context.lineTo(end.x - 12 * Math.cos(tangent - Math.PI / 6), end.y - 12 * Math.sin(tangent - Math.PI / 6));
        context.lineTo(end.x - 12 * Math.cos(tangent + Math.PI / 6), end.y - 12 * Math.sin(tangent + Math.PI / 6));
        context.closePath(); context.fill();
        context.fillStyle = SKETCH_COLORS.point;
        context.lineWidth = 3;
        context.beginPath(); context.arc(center.x, center.y, 8, 0, Math.PI * 2); context.fill(); context.stroke();
        handles.center = center;
        handles.angle = end;
        if (snapMatches.value.length) {
            snapMatches.value.forEach((match) => {
                const a = project(match.a), b = project(match.b);
                context.strokeStyle = SKETCH_COLORS.reference; context.lineWidth = 1.5;
                context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
            });
        }
    }

    watch(selectedShapes, (ids) => {
        if (session.value && (ids.length !== session.value.sourceIds.length || ids.some((id) => !session.value!.sourceIds.includes(id)))) cancel();
    }, { deep: true });

    return {
        session, active, start, cancel, complete, updateCount, updateAngle, reverse,
        pointerDown, pointerMove, pointerUp, pointerLeave, wheel, contextMenu, render,
    };
}

export type SketchRadialPattern = ReturnType<typeof useSketchRadialPattern>;
