import { registerDataFormatter } from './FileData';
import { transformMap } from './dataFormat';

export * from './fileFormat';
export * from './FileData';
export { parse } from './parser';

Object.keys(transformMap).forEach((key) => {
    registerDataFormatter(key, transformMap[key]!);
});
