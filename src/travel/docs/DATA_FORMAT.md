# Atlas 旅行数据格式

Atlas 使用标准 YAML。单计划文件的根节点是 `trip`，批量文件是 `trips`。导出时所有字符串均使用双引号；时间戳、日期和时间也应写成字符串，避免 YAML 自动类型转换。

## 命名契约

初稿中的字段统一为以下专业名称，避免 `things`、`at`、`plain` 等歧义或拼写问题：

| 初稿 | 当前字段 | 说明 |
| --- | --- | --- |
| `desc` | `description` | 所有层级的描述/备注 |
| `coverList` | `coverImages` | 图片 URL 数组，第一张为封面 |
| `position` | `coordinates` | `{ lat, lng }`，与 GeoJSON/地图 SDK 的 `lng` 对齐 |
| `things` | `items` | 日程中的有序行程项 |
| `at: traffic / point` | `kind: transit / place` | 区分交通和地点行程 |
| `from / to`（地点） | `origin / destination` | 交通起终点 |
| `passby` | `waypoints` | 有序途经点 |
| `type`（交通） | `mode` | `unknown / walking / driving / bus / train / flight` |
| `type`（地点） | `categories` | `attraction / lodging / transport` 数组 |
| `duration` | `durationMinutes` / `recommendedDurationMinutes` | 交通时长/建议游玩时长，单位均为分钟 |
| `time / from / to` | `startTime / endTime` | ISO 时间、`dayN` 或 `HH:mm` 字符串 |

`Trip` 额外包含稳定的 `id`、`createdAt` 和 `updatedAt`，用于 IndexedDB 保存、Agent 读取及同 ID 更新。`Schedule` 的 `startTime` 接受 `day1` 或 ISO 时间；每天的时间范围由日程起始时间推导。

## 结构摘要

```yaml
trip:
  id: "unique-trip-id"
  title: "旅行标题"
  description: "备注"
  destination: { lat: 39.9042, lng: 116.4074 }
  coverImages: ["https://example.com/cover.jpg"]
  schedules:
    - id: "day-1"
      startTime: "2027-04-03T09:00:00+08:00" # 也支持 "day1"
      title: "第一天"
      coverImages: []
      items:
        - id: "visit-1"
          kind: "place"
          startTime: "09:00"
          endTime: "11:30"
          place:
            id: "place-1"
            name: "地点名称"
            categories: ["attraction"]
            coordinates: { lat: 39.9, lng: 116.4 }
            images: []
            description: "地点介绍"
            recommendedDurationMinutes: 150
            checkpoints:
              - { checked: false, title: "预约门票", description: "详细步骤" }
        - id: "transit-1"
          kind: "transit"
          startTime: "11:30"
          endTime: "12:00"
          transit:
            title: "前往下一站"
            origin: { /* 完整 Place */ }
            destination: { /* 完整 Place */ }
            waypoints: []
            durationMinutes: 30
            mode: "walking"
            route:
              path:
                - { lat: 39.9, lng: 116.4 }
                - { lat: 39.91, lng: 116.41 }
  createdAt: "2027-01-01T00:00:00.000Z"
  updatedAt: "2027-01-01T00:00:00.000Z"
```

实际文件不能使用注释中的 `{ /* 完整 Place */ }` 占位，交通端点必须展开为完整 Place。允许省略可选字段；导入时会补齐 ID、空数组及默认分类。

## 交通路线

- `route.path`：按行进顺序排列的固定经纬度路径。存在至少两个点时，地图严格使用该路线。
- `route.encodedPolyline`：可选的 Google Encoded Polyline，供未来 Google Directions 结果直接落库；无 `path` 时解码显示。
- `route.color`：可选 CSS 颜色。
- 没有路线几何时，以 `origin → waypoints → destination` 绘制虚线，表示连接顺序而非真实道路，不伪装成导航结果。
- `walking / driving / bus / train / flight / unknown` 使用不同路线颜色。

## 存储与交换

- IndexedDB：数据库 `lab:travel`，object store `trips`；记录为 `{ id, yaml }`。
- 当前计划：localStorage `lab:travel:trip:activeId`。
- 单计划导入接受 `trip` 或裸 Trip；批量导入接受 `trips`。相同 ID 更新，未提供 ID 时自动生成。
- 导入与导出使用 `yaml` 包的标准 YAML，不使用 model3d 的紧凑方言。

## Changelog

- 2026-11-11：建立 Atlas YAML 契约、专业字段命名、固定交通路线与页面隔离存储。
