# model3d 紧凑 YAML 项目格式

项目导入、导出和 IndexedDB 统一使用 `utils/projectYaml.ts` 的 `stringifyProjectYaml` / `parseProjectYaml`。该格式是面向模型数据和 LLM 的**紧凑 YAML 方言**：保留 YAML 的键值、缩进和块数组写法，同时按项目要求省略一维数组方括号。它不能直接交给不接受这些扩展规则的通用 YAML 解析器。

## 基本规则

- 对象使用 `key: value`，嵌套对象和块数组每级缩进 2 个空格。
- 字符串值始终使用 JSON 兼容的双引号与转义，逗号、冒号、`#`、换行和引号不会干扰结构解析。
- 数字统一四舍五入到最多 4 位小数，省略末尾多余的 `0`；非有限数拒绝保存，`-0` 归一为 `0`。
- 布尔值写作 `true` / `false`，空值写作 `null`。
- 空数组和空对象分别写作 `[]`、`{}`。
- 常规对象键使用不带引号的短形式；键包含特殊字符时使用双引号。
- 对象中值为 `undefined` 的可选字段省略，与原 JSON 项目文件语义一致。不接受函数、Symbol、BigInt 和非有限数。

## 数组压缩

一维数组直接使用逗号分隔，不写方括号，也不在逗号后添加空格：

```yaml
position: 0,20,0
scale: 1,1,1
visibleFlags: true,false,true
names: "甲,乙","丙:丁"
```

多维数组的每个子数组独占一行，子数组仍按一维数组压缩：

```yaml
points:
  - 0,0
  - 20,0
  - 20,10
mesh:
  -
    - 1,2
    - 3,4
  -
    - 5,6
    - 7,8
```

单元素数组在末尾保留一个逗号，避免还原成标量：`single: "only",` 表示 `["only"]`。空数组仍使用 `[]`。

对象数组使用独立 `-` 行，再缩进对象内容：

```yaml
entities:
  -
    id: "box"
    name: "立方体"
    position: 0,20,0
```

## 项目与文件载体

- 导出文件只保存 `ModelDocument`，扩展名为 `.model.yaml`，MIME 为 `application/yaml`；导入接受 `.yaml` / `.yml`。
- IndexedDB 使用页面隔离数据库 `lab:model3d` 和 `projects` store。每条记录为 `{ id, yaml }`，其中 `yaml` 是完整 `ProjectRecord`（含项目元数据和 document）的紧凑 YAML 文本；`id` 仅作为 IndexedDB keyPath。
- 当前阶段不保留旧 JSON 项目或旧数据库的迁移、回退读取逻辑。
- 数字精度在写入时归一化，因此“一一对应”指对象结构、键、数组维度、字符串、布尔值和空值完整还原，数值以四位小数归一化后的值为准。

## LLM 与进一步压缩

当前优先减少**可读 token**：短数字、无空格数组、无重复括号、稳定缩进，并保留有语义的键名。通用 gzip / Deflate 适合网络传输和归档，但输出二进制，不能直接供 LLM 阅读；Base64 会增加体积且丢失结构，因此不用于默认项目格式。短键字典、数值数组游程编码或二进制打包可以作为未来独立选项，但需要额外 schema，且对普通实体的 token 收益通常低于可读性损失，本次不引入。

## Changelog

- 2026-11-05：项目 JSON 切换为紧凑 YAML，导入、导出和 IndexedDB 共用可逆编解码；加入四位小数、单元素数组和嵌套数组规则。
