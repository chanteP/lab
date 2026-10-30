import test from 'node:test';
import assert from 'node:assert/strict';
import { collinearCubicCurve as collinearCubicCurveForTest, cubicCurveFromHandles as cubicCurveFromHandlesForTest, curveIntersections, curvePoint, curvePoints, nearestCurveT, reverseCurve, sliceCurve, translateCurve } from './sketchCurves';
import type { SketchCurve } from '../types';

const circle: SketchCurve = { kind: 'ellipse', center: [0, 0], radiusX: 10, radiusY: 10, rotation: 0, orientation: 1, startAngle: 0, endAngle: Math.PI * 2 };
const horizontal: SketchCurve = { kind: 'line', a: [-20, 0], b: [20, 0] };

function assertSamePoint(a: ReturnType<typeof curvePoint>, b: ReturnType<typeof curvePoint>, tolerance = 0.001) {
    assert(Math.hypot(a[0] - b[0], a[1] - b[1]) < tolerance, `${a} != ${b}`);
}

test('analytic circle/line intersections are precise and deduplicate the 0° seam', () => {
    // A closed curve shares t=0 and t=1; the seam must not become a phantom third intersection.
    const hits = curveIntersections(circle, horizontal);
    assert.equal(hits.length, 2);
    hits.forEach((hit) => assertSamePoint(curvePoint(circle, hit.first), curvePoint(horizontal, hit.second)));
});

test('adaptive intersection plus derivative refinement handles three cubic/line roots', () => {
    // Conservative cubic bounds used to cause deep recursion near tangency; refinement must stay accurate.
    const cubic: SketchCurve = { kind: 'cubic', a: [-10, -5], c1: [-3, 15], c2: [3, -15], b: [10, 5] };
    const hits = curveIntersections(cubic, horizontal);
    assert.equal(hits.length, 3);
    hits.forEach((hit) => assertSamePoint(curvePoint(cubic, hit.first), curvePoint(horizontal, hit.second)));
});

test('ellipse slicing, reversal, nearest point and translation preserve analytic parameters', () => {
    const arc = sliceCurve(circle, 0.125, 0.375);
    assert.equal(arc.kind, 'ellipse');
    assertSamePoint(curvePoint(arc, 0), [Math.SQRT2 * 5, Math.SQRT2 * 5], 1e-8);
    assert.equal(curvePoints(arc).length, 65, 'render sampling does not change the logical curve');
    assertSamePoint(curvePoint(reverseCurve(arc), 1), curvePoint(arc, 0), 1e-8);
    assert(Math.abs(nearestCurveT(circle, [0, 10]) - 0.25) < 1e-4);

    const moved = translateCurve(arc, [3, -2]);
    assertSamePoint(curvePoint(moved, 0), [curvePoint(arc, 0)[0] + 3, curvePoint(arc, 0)[1] - 2], 1e-8);
});

test('straight endpoint dragging preserves collinear Bezier handles', () => {
    // Straight borders keep editable handles, but both handles must stay on the dragged line.
    const curve = collinearCubicCurveForTest([0, 0], [30, 10]);
    assert.deepEqual(curve.c1, [10, 10 / 3]);
    assert.deepEqual(curve.c2, [20, 20 / 3]);
    curvePoints(curve).forEach((point) => {
        assert(Math.abs(30 * (point[1] - 0) - 10 * (point[0] - 0)) < 1e-8);
    });
});

test('Bezier handle dragging keeps non-collinear controls instead of snapping back', () => {
    const curve = cubicCurveFromHandlesForTest([0, 0], [30, 10], { c1: [2, 18], c2: [24, -8] });
    assert.deepEqual(curve.c1, [2, 18]);
    assert.deepEqual(curve.c2, [24, -8]);
    assert(curvePoints(curve).some((point) => Math.abs(30 * point[1] - 10 * point[0]) > 0.001));
});
