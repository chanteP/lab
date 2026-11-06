import { constraintRules, straightConstraintSegment } from './sketchConstraints';
import type { ModelDocument, ModelEntity, Point2, SketchEdgeConstraint, SketchElementRef } from '../types';

export const SKETCH_CONSTRAINT_TOLERANCE = 0.0001;

type Axis = 0 | 1;
type Variable = { entityId: string; index: number; axis: Axis; initial: number };
type Rule = { entity: ModelEntity; index: number; rule: SketchEdgeConstraint };
type Derivative = { variable: Variable; value: number };

const SOFT_ANCHOR_WEIGHT = 1000;
const MAX_ITERATIONS = 80;

function segment(entity: ModelEntity, index: number) {
    const points = entity.points || [];
    return { a: points[index], b: points[(index + 1) % points.length] };
}

function vector(entity: ModelEntity, index: number) {
    const { a, b } = segment(entity, index);
    if (!a || !b) return null;
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    return length > 1e-12 ? { dx, dy, length } : null;
}

function ruleReference(rule: Rule, document: ModelDocument): Rule | null {
    const reference = rule.rule.reference;
    if (!reference) return null;
    const entity = document.entities.find((item) => item.id === reference.entityId);
    return entity ? { entity, index: reference.index, rule: rule.rule } : null;
}

function ruleType(rule: Rule) {
    if (rule.rule.type !== 'auto') return rule.rule.type;
    const { a, b } = segment(rule.entity, rule.index);
    return a && b && Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'horizontal' : 'vertical';
}

function residual(rule: Rule, document: ModelDocument) {
    const type = ruleType(rule), current = vector(rule.entity, rule.index);
    if (!current) return null;
    if (type === 'horizontal') return current.dy;
    if (type === 'vertical') return current.dx;
    if (type === 'length') return current.length - rule.rule.length!;
    const reference = ruleReference(rule, document);
    if (!reference) return null;
    const other = vector(reference.entity, reference.index);
    if (!other) return null;
    if (type === 'equal') return current.length - other.length;
    const cx = current.dx / current.length, cy = current.dy / current.length;
    const rx = other.dx / other.length, ry = other.dy / other.length;
    if (type === 'parallel') return cx * ry - cy * rx;
    if (type === 'perpendicular') return cx * rx + cy * ry;
    return null;
}

function derivatives(rule: Rule, document: ModelDocument): Derivative[] {
    const type = ruleType(rule), current = vector(rule.entity, rule.index);
    if (!current) return [];
    const result: Derivative[] = [];
    const add = (entity: ModelEntity, index: number, axis: Axis, value: number) => {
        if (Math.abs(value) > 1e-14) result.push({ variable: { entityId: entity.id, index, axis, initial: 0 }, value });
    };
    const addLength = (entity: ModelEntity, index: number, sign: number) => {
        const { a, b } = segment(entity, index);
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        add(entity, index, 0, -sign * (b[0] - a[0]) / length);
        add(entity, index, 1, -sign * (b[1] - a[1]) / length);
        add(entity, (index + 1) % entity.points!.length, 0, sign * (b[0] - a[0]) / length);
        add(entity, (index + 1) % entity.points!.length, 1, sign * (b[1] - a[1]) / length);
    };
    if (type === 'horizontal') {
        add(rule.entity, rule.index, 1, -1); add(rule.entity, (rule.index + 1) % rule.entity.points!.length, 1, 1);
    } else if (type === 'vertical') {
        add(rule.entity, rule.index, 0, -1); add(rule.entity, (rule.index + 1) % rule.entity.points!.length, 0, 1);
    } else if (type === 'length') addLength(rule.entity, rule.index, 1);
    else if (type === 'equal') {
        const reference = ruleReference(rule, document);
        if (reference) { addLength(rule.entity, rule.index, 1); addLength(reference.entity, reference.index, -1); }
    } else {
        const reference = ruleReference(rule, document);
        if (!reference) return [];
        const numeric = (entity: ModelEntity, index: number) => {
            for (const axis of [0, 1] as Axis[]) {
                const point = entity.points![index], original = point[axis], epsilon = 1e-6;
                point[axis] = original + epsilon;
                const plus = residual(rule, document) || 0;
                point[axis] = original - epsilon;
                const minus = residual(rule, document) || 0;
                point[axis] = original;
                add(entity, index, axis, (plus - minus) / (2 * epsilon));
            }
        };
        numeric(rule.entity, rule.index);
        numeric(rule.entity, (rule.index + 1) % rule.entity.points!.length);
        numeric(reference.entity, reference.index);
        numeric(reference.entity, (reference.index + 1) % reference.entity.points!.length);
    }
    return result;
}

function solveLinear(matrix: number[][], vector: number[]) {
    const size = vector.length;
    const a = matrix.map((row, index) => [...row, vector[index]]);
    for (let column = 0; column < size; column++) {
        let pivot = column;
        for (let row = column + 1; row < size; row++) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
        if (Math.abs(a[pivot][column]) < 1e-16) return null;
        [a[column], a[pivot]] = [a[pivot], a[column]];
        for (let row = column + 1; row < size; row++) {
            const factor = a[row][column] / a[column][column];
            for (let k = column; k <= size; k++) a[row][k] -= factor * a[column][k];
        }
    }
    const result = Array.from({ length: size }, () => 0);
    for (let row = size - 1; row >= 0; row--) {
        let value = a[row][size];
        for (let k = row + 1; k < size; k++) value -= a[row][k] * result[k];
        result[row] = value / a[row][row];
    }
    return result;
}

function relatedRules(document: ModelDocument, rootId: string | null) {
    const all = new Map<string, Rule[]>();
    const related = new Set<string>();
    document.entities.forEach((entity) => {
        const rules: Rule[] = [];
        Object.entries(entity.edgeConstraints || {}).forEach(([key, value]) => constraintRules(value).forEach((rule) => {
            const index = Number(key);
            if (straightConstraintSegment(entity.points || [], entity.curves || {}, index)) rules.push({ entity, index, rule });
            if (rule.reference) related.add(rule.reference.entityId);
        }));
        if (entity.shapeConstraint === 'orthogonal') {
            for (let index = 0; index < 4; index++) rules.push({ entity, index, rule: { type: 'perpendicular', reference: { entityId: entity.id, index: (index + 3) % 4 } } });
        }
        if (entity.shapeConstraint === 'equal') {
            for (let index = 1; index < (entity.points?.length || 0); index++) rules.push({ entity, index, rule: { type: 'equal', reference: { entityId: entity.id, index: 0 } } });
        }
        if (rules.length) all.set(entity.id, rules);
        if (entity.shapeConstraint) related.add(entity.id);
    });
    if (!rootId) return all;
    const included = new Set<string>(), queue = [rootId];
    while (queue.length) {
        const id = queue.shift()!;
        if (included.has(id)) continue;
        included.add(id);
        all.get(id)?.forEach((rule) => { if (rule.rule.reference) queue.push(rule.rule.reference.entityId); });
        document.entities.forEach((entity) => Object.values(entity.edgeConstraints || {}).forEach((value) => constraintRules(value).forEach((rule) => {
            if (rule.reference?.entityId === id) queue.push(entity.id);
        })));
    }
    return new Map([...all].filter(([id]) => included.has(id)));
}

/** Global Gauss-Newton solve; references are bidirectional associations, not privileged objects. */
export function solveDocumentConstraints(document: ModelDocument, rootId: string | null, softAnchors: SketchElementRef[], limit: number): 'ok' | 'limit' | 'conflict' {
    const grouped = relatedRules(document, rootId);
    if (grouped.size > limit) return 'limit';
    const rules = [...grouped.values()].flat();
    if (!rules.length) return 'ok';
    const included = new Set(grouped.keys());
    rules.forEach((rule) => { if (rule.rule.reference) included.add(rule.rule.reference.entityId); });
    const entities = new Map(document.entities.filter((entity) => included.has(entity.id) && entity.points).map((entity) => [entity.id, entity]));
    const original = new Map([...entities].map(([id, entity]) => [id, entity.points!.map((point) => [...point] as Point2)]));
    const restore = () => original.forEach((points, id) => { entities.get(id)!.points = points.map((point) => [...point]); });
    const variables: Variable[] = [];
    const variableIndex = new Map<string, number>();
    entities.forEach((entity) => entity.points!.forEach((point, index) => [0, 1].forEach((axis) => {
        if ((entity.lockedPoints || []).includes(index)) return;
        variableIndex.set(`${entity.id}:${index}:${axis}`, variables.length);
        variables.push({ entityId: entity.id, index, axis: axis as Axis, initial: point[axis as Axis] });
    })));
    const anchorIndex = new Map(softAnchors.map((anchor) => [`${anchor.entityId}:${anchor.index}`, true]));
    const valueOf = (variable: Variable) => entities.get(variable.entityId)!.points![variable.index][variable.axis];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const rows: { residual: number; derivatives: Derivative[] }[] = [];
        rules.forEach((rule) => {
            const value = residual(rule, document);
            if (value === null) return;
            rows.push({ residual: value, derivatives: derivatives(rule, document) });
        });
        variables.forEach((variable) => {
            if (!anchorIndex.has(`${variable.entityId}:${variable.index}`)) return;
            rows.push({
                residual: (valueOf(variable) - variable.initial) * SOFT_ANCHOR_WEIGHT,
                derivatives: [{ variable, value: SOFT_ANCHOR_WEIGHT }],
            });
        });
        if (rows.every((row) => Math.abs(row.residual) <= SKETCH_CONSTRAINT_TOLERANCE) && iteration > 0) break;
        const matrix = Array.from({ length: variables.length }, () => Array.from({ length: variables.length }, () => 0));
        const target = Array.from({ length: variables.length }, () => 0);
        rows.forEach((row) => {
            const terms = row.derivatives.flatMap((derivative) => {
                const index = variableIndex.get(`${derivative.variable.entityId}:${derivative.variable.index}:${derivative.variable.axis}`);
                return index === undefined ? [] : [{ index, value: derivative.value }];
            });
            terms.forEach((a) => {
                target[a.index] -= a.value * row.residual;
                terms.forEach((b) => { matrix[a.index][b.index] += a.value * b.value; });
            });
        });
        for (let index = 0; index < variables.length; index++) matrix[index][index] += 1e-8;
        const step = solveLinear(matrix, target);
        if (!step) { restore(); return 'conflict'; }
        const maxStep = Math.max(...step.map(Math.abs));
        const scale = Math.max(1, maxStep / 5);
        variables.forEach((variable, index) => { entities.get(variable.entityId)!.points![variable.index][variable.axis] += step[index] / scale; });
        if (maxStep < SKETCH_CONSTRAINT_TOLERANCE) break;
    }

    for (const rule of rules) {
        const value = residual(rule, document);
        if (value === null || Math.abs(value) > SKETCH_CONSTRAINT_TOLERANCE * 2) { restore(); return 'conflict'; }
    }
    entities.forEach((entity, id) => {
        const before = original.get(id)!;
        (entity.lockedPoints || []).forEach((index) => {
            if (Math.hypot(entity.points![index][0] - before[index][0], entity.points![index][1] - before[index][1]) > SKETCH_CONSTRAINT_TOLERANCE) entity.points![index] = before[index];
        });
        Object.entries(entity.curves || {}).forEach(([key, curve]) => {
            const index = Number(key);
            if (!straightConstraintSegment(before, entity.curves || {}, index)) return;
            const { a, b } = segment(entity, index);
            curve.c1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
            curve.c2 = [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3];
        });
    });
    return 'ok';
}
