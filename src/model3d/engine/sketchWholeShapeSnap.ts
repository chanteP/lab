import { entityProfileClosed } from './profiles';
import type { ModelEntity, Point2 } from '../types';

/** Interaction metadata only; geometry and solving remain generic line/curve constraints. */
export function isStandardClosedShape(entity: ModelEntity) {
    if (entity.kind !== 'sketch' || entity.trimmed || entity.parts?.length || !entityProfileClosed(entity)) return false;
    if (['circle', 'ellipse'].includes(entity.profileType || '')) return true;
    if (['rectangle', 'regular'].includes(entity.profileType || '')) return true;
    return !!entity.standardShape && (entity.profileType || 'polygon') === 'polygon';
}

export function wholeShapeControlPoints(entity: ModelEntity): Point2[] {
    const points = (entity.points || []).map((point) => [...point] as Point2);
    Object.values(entity.curves || {}).forEach((curve) => {
        points.push([...curve.c1], [...curve.c2]);
    });
    return points;
}

/** Try every real control point independently and apply the smallest correction to the whole shape. */
export function snapWholeShapeTranslation(source: Point2[], delta: Point2, snap: (point: Point2) => Point2): Point2 {
    let best: { raw: Point2; correction: Point2; distance: number } | null = null;
    source.forEach((point) => {
        const raw: Point2 = [point[0] + delta[0], point[1] + delta[1]];
        const snapped = snap(raw);
        const correction: Point2 = [snapped[0] - raw[0], snapped[1] - raw[1]];
        const distance = Math.hypot(...correction);
        if (distance > 1e-9 && (!best || distance < best.distance)) best = { raw, correction, distance };
    });
    if (!best) return delta;
    // Re-run the winning candidate so the guide renderer shows the actual reference used for translation.
    const winning = best as NonNullable<typeof best>;
    const snapped = snap(winning.raw);
    return [delta[0] + snapped[0] - winning.raw[0], delta[1] + snapped[1] - winning.raw[1]];
}
