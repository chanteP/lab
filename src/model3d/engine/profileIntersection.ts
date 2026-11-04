import type { ModelEntity, Point2 } from '../types';
import { computeSketchFaces } from './sketchFaces';

function area(points: Point2[]) {
    return Math.abs(points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point[0] * next[1] - next[0] * point[1];
    }, 0));
}

function contains(points: Point2[], point: Point2) {
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
        const a = points[index], b = points[previous];
        if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

/** The smallest bounded region containing an overlapping hit is the active intersection profile. */
export function intersectionProfileAtPoint(entities: ModelEntity[], planeId: string, point: Point2): Point2[] | null {
    const faces = computeSketchFaces(entities, planeId).filter((face) => contains(face.points, point));
    const face = faces.sort((a, b) => area(a.points) - area(b.points))[0];
    return face ? face.points.map((point) => [...point]) : null;
}


/** A selected open-line chain can extrude only when it describes exactly one closed region. */
export function uniqueClosedProfile(entities: ModelEntity[], planeId: string): Point2[] | null {
    const faces = computeSketchFaces(entities, planeId);
    return faces.length === 1 ? faces[0].points.map((point) => [...point]) : null;
}
