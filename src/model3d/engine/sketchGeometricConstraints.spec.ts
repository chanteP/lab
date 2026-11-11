import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntity, type ModelEntity, type Point2 } from '../types';
import { solveDocumentConstraints } from './sketchConstraintSolver';
import { sketchGeometricResidual, sketchGeometricSelection } from './sketchGeometricConstraints';
import { upsertSketchConstraintRule } from './sketchConstraints';

function circle(id: string, center: Point2, radius: number) {
    return Object.assign(createEntity('sketch', id), { profileType: 'circle' as const, points: [[...center], [center[0] + radius, center[1]]] as Point2[] });
}
function ellipse(id: string, center: Point2, radiusX: number, radiusY: number) {
    return Object.assign(createEntity('sketch', id), { profileType: 'ellipse' as const, points: [[...center], [center[0] + radiusX, center[1]], [center[0], center[1] + radiusY]] as Point2[] });
}
function line(id: string, a: Point2, b: Point2) {
    return Object.assign(createEntity('sketch', id), { profileType: 'line' as const, points: [a, b], open: true });
}
function close(a: Point2, b: Point2) {
    assert(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0002, `${a} != ${b}`);
}
function rule(entity: ModelEntity, reference: ModelEntity, type: 'tangent' | 'concentric') {
    upsertSketchConstraintRule(entity, 0, { id: `${type}-${entity.id}`, type, reference: { entityId: reference.id, index: 0 }, tangentMode: type === 'tangent' ? 'external' : undefined });
}

test('concentric constraints move circle centers together and survive later edits', () => {
    const document = createDocument();
    const a = circle('a', [0, 0], 5), b = circle('b', [12, 4], 2);
    document.entities.push(a, b);
    rule(b, a, 'concentric');
    assert.equal(solveDocumentConstraints(document, b.id, [], 100), 'ok');
    close(b.points![0], a.points![0]);
    b.points![0] = [8, -3];
    assert.equal(solveDocumentConstraints(document, b.id, [], 100), 'ok');
    close(b.points![0], a.points![0]);
});

test('concentric solving respects a locked semantic center', () => {
    const document = createDocument();
    const a = circle('a', [0, 0], 5), b = circle('b', [10, 0], 2);
    b.lockedPoints = [0];
    document.entities.push(a, b);
    rule(a, b, 'concentric');
    assert.equal(solveDocumentConstraints(document, a.id, [], 100), 'ok');
    close(a.points![0], [10, 0]);
    close(b.points![0], [10, 0]);
});

test('line-circle and line-ellipse tangent constraints converge to zero residual', () => {
    for (const curved of [circle('curved', [0, 0], 5), ellipse('curved', [0, 0], 4, 2)]) {
        const document = createDocument();
        const edge = line('line', [-10, curved.profileType === 'circle' ? 6 : 3], [10, curved.profileType === 'circle' ? 6 : 3]);
        document.entities.push(edge, curved);
        rule(curved, edge, 'tangent');
        assert.equal(solveDocumentConstraints(document, curved.id, [], 100), 'ok');
        const residual = sketchGeometricResidual(curved, 0, curved.edgeConstraints![0][0] as any, edge, 0);
        assert(residual !== null && Math.abs(residual) < 0.0002, `residual=${residual}`);
    }
});

test('two circles support external tangent constraints', () => {
    const document = createDocument();
    const a = circle('a', [0, 0], 5), b = circle('b', [12, 0], 2);
    document.entities.push(a, b);
    rule(b, a, 'tangent');
    assert.equal(solveDocumentConstraints(document, b.id, [], 100), 'ok');
    const residual = sketchGeometricResidual(b, 0, b.edgeConstraints![0][0] as any, a, 0);
    assert(residual !== null && Math.abs(residual) < 0.0002, `residual=${residual}`);
});

test('constraint availability requires curves for tangent and centers for concentric', () => {
    const a = circle('a', [0, 0], 5), b = circle('b', [8, 0], 2), edge = line('line', [0, 8], [5, 8]);
    const entities = [a, b, edge];
    assert(sketchGeometricSelection(entities, [{ entityId: 'a', index: 0 }, { entityId: 'b', index: 0 }]).tangent);
    assert(sketchGeometricSelection(entities, [{ entityId: 'a', index: 0 }, { entityId: 'line', index: 0 }]).tangent);
    assert(!sketchGeometricSelection(entities, [{ entityId: 'line', index: 0 }]).concentric);
    assert(sketchGeometricSelection(entities, [{ entityId: 'a', index: 0 }, { entityId: 'b', index: 0 }]).concentric);
});
