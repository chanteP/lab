import type { ModelDocument, ModelEntity, ModelFolder, Point2, SketchCurve } from '../types';

export type SketchAssetTarget = { id: string; kind: 'image' | 'svg'; corners: Point2[]; aspectLocked: boolean };

export function cornersFromBounds(points: Point2[]): Point2[] {
    if (!points.length) return [];
    const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

export function folderEntities(document: ModelDocument, folderId: string) {
    const folderIds = new Set([folderId]);
    let changed = true;
    while (changed) {
        changed = false;
        document.folders.forEach((folder) => {
            if (folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) {
                folderIds.add(folder.id);
                changed = true;
            }
        });
    }
    return document.entities.filter((entity) => entity.parentId && folderIds.has(entity.parentId));
}

function entityPoints(entity: ModelEntity) {
    return [
        ...(entity.points || []),
        ...(entity.parts || []).flatMap((part) => part.points),
        ...Object.values(entity.curves || {}).flatMap((curve) => [curve.c1, curve.c2]),
    ];
}

export function sketchAssetTarget(document: ModelDocument, id: string | null): SketchAssetTarget | null {
    if (!id) return null;
    const image = document.entities.find((entity) => entity.id === id && entity.kind === 'image');
    if (image) {
        const corners = cornersFromBounds(image.points || []);
        return corners.length === 4 ? { id, kind: 'image', corners, aspectLocked: image.aspectLocked !== false } : null;
    }
    const folder = document.folders.find((item) => item.id === id && item.kind === 'svg');
    if (!folder) return null;
    const generated = cornersFromBounds(folderEntities(document, id).flatMap(entityPoints));
    const corners = folder.sketchCorners?.length === 4 ? folder.sketchCorners : generated;
    return corners.length === 4 ? { id, kind: 'svg', corners: corners.map((point) => [...point]), aspectLocked: folder.aspectLocked !== false } : null;
}

/** Corner resizing keeps the opposite corner fixed and optionally projects the gesture onto the original diagonal. */
export function resizeAssetCorners(source: Point2[], index: number, point: Point2, aspectLocked: boolean): Point2[] {
    if (source.length !== 4 || index < 0 || index > 3) return source.map((corner) => [...corner]);
    const opposite = source[(index + 2) % 4];
    const originalWidth = Math.abs(source[1][0] - source[0][0]) || 1;
    const originalHeight = Math.abs(source[2][1] - source[1][1]) || 1;
    let width = Math.max(0.1, Math.abs(point[0] - opposite[0]));
    let height = Math.max(0.1, Math.abs(point[1] - opposite[1]));
    if (aspectLocked) {
        const scale = Math.max(0.001, (width * originalWidth + height * originalHeight) / (originalWidth ** 2 + originalHeight ** 2));
        width = originalWidth * scale;
        height = originalHeight * scale;
    }
    const x = point[0] >= opposite[0] ? opposite[0] + width : opposite[0] - width;
    const y = point[1] >= opposite[1] ? opposite[1] + height : opposite[1] - height;
    const next = [opposite, [x, opposite[1]], [x, y], [opposite[0], y]] as Point2[];
    const result = Array<Point2>(4);
    next.forEach((corner, offset) => { result[(index + 2 + offset) % 4] = corner; });
    return result;
}

export function dimensionAssetCorners(source: Point2[], dimension: 'width' | 'height', value: number, aspectLocked: boolean): Point2[] {
    const width = Math.abs(source[1][0] - source[0][0]);
    const height = Math.abs(source[2][1] - source[1][1]);
    const nextWidth = dimension === 'width' ? value : aspectLocked ? width * value / Math.max(height, 1e-9) : width;
    const nextHeight = dimension === 'height' ? value : aspectLocked ? height * value / Math.max(width, 1e-9) : height;
    const center: Point2 = [(source[0][0] + source[2][0]) / 2, (source[0][1] + source[2][1]) / 2];
    return [
        [center[0] - nextWidth / 2, center[1] - nextHeight / 2],
        [center[0] + nextWidth / 2, center[1] - nextHeight / 2],
        [center[0] + nextWidth / 2, center[1] + nextHeight / 2],
        [center[0] - nextWidth / 2, center[1] + nextHeight / 2],
    ];
}

function mapper(from: Point2[], to: Point2[]) {
    const fromWidth = Math.abs(from[1][0] - from[0][0]) || 1;
    const fromHeight = Math.abs(from[2][1] - from[1][1]) || 1;
    const sx = (to[1][0] - to[0][0]) / fromWidth;
    const sy = (to[2][1] - to[1][1]) / fromHeight;
    return (point: Point2): Point2 => [to[0][0] + (point[0] - from[0][0]) * sx, to[0][1] + (point[1] - from[0][1]) * sy];
}

function transformCurve(curve: SketchCurve, map: (point: Point2) => Point2): SketchCurve {
    if (curve.kind === 'line') return { ...curve, a: map(curve.a), b: map(curve.b) };
    if (curve.kind === 'cubic') return { ...curve, a: map(curve.a), c1: map(curve.c1), c2: map(curve.c2), b: map(curve.b) };
    const center = map(curve.center), edgeX = map([curve.center[0] + curve.radiusX, curve.center[1]]), edgeY = map([curve.center[0], curve.center[1] + curve.radiusY]);
    return { ...curve, center, radiusX: Math.hypot(edgeX[0] - center[0], edgeX[1] - center[1]), radiusY: Math.hypot(edgeY[0] - center[0], edgeY[1] - center[1]) };
}

/** Applies one asset-space affine resize to semantic points and curve controls, never to render samples alone. */
export function resizeSketchEntity(source: ModelEntity, from: Point2[], to: Point2[]): ModelEntity {
    const entity = JSON.parse(JSON.stringify(source)) as ModelEntity;
    const map = mapper(from, to);
    entity.points = source.points?.map(map);
    entity.parts = source.parts?.map((part) => ({
        ...part,
        points: part.points.map(map),
        editor: part.editor ? { ...part.editor, source: part.editor.source.map(map) } : undefined,
    }));
    entity.curves = Object.fromEntries(Object.entries(source.curves || {}).map(([key, curve]) => [key, { c1: map(curve.c1), c2: map(curve.c2) }]));
    if (source.profileType === 'circle' && source.points?.length === 2) {
        const center = map(source.points[0]);
        const radius = Math.hypot(source.points[1][0] - source.points[0][0], source.points[1][1] - source.points[0][1]);
        const radiusY = map([source.points[0][0], source.points[0][1] + radius]);
        const radiusXLength = Math.hypot(entity.points![1][0] - center[0], entity.points![1][1] - center[1]);
        const radiusYLength = Math.hypot(radiusY[0] - center[0], radiusY[1] - center[1]);
        if (Math.abs(radiusXLength - radiusYLength) > 1e-8) {
            entity.profileType = 'ellipse';
            entity.points = [center, entity.points![1], radiusY];
        }
    }
    entity.analyticCurves = Object.fromEntries(Object.entries(source.analyticCurves || {}).map(([key, curve]) => [key, transformCurve(curve, map)]));
    if (entity.kind === 'image') entity.points = to.map((point) => [...point]);
    return entity;
}

export function setFolderCorners(folder: ModelFolder, corners: Point2[]) {
    folder.sketchCorners = corners.map((point) => [...point]);
}


export function sketchAssetExcludedIds(document: ModelDocument, id: string) {
    const folder = document.folders.find((item) => item.id === id && item.kind === 'svg');
    return folder ? [id, ...folderEntities(document, id).map((entity) => entity.id)] : [id];
}
