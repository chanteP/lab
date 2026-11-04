import { computed, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { EditPhase, SketchDimension, Viewport } from '../../engine/Viewport';
import { parseSvg } from '../../engine/svgImport';
import {
    dimensionAssetCorners, folderEntities, resizeAssetCorners, resizeSketchEntity,
    setFolderCorners, sketchAssetTarget,
} from '../../engine/sketchAssets';
import { uid } from '../../utils/id';
import { cloneDocument, createEntity, type ModelDocument, type ModelEntity, type Point2 } from '../../types';

interface SketchAssetsOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    selectedShapes: Ref<string[]>;
    activePlaneId: Ref<string | null>;
    viewport: () => Viewport | undefined;
    message: ReturnType<typeof useMessage>;
    pushHistory: () => void;
    popHistory: () => void;
    clearSketchSelection: () => void;
    selectSketchEntity: (id: string) => void;
    refreshSketch: () => void;
}

const readFile = (file: File, as: 'text' | 'dataURL') => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('文件读取失败'));
    as === 'text' ? reader.readAsText(file) : reader.readAsDataURL(file);
});

const imageSize = (source: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('图片无法解码'));
    image.src = source;
});

/** Raster/SVG import and whole-asset selection, dimensions and corner gestures. */
export function useSketchAssets(options: SketchAssetsOptions) {
    const { document, selectedIds, selectedShapes, activePlaneId, viewport, message, pushHistory, popHistory } = options;
    const selectedAssetId = computed(() => {
        const ids = [...selectedIds.value, ...selectedShapes.value];
        for (let index = ids.length - 1; index >= 0; index--) {
            if (sketchAssetTarget(document.value, ids[index])) return ids[index];
        }
        return null;
    });
    const selectedAsset = computed(() => sketchAssetTarget(document.value, selectedAssetId.value));
    let drag: { id: string; index: number; before: ModelDocument; corners: Point2[] } | null = null;

    function applyResize(id: string, next: Point2[], source: ModelDocument) {
        const target = sketchAssetTarget(source, id);
        if (!target) return;
        if (target.kind === 'image') {
            const image = document.value.entities.find((entity) => entity.id === id);
            if (image) image.points = next.map((point) => [...point]);
            return;
        }
        const folder = document.value.folders.find((item) => item.id === id);
        if (folder) setFolderCorners(folder, next);
        folderEntities(source, id).forEach((sourceEntity) => {
            const current = document.value.entities.find((entity) => entity.id === sourceEntity.id);
            if (current) Object.assign(current, resizeSketchEntity(sourceEntity, target.corners, next));
        });
    }

    function onSketchAssetCorner(id: string, index: number, point: Point2, phase: EditPhase) {
        if (phase === 'start') {
            const target = sketchAssetTarget(document.value, id);
            if (!target) return;
            pushHistory();
            drag = { id, index, before: cloneDocument(document.value), corners: target.corners };
            return;
        }
        if (!drag || drag.id !== id) return;
        if (phase === 'cancel') {
            document.value = drag.before;
            drag = null;
            popHistory();
            options.refreshSketch();
            return;
        }
        const target = sketchAssetTarget(drag.before, id)!;
        applyResize(id, resizeAssetCorners(drag.corners, drag.index, point, target.aspectLocked), drag.before);
        if (phase === 'end') drag = null;
    }

    function onSketchAssetDimension(target: SketchDimension, value: number) {
        const id = target.assetId;
        const asset = sketchAssetTarget(document.value, id || null);
        if (!asset || !['width', 'height'].includes(target.kind) || !Number.isFinite(value) || value <= 0) return;
        pushHistory();
        applyResize(asset.id, dimensionAssetCorners(asset.corners, target.kind as 'width' | 'height', value, asset.aspectLocked), document.value);
    }

    function toggleAssetAspect() {
        const asset = selectedAsset.value;
        if (!asset) return;
        pushHistory();
        if (asset.kind === 'image') {
            const image = document.value.entities.find((entity) => entity.id === asset.id);
            if (image) image.aspectLocked = !asset.aspectLocked;
        } else {
            const folder = document.value.folders.find((item) => item.id === asset.id);
            if (folder) folder.aspectLocked = !asset.aspectLocked;
        }
    }

    function newSketch(element: ReturnType<typeof parseSvg>['elements'][number], fileName: string): ModelEntity {
        const entity = createEntity('sketch', uid());
        entity.name = fileName;
        entity.position = [0, 0, 0];
        entity.planeId = activePlaneId.value!;
        entity.profileType = element.profileType;
        entity.points = element.points;
        entity.parts = element.parts;
        entity.open = element.open;
        delete entity.depth;
        return entity;
    }

    async function importSketchFile(file: File, dropPoint?: Point2) {
        const planeId = activePlaneId.value;
        const view = viewport()?.sketchViewFrame();
        if (!planeId || !view) throw new Error('请先进入草图编辑模式');
        const center = dropPoint || view.center;
        const fitSize = Math.min(view.width, view.height) * 0.6;
        pushHistory();
        if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
            const parsed = parseSvg(await readFile(file, 'text'), center, fitSize);
            const entities = parsed.elements.map((element, index) => newSketch(element, parsed.elements.length === 1 ? file.name : `${file.name} · ${element.name || index + 1}`));
            if (entities.length > 1) {
                const folderId = uid();
                entities.forEach((entity) => { entity.parentId = folderId; });
                document.value.folders.push({ id: folderId, name: file.name, visible: true, parentId: null, kind: 'svg', planeId, sketchCorners: parsed.corners, aspectLocked: true });
                document.value.entities.push(...entities);
                options.clearSketchSelection();
                selectedIds.value = [folderId];
            } else {
                document.value.entities.push(...entities);
                options.selectSketchEntity(entities[0].id);
            }
        } else if (file.type.startsWith('image/')) {
            const source = await readFile(file, 'dataURL');
            const size = await imageSize(source);
            const scale = fitSize / Math.max(size.width, size.height);
            const width = size.width * scale, height = size.height * scale;
            const image = createEntity('image', uid());
            image.name = file.name;
            image.planeId = planeId;
            image.assetSource = source;
            image.points = [
                [center[0] - width / 2, center[1] - height / 2], [center[0] + width / 2, center[1] - height / 2],
                [center[0] + width / 2, center[1] + height / 2], [center[0] - width / 2, center[1] + height / 2],
            ];
            document.value.entities.push(image);
            options.selectSketchEntity(image.id);
        } else throw new Error('请导入图片或 SVG 文件');
        options.refreshSketch();
    }

    async function onSketchDrop(event: DragEvent) {
        if (!activePlaneId.value) return;
        const file = Array.from(event.dataTransfer?.files || [])[0];
        if (!file) return;
        event.preventDefault();
        event.stopPropagation();
        try {
            const point = viewport()?.sketchPointAt(event.clientX, event.clientY) || undefined;
            await importSketchFile(file, point);
        } catch (error) {
            popHistory();
            message.error(error instanceof Error ? error.message : '导入失败');
        }
    }

    return { selectedAssetId, selectedAsset, onSketchAssetCorner, onSketchAssetDimension, toggleAssetAspect, importSketchFile, onSketchDrop };
}

export type SketchAssets = ReturnType<typeof useSketchAssets>;
