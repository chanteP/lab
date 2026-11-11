import { useTravelLibrary } from './useTravelLibrary';
import { serializeTrip, serializeTripCollection } from '../utils/yaml';
import { scheduleDay, tripDateRange } from '../utils/time';
import type { Trip } from '../types';

type ToolResult = { content: { type: string; text: string }[]; structuredContent?: unknown; isError?: boolean };
type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown>; execute: (args: Record<string, any>) => Promise<unknown> | unknown };

const result = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
const summary = (trip: Trip) => ({
    id: trip.id, title: trip.title, description: trip.description, destination: trip.destination,
    days: trip.schedules.length || 1, dateRange: tripDateRange(trip), coverImage: trip.coverImages[0],
    scheduleTitles: trip.schedules.map((schedule, index) => ({ day: scheduleDay(schedule, index), title: schedule.title })),
});

export function useWebMCP() {
    const library = useTravelLibrary();
    const findTrip = (id?: string) => {
        const trip = library.trips.value.find((item) => item.id === id);
        if (!trip) throw new Error(id ? `找不到旅行计划 ${id}` : '请先提供旅行计划 id');
        return trip;
    };
    const tools: ToolDefinition[] = [
        {
            name: 'travel_list',
            description: '列出浏览器中保存的全部旅行计划，包含 id、目的地、封面、天数和日期范围。',
            inputSchema: { type: 'object', properties: {} },
            execute: () => result({ trips: library.trips.value.map(summary) }),
        },
        {
            name: 'travel_get',
            description: '按 id 读取完整旅行计划，包含每天行程、景点、交通与固定路线。',
            inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
            execute: (args) => {
                const trip = findTrip(args.id);
                return result({ trip, yaml: serializeTrip(trip) });
            },
        },
        {
            name: 'travel_import',
            description: '导入并保存一个或多个 YAML 旅行计划。接受 trip 或 trips 根节点，同 id 会更新已有计划。',
            inputSchema: { type: 'object', properties: { yaml: { type: 'string', description: '完整 YAML 文本；字符串值使用双引号' } }, required: ['yaml'] },
            execute: async (args) => {
                if (typeof args.yaml !== 'string') throw new Error('yaml 必须是字符串');
                const trips = await library.importYaml(args.yaml);
                return result({ imported: trips.map(summary) });
            },
        },
        {
            name: 'travel_export',
            description: '按 id 导出单个计划的标准 YAML；不传 id 时导出全部计划。',
            inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
            execute: (args) => result({ yaml: args.id ? serializeTrip(findTrip(args.id)) : serializeTripCollection(library.trips.value) }),
        },
    ];

    async function callTool(name: string, args: Record<string, any> = {}): Promise<ToolResult> {
        const tool = tools.find((item) => item.name === name);
        if (!tool) return { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true };
        try { return await tool.execute(args) as ToolResult; }
        catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }; }
    }

    function initWebMCP() {
        const listTools = () => tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
        const api = { listTools, callTool };
        (window as unknown as { travelMCP: typeof api }).travelMCP = api;
        const context = (navigator as unknown as { modelContext?: any }).modelContext;
        let mode = 'local';
        try {
            if (context?.registerTool) {
                for (const tool of tools) context.registerTool({ ...tool, execute: (args: Record<string, any>) => callTool(tool.name, args) });
                mode = 'webmcp';
            } else if (context?.provideContext) {
                context.provideContext({ tools: tools.map((tool) => ({ ...tool, execute: (args: Record<string, any>) => callTool(tool.name, args) })) });
                mode = 'webmcp';
            }
        } catch (error) { console.warn('WebMCP registration failed; local agent API remains available.', error); }
        window.dispatchEvent(new CustomEvent('travel-mcp-ready', { detail: { tools: listTools(), mode } }));
        return { available: true, native: mode === 'webmcp', mode, count: tools.length };
    }

    return { initWebMCP };
}
