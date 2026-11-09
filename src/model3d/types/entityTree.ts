import type { ModelEntity } from './index';

export interface OutlinerNode {
    id: string;
    kind: 'entity' | 'folder' | 'plane';
    name: string;
    parentId?: string | null;
    visible?: boolean;
    children: OutlinerNode[];
    profileType?: ModelEntity['profileType'];
    trimmed?: boolean;
}
