import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntity, type Point2 } from '../types';
import { mergeSketchItemSelection, sketchMarqueeSelection } from './sketchMarquee';

const project = ([x, y]: Point2) => ({ x, y });
const rect = { left: 0, top: 0, right: 30, bottom: 30 };
function line(id: string, points: Point2[]) {
    const entity = createEntity('sketch', id);
    Object.assign(entity, { planeId: 'plane', profileType: 'polygon' as const, points, open: true });
    return entity;
}

test('marquee selects fully contained shapes, edges and uncovered points by priority', () => {
    const whole = line('whole', [[2, 2], [8, 2], [8, 8]]);
    whole.profileType = 'polygon';
    const partial = line('partial', [[12, 12], [25, 12], [40, 25]]);
    const result = sketchMarqueeSelection([whole, partial], 'plane', rect, project);
    assert.deepEqual(result.shapes, ['whole']);
    assert.deepEqual(result.edges, [{ entityId: 'partial', index: 0 }]);
    assert.deepEqual(result.points, [], 'covered endpoints are not duplicated');
    assert.ok(!result.edges.some((edge) => edge.entityId === 'whole'));
});

test('partial edge selection leaves an isolated contained endpoint selectable', () => {
    const partial = line('partial', [[12, 12], [25, 12], [25, 25], [40, 40]]);
    const result = sketchMarqueeSelection([partial], 'plane', rect, project);
    assert.deepEqual(result.edges, [{ entityId: 'partial', index: 0 }, { entityId: 'partial', index: 1 }]);
    assert.deepEqual(result.points, []);
    const outside = line('outside', [[28, 28], [50, 50]]);
    assert.deepEqual(sketchMarqueeSelection([outside], 'plane', rect, project).points, [{ entityId: 'outside', index: 0 }]);
});

test('additive selection removes nested edges and points when their shape becomes selected', () => {
    const shape = line('shape', [[2, 2], [8, 2]]);
    const merged = mergeSketchItemSelection(
        { shapes: [], edges: [{ entityId: 'shape', index: 0 }], points: [{ entityId: 'shape', index: 1 }] },
        { shapes: ['shape'], edges: [], points: [] }, [shape],
    );
    assert.deepEqual(merged, { shapes: ['shape'], edges: [], points: [] });
});
