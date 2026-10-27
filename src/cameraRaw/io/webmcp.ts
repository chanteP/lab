import { activeAsset, activeId, assets, importFiles, redo, selectAsset, selectedIds, syncToSelected, undo } from '../store';
import { cloneAdjustments, createDefaultAdjustments, mergeAdjustments } from '../engine/adjustments';
import type { Adjustments, ImageAsset } from '../types';
import { ensureBitmap } from './raw';
import { downloadBlob, renderExport } from './export';
import { parsePreset, serializePreset } from './preset';

type ToolResult = { content: { type: string; text: string }[]; structuredContent?: unknown; isError?: boolean };
type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown>; execute: (args: Record<string, any>) => Promise<unknown> | unknown };

const result = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
const summary = (asset: ImageAsset) => ({ id: asset.id, name: asset.name, kind: asset.kind, width: asset.width, height: asset.height, loading: asset.loading, error: asset.error });
const state = () => ({ activeId: activeId.value, selectedIds: [...selectedIds.value], assets: assets.value.map(summary) });

function target(id?: string): ImageAsset {
    const asset = id ? assets.value.find((item) => item.id === id) : activeAsset.value;
    if (!asset) throw new Error(id ? `找不到图片 ${id}` : '请先加载并选择图片');
    return asset;
}

function bytesFromBase64(data: string): Uint8Array {
    const normalized = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
    const binary = atob(normalized), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function blobBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
}

const adjustmentsSchema = {
    type: 'object', additionalProperties: true,
    description: 'Camera Raw 参数，可只传需要修改的字段。支持 temperature、tint、exposure、contrast、highlights、shadows、whites、blacks、texture、clarity、dehaze、vibrance、saturation；curves.rgb/r/g/b 控制点；mixer 八色 hue/saturation/luminance；grading；calibration；optics。',
};

const tools: ToolDefinition[] = [
    {
        name: 'camera_raw_load', description: '加载本地 agent 提供的图片或 URL，支持 RAW、JPEG、PNG 和批量文件。文件 data 使用 base64。所有处理留在浏览器本地。',
        inputSchema: { type: 'object', properties: {
            files: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, data: { type: 'string', description: 'base64 或 data URL' }, mimeType: { type: 'string' } }, required: ['name', 'data'] } },
            urls: { type: 'array', items: { type: 'string' }, description: '允许跨域读取的图片 URL' },
        } },
        execute: async (args) => {
            const files: File[] = [];
            for (const item of args.files ?? []) files.push(new File([bytesFromBase64(item.data) as Uint8Array<ArrayBuffer>], item.name, { type: item.mimeType || '' }));
            for (const url of args.urls ?? []) {
                const response = await fetch(url); if (!response.ok) throw new Error(`下载失败 ${response.status}: ${url}`);
                const blob = await response.blob(); files.push(new File([blob], decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'image'), { type: blob.type }));
            }
            if (!files.length) throw new Error('files 或 urls 至少提供一项');
            await importFiles(files); return result({ imported: files.map((file) => file.name), ...state() });
        },
    },
    {
        name: 'camera_raw_list', description: '列出已加载图片、当前图片和多选状态。',
        inputSchema: { type: 'object', properties: {} }, execute: () => result(state()),
    },
    {
        name: 'camera_raw_select', description: '按图片 id 或文件名切换当前图片，也可设置多选组。',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, additive: { type: 'boolean' } } },
        execute: async (args) => {
            if (args.ids?.length) {
                const ids = args.ids.filter((id: string) => assets.value.some((asset) => asset.id === id));
                if (!ids.length) throw new Error('ids 中没有有效图片');
                await selectAsset(ids[0]); selectedIds.value = new Set(ids);
            } else {
                const asset = assets.value.find((item) => item.id === args.id || item.name === args.name);
                if (!asset) throw new Error('找不到指定图片'); await selectAsset(asset.id, Boolean(args.additive));
            }
            return result(state());
        },
    },
    {
        name: 'camera_raw_adjust', description: '执行任意 Camera Raw 调色操作，包括基本、RGB/R/G/B 曲线、颜色分级、八色混色、校准和光学。参数结构与导出预设一致。',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, mode: { type: 'string', enum: ['merge', 'replace'] }, adjustments: adjustmentsSchema, syncSelected: { type: 'boolean', description: '是否同步到当前多选图片' } }, required: ['adjustments'] },
        execute: async (args) => {
            const asset = target(args.id); if (asset.id !== activeId.value) await selectAsset(asset.id);
            asset.adjustments = mergeAdjustments(args.mode === 'replace' ? createDefaultAdjustments() : asset.adjustments, args.adjustments as Partial<Adjustments>);
            if (args.syncSelected) syncToSelected();
            return result({ image: summary(asset), adjustments: cloneAdjustments(asset.adjustments), ...state() });
        },
    },
    {
        name: 'camera_raw_history', description: '撤销、恢复或复位当前图片的修图操作。',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['undo', 'redo', 'reset'] } }, required: ['action'] },
        execute: (args) => {
            if (args.action === 'undo') undo(); else if (args.action === 'redo') redo(); else if (args.action === 'reset') { const asset = target(); asset.adjustments = createDefaultAdjustments(); }
            return result({ action: args.action, adjustments: cloneAdjustments(target().adjustments) });
        },
    },
    {
        name: 'camera_raw_preset', description: '应用 Camera Raw XMP/JSON 预设，或导出当前图片的 XMP 预设。',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['apply', 'export'] }, id: { type: 'string' }, xmp: { type: 'string', description: 'apply 时传入 XMP 或 JSON 文本' } }, required: ['action'] },
        execute: (args) => {
            const asset = target(args.id);
            if (args.action === 'apply') { if (!args.xmp) throw new Error('apply 需要 xmp'); asset.adjustments = parsePreset(args.xmp); return result({ applied: true, adjustments: asset.adjustments }); }
            return result({ name: `${asset.name.replace(/\.[^.]+$/, '')}.xmp`, xmp: serializePreset(asset.adjustments) });
        },
    },
    {
        name: 'camera_raw_export', description: '导出当前或指定图片为调整后 JPEG、Linear DNG 或 XMP。默认返回 base64；download=true 时同时触发浏览器下载。',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, format: { type: 'string', enum: ['jpeg', 'dng', 'xmp'] }, quality: { type: 'number', minimum: 0, maximum: 1 }, download: { type: 'boolean' } }, required: ['format'] },
        execute: async (args) => {
            const asset = target(args.id); await ensureBitmap(asset);
            const format = args.format as 'jpeg' | 'dng' | 'xmp';
            if (format === 'xmp') {
                const xmp = serializePreset(asset.adjustments); if (args.download) downloadBlob(new Blob([xmp], { type: 'application/rdf+xml' }), `${asset.name}.xmp`);
                return result({ name: `${asset.name}.xmp`, mimeType: 'application/rdf+xml', data: xmp, encoding: 'utf8' });
            }
            const blob = await renderExport(asset, format, args.quality ?? .94), name = `${asset.name.replace(/\.[^.]+$/, '')}-edited.${format === 'jpeg' ? 'jpg' : 'dng'}`;
            if (args.download) downloadBlob(blob, name);
            return result({ name, mimeType: blob.type, encoding: 'base64', data: await blobBase64(blob), size: blob.size });
        },
    },
];

export function listCameraRawTools() {
    return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export async function callCameraRawTool(name: string, args: Record<string, any> = {}): Promise<ToolResult> {
    const tool = tools.find((item) => item.name === name);
    if (!tool) return { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true };
    try { return await tool.execute(args) as ToolResult; }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }; }
}

export function initWebMCP() {
    const api = { listTools: listCameraRawTools, callTool: callCameraRawTool };
    (window as unknown as { cameraRawMCP: typeof api }).cameraRawMCP = api;
    const context = (navigator as unknown as { modelContext?: any }).modelContext;
    let mode = 'local';
    try {
        if (context?.registerTool) {
            for (const tool of tools) context.registerTool({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, execute: (args: Record<string, any>) => callCameraRawTool(tool.name, args) });
            mode = 'webmcp';
        } else if (context?.provideContext) {
            context.provideContext({ tools: tools.map((tool) => ({ ...tool, execute: (args: Record<string, any>) => callCameraRawTool(tool.name, args) })) });
            mode = 'webmcp';
        }
    } catch (error) { console.warn('WebMCP registration failed; local agent API remains available.', error); }
    window.dispatchEvent(new CustomEvent('camera-raw-mcp-ready', { detail: { tools: listCameraRawTools(), mode } }));
    return { available: mode === 'webmcp', mode, count: tools.length };
}
