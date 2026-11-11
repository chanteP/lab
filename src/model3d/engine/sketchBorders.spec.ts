import test from 'node:test';
import assert from 'node:assert/strict';
import { borderEditingPoints as borderEditingPointsForTest, borderInterval, borderSegments, sliceBorder, sliceBorderCurve } from './sketchBorders';
import { curvePoint } from './sketchCurves';
import type { BorderSegment } from './sketchBorders';
import { inheritRestitchedConstraints, restitchSketchEdges, type RestitchEdge } from './sketchRestitch';
import { computeSketchFaces } from './sketchFaces';
import type { ModelEntity, Point2, SketchCurve } from '../types';

function sketch(profileType: ModelEntity['profileType'], points: Point2[]): ModelEntity {
    return {
        id: profileType!, name: profileType!, parentId: null, kind: 'sketch', color: '', visible: true,
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], profileType, points, open: false,
    };
}

test('a circle is one analytic border even though rendering uses samples', () => {
    const segment = borderSegments(sketch('circle', [[0, 0], [10, 0]]))[0];
    assert.equal(segment.curve?.kind, 'ellipse');
    assert.equal(segment.points.length, 65);
    assert.equal(segment.sourceCount, 1);
});

test('a seam intersection plus an internal intersection forms two arcs, not the whole circle', () => {
    const circle = borderSegments(sketch('circle', [[0, 0], [10, 0]]))[0];
    const line = borderSegments(sketch('line', [[-20, 0], [20, 0]]))[0];
    const top = borderInterval(circle, [circle, line], [0, 10]);
    const bottom = borderInterval(circle, [circle, line], [0, -10]);
    assert(Math.abs(top.start) < 1e-6 && Math.abs(top.end - 0.5) < 1e-6);
    assert(Math.abs(bottom.start - 0.5) < 1e-6 && Math.abs(bottom.end - 1) < 1e-6);
});

test('one internal junction opens a closed curve without producing a negative-index slice', () => {
    const circle = borderSegments(sketch('circle', [[0, 0], [10, 0]]))[0];
    const tangent = borderSegments(sketch('line', [[-20, 10], [20, 10]]))[0];
    const interval = borderInterval(circle, [circle, tangent], [0, 10]);
    assert.deepEqual([interval.start, interval.end], [0, 1]);
    assert.equal(sliceBorder(circle, interval.start, interval.end).length, 65);
});

test('wrapped closed-curve slices only contain finite points', () => {
    const curve: SketchCurve = { kind: 'ellipse', center: [0, 0], radiusX: 1, radiusY: 1, rotation: 0, orientation: 1, startAngle: 0, endAngle: Math.PI * 2 };
    const circle = { entityId: 'circle', index: 0, sourceCount: 1, closed: true, curve, points: Array.from({ length: 5 }, (_, index) => curvePoint(curve, index / 4)) };
    const cutter = { entityId: 'line', index: 0, sourceCount: 1, closed: false, points: [[0.5, -2], [0.5, 2]] as Point2[] };
    const interval = borderInterval(circle, [circle, cutter], [1, 0]);
    assert(interval.start < 0 && interval.end > 0);
    assert(sliceBorder(circle, interval.start, interval.end).every((point) => point.every(Number.isFinite)));
});

test('trim and restitch retain an ellipse arc instead of expanding it into polyline vertices', () => {
    const circle = borderSegments(sketch('circle', [[0, 0], [10, 0]]))[0];
    const remaining = sliceBorderCurve(circle, 0.5, 1);
    const [path] = restitchSketchEdges([{ a: remaining.points[0], b: remaining.points[remaining.points.length - 1]!, points: remaining.points, curve: remaining.curve }]);
    assert.equal(path.points.length, 2, 'only semantic endpoints are stored');
    assert.equal(path.analyticCurves[0].kind, 'ellipse');

    const rebuilt = sketch('polygon', path.points);
    rebuilt.open = true;
    rebuilt.trimmed = true;
    rebuilt.analyticCurves = path.analyticCurves;
    const segments = borderSegments(rebuilt);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].curve?.kind, 'ellipse');
    assert.equal(segments[0].points.length, 65, 'samples are recreated for rendering only');
});

test('restitch splits a rectangle edge at analytic arc intersections before closing', () => {
    // The arc endpoints lie inside the top line, not at rectangle vertices; unsplit input cannot close.
    const arc: SketchCurve = { kind: 'ellipse', center: [0, 0], radiusX: 10, radiusY: 10, rotation: 0, orientation: 1, startAngle: Math.PI, endAngle: Math.PI * 2 };
    const points = Array.from({ length: 65 }, (_, index) => curvePoint(arc, index / 64));
    const paths = restitchSketchEdges([
        { a: points[0], b: points[points.length - 1]!, points, curve: arc },
        { a: [-20, 0], b: [20, 0], points: [[-20, 0], [20, 0]] },
        { a: [20, 0], b: [20, -20], points: [[20, 0], [20, -20]] },
        { a: [20, -20], b: [-20, -20], points: [[20, -20], [-20, -20]] },
        { a: [-20, -20], b: [-20, 0], points: [[-20, -20], [-20, 0]] },
    ]);
    const closed = paths.filter((path) => path.closed);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].analyticCurves[0].kind, 'ellipse');
    assert(closed[0].points.length < 10, 'closed path stores semantic vertices rather than arc samples');
});

test('cubic editing drafts use semantic endpoints instead of render samples', () => {
    const a: Point2 = [-46.4, 8.2], b: Point2 = [-1.5, 13.3];
    const curve: SketchCurve = { kind: 'cubic', a, b, c1: [-28.2, -1.9], c2: [-16.5, 11.6] };
    const entity = sketch('polygon', [a, b]);
    entity.open = true;
    entity.analyticCurves = { 0: curve };
    const segment = borderSegments(entity)[0];
    assert.equal(segment.points.length, 65);
    // Using samples[1] as the endpoint collapses the curve during handle writeback.
    assert.deepEqual(borderEditingPointsForTest(segment), [a, b]);
});

test('closed circle sectors use two independent radii and one analytic arc around a closed face', () => {
    const sector = sketch('circle', [[0, 0], [10, 0]]);
    sector.sectorAngle = 90;
    sector.open = false;
    sector.planeId = 'plane';
    const segments = borderSegments(sector);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].curve, undefined);
    assert.equal(segments[1].curve?.kind, 'ellipse');
    assert.equal(segments[2].curve, undefined);
    assert.deepEqual(segments[0].points[0], [0, 0]);
    assert.deepEqual(segments[2].points[1], [0, 0]);
    assert.equal(computeSketchFaces([sector], 'plane').length, 1);
});

test('a sector radius intersection does not mark the outer arc for deletion', () => {
    const sector = sketch('circle', [[0, 0], [10, 0]]);
    sector.sectorAngle = 90;
    sector.open = false;
    const [startRadius, arc, endRadius] = borderSegments(sector);
    const cutter: BorderSegment = { entityId: 'cutter', index: 0, sourceCount: 1, closed: false, points: [[5, -1], [5, 1]] };
    const all = [startRadius, arc, endRadius, cutter];
    const radiusInterval = borderInterval(startRadius, all, [2, 0]);
    const arcInterval = borderInterval(arc, all, [10 * Math.SQRT1_2, 10 * Math.SQRT1_2]);
    assert.ok(radiusInterval.end < 1 || radiusInterval.start > 0);
    assert.equal(arcInterval.start, 0);
    assert.equal(arcInterval.end, 1);
});

test('restitch retains surviving source rules, endpoint locks and external references', () => {
    const rectangle = sketch('polygon', [[0, 0], [20, 0], [20, 10], [0, 10]]);
    rectangle.id = 'rectangle';
    rectangle.edgeConstraints = {
        0: [{ id: 'h0', type: 'horizontal' }],
        1: [{ id: 'p1', type: 'perpendicular', reference: { entityId: rectangle.id, index: 0 } }],
        2: [{ id: 'h2', type: 'horizontal' }],
        3: [{ id: 'removed', type: 'horizontal' }],
    };
    rectangle.lockedPoints = [0, 1];
    rectangle.constraintEdges = [0];
    const external = sketch('line', [[0, 30], [20, 30]]);
    external.id = 'external';
    external.edgeConstraints = { 0: [{ id: 'parallel', type: 'parallel', reference: { entityId: rectangle.id, index: 0 } }] };
    const edges: RestitchEdge[] = [0, 1, 2].map((index) => ({
        a: rectangle.points![index], b: rectangle.points![(index + 1) % 4],
        points: [rectangle.points![index], rectangle.points![(index + 1) % 4]], source: { entityId: rectangle.id, index },
    }));
    const paths = restitchSketchEdges(edges);
    const rebuilt = sketch('polygon', paths[0].points);
    rebuilt.id = 'rebuilt';
    rebuilt.open = true;
    inheritRestitchedConstraints([rectangle, external, rebuilt], [rectangle], [rebuilt], paths);
    const rules = Object.values(rebuilt.edgeConstraints || {}).flat();
    assert.deepEqual(rules.map((rule) => rule.id).sort(), ['h0', 'h2', 'p1']);
    assert.equal(rules.find((rule) => rule.id === 'p1')?.reference?.entityId, rebuilt.id);
    assert.deepEqual(rebuilt.constraintEdges, [0]);
    assert.deepEqual(rebuilt.lockedPoints, [0, 1]);
    assert.equal(external.edgeConstraints?.[0][0].reference?.entityId, rebuilt.id);
    assert.ok(!rules.some((rule) => rule.id === 'removed'));
});
