import { ENTITY_NAMES, type ModelDocument, type ModelEntity } from '../types';

export function cloneEntity(entity: ModelEntity) {
    return JSON.parse(JSON.stringify(entity)) as ModelEntity;
}

export function uniqueEntityName(document: ModelDocument, kind: ModelEntity['kind'], base = ENTITY_NAMES[kind], pending: ModelEntity[] = []) {
    const entities = [...document.entities, ...pending];
    let index = entities.filter((item) => item.kind === kind && item.name.startsWith(`${base} `)).length + 1;
    let name = `${base} ${index}`;
    while (entities.some((item) => item.name === name)) name = `${base} ${++index}`;
    return name;
}

const SKETCH_NAMES: Record<NonNullable<ModelEntity['profileType']>, string> = {
    polygon: '线条', line: '线条', rectangle: '矩形', circle: '圆形', ellipse: '椭圆', regular: '正多边形', arc: '圆弧',
};

export function uniqueSketchName(document: ModelDocument, profileType: ModelEntity['profileType'] = 'polygon', trimmed = false, pending: ModelEntity[] = []) {
    return uniqueEntityName(document, 'sketch', trimmed ? '裁剪边' : SKETCH_NAMES[profileType || 'polygon'], pending);
}
