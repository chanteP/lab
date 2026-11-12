# Atlas 架构与交互

## 目录

- `components/home/`：全屏首页工具栏、空状态和 trip 标题/备注编辑。
- `components/plan/`：计划页、每日导航与地点右侧浮层。
- `components/map/MapCanvas.vue`：Vue 生命周期接入；`map/TravelMap.ts` 负责 Leaflet、pin、路线和镜头。
- `composables/useTravelLibrary.ts`：共享旅行集合、导入与保存。
- `composables/useWebMCP.ts`：原生 WebMCP 和 `window.travelMCP` 本地 Agent bridge。
- `stores/`：IndexedDB/localStorage；`utils/`：YAML、规范化、时间与 ID。
- `types/`：Trip、Schedule、ItineraryItem、Place、Transit 数据契约。

## 地图和镜头

当前无 Google Maps API key，因此使用 Leaflet + OpenStreetMap 标准底图（地图专用深色滤镜），无需密钥且保持纯静态。`TravelMap` 是地图 provider 边界，页面组件不直接操作 Leaflet。

首页和计划页共用地图实例。进入计划使用 `flyToBounds` 从世界地图连续放大到所有景点和路线；退出恢复所有 trip 的视野。点击地点后先飞向坐标，再向右平移地图中心，使地点在视觉上位于左侧并露出右侧面板；关闭详情恢复计划视野。每日首个地点显示“第 N 天 + 日期”气泡。

### TODO：Google Maps

- [ ] 用户配置 API key 后实现 Google Maps provider，保留现有 `renderHome / renderPlan / focusPlace` 调用契约。
- [ ] 接入 Maps JavaScript API、DirectionsService 和 Places；API key 只通过本地环境配置注入，不提交到仓库或 YAML。
- [ ] 将 Directions 结果转换为 `transit.route.path` 或 `encodedPolyline`，保存后可离线复现路线。
- [ ] 评估 AdvancedMarkerElement 对现有照片 pin 和扑克牌 hover 动效的承载方式。

## WebMCP

页面注册 `travel_list`、`travel_get`、`travel_import`、`travel_export`。支持 `navigator.modelContext.registerTool` 和 `provideContext`；不支持原生 WebMCP 的浏览器仍可通过 `window.travelMCP.listTools()` / `callTool(name, args)` 使用相同工具。右下角信息图标显示连接状态。

## 交互与视觉

Naive UI 使用 darkTheme；地图和浮层采用低饱和墨绿、暖白与浅青灰，操作色为浅黄绿。pin 使用照片、纸张、图钉三层结构；hover 时备注卡以扑克牌抽出方式完整展开，并根据地图边缘选择向左、向右或向上，避免与照片重叠或移出视口。镜头、页面和详情面板使用不同缓动，避免同时移动所有元素。所有地图主要操作使用原生 button，页面往返使用 hash 链接以支持浏览器前进/后退。

## Changelog

- 2026-11-11：新增 Atlas 全屏旅行地图、计划详情、YAML/WebMCP、Leaflet fallback 和镜头衔接。
- 2026-11-12：重做 trip pin 照片与定位装饰，cover 按地图边缘完整滑出，并修复版权标签样式。
