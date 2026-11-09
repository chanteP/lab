import { profilePoints } from './profiles';
import { constraintRules } from './sketchConstraints';
import { uid } from '../utils/id';
import type { ModelEntity, SketchEdgeConstraint } from '../types';

function addRule(entity: ModelEntity, index: number, rule: SketchEdgeConstraint) {
    const rules = constraintRules(entity.edgeConstraints?.[index]);
    if (!rules.some((item) => item.type === rule.type && item.reference?.entityId === rule.reference?.entityId && item.reference?.index === rule.reference?.index)) {
        rules.push({ id: rule.id || uid(), ...rule });
    }
    entity.edgeConstraints = { ...(entity.edgeConstraints || {}), [index]: rules };
}

/** Rectangles and regular polygons persist only as shared-endpoint lines plus ordinary edge rules. */
export function convertSemanticShapeToConstrainedPolygon(entity: ModelEntity) {
    const type = entity.profileType;
    if (!['rectangle', 'regular'].includes(type || '') || !entity.points) return;
    const source = entity.points;
    const points = type === 'regular'
        ? profilePoints('regular', source, 64, undefined, entity.sides)
        : source.map((point) => [...point] as typeof source[number]);
    if (points.length < 3) return;

    entity.points = points;
    entity.profileType = 'polygon';
    entity.open = false;
    delete entity.sides;
    if (type === 'rectangle') {
        points.forEach((_, index) => addRule(entity, index, {
            type: 'perpendicular', reference: { entityId: entity.id, index: (index + points.length - 1) % points.length },
        }));
    } else {
        points.slice(1).forEach((_, index) => addRule(entity, index + 1, {
            type: 'equal', reference: { entityId: entity.id, index: 0 },
        }));
    }
}
