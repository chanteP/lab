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
        // Equal sides alone allow rhombi and other flexible polygons; a generic signed
        // neighbor-angle rule fixes every exterior angle without shape-specific solving.
        const area = points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point[0] * next[1] - next[0] * point[1];
        }, 0);
        const angle = (area >= 0 ? 1 : -1) * Math.PI * 2 / points.length;
        points.forEach((_, index) => addRule(entity, index, {
            type: 'angle', angle, reference: { entityId: entity.id, index: (index + points.length - 1) % points.length },
        }));
    }
}
