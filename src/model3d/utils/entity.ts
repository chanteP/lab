import { ENTITY_NAMES, type ModelDocument, type ModelEntity } from '../types';

export function cloneEntity(entity: ModelEntity) {
    return JSON.parse(JSON.stringify(entity)) as ModelEntity;
}

export function uniqueEntityName(document: ModelDocument, kind: ModelEntity['kind']) {
    const base = ENTITY_NAMES[kind];
    let index = document.entities.filter((item) => item.kind === kind).length + 1;
    let name = `${base} ${index}`;
    while (document.entities.some((item) => item.name === name)) name = `${base} ${++index}`;
    return name;
}
