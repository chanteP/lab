declare interface Field {
    type: 'field';
    viewType: '' | '-' | '+';
    name: string;
    repeat: string | number;
    length: string | number;
    group?: string;
    order?: 0 | 1;
    offset?: [string, string] | null;
    value?: string;
}
declare interface Group {
    type: 'group';
    name: string;
    level: number;
    repeat: string | number;
    fields: Record[];
}
declare type Record = Field | Group;

export function parseText(content: string): Record[] {
    const result: Record[] = [];
    let groupStack = [];
    function getLastGroup() {
        return groupStack.length ? groupStack[groupStack.length - 1].fields : result;
    }
    content
        .split('\n')
        .forEach(lineText => {
            lineText = lineText.trim();
            if (!lineText) { return; }

            if (lineText.startsWith('#')) {
                const group = parseGroup(lineText);
                while (groupStack.length) {
                    if (groupStack[groupStack.length - 1].level >= group.level) {
                        groupStack.pop();
                    } else {
                        break;
                    }
                }
                getLastGroup().push(group);
                groupStack.push(group);
            } else {
                const field = parseField(lineText);
                field.group = getLastGroup().name || '';
                getLastGroup().push(field);
            }
        });
    return result;
}

function parseGroup(lineText): Group {
    const [match, level, repeat, name] = /^(#+\s*)(?:\[(.+?)\])?(.*)$/.exec(lineText);
    return {
        type: 'group',
        level: trim(level).length,
        name: trim(level) + trim(name),
        repeat: trim(repeat) || '1',
        fields: [],
    }
}
function parseField(lineText): Field {
    const arr = lineText.trim().split(',');
    const [matchName, viewType, repeat, name] = /^([-+]\s*)?(?:\[(.+?)\])?(.*)$/.exec(arr[0]) || [];
    const [matchValue, order, offset, length] = /^([><]\s*)?(?:\[(.*)\]|(.*))$/.exec(arr.slice(1).join(',')) || [];
    return {
        type: 'field',
        viewType: trim(viewType, ''),
        name: trim(name),
        repeat: trim(repeat) || '1',
        order: trim(order) === '>' ? 1 : 0, // 存储顺序，>大端
        offset: offset ? offset.split(',').map(d => trim(d)) : null,
        length: trim(length),
    };
}

function isField(record: Record): record is Field {
    return record.type === 'field';
}

function getValue(text): [string, boolean] {
    const [match, v] = /\${([\w\W]+?)}/.exec(text) || [];
    return [match ? v.trim() : text, !!match];
}

function trim(value, defaultValue = value): string {
    return typeof value === 'string' ? value.trim() : defaultValue;
}

interface handler {
    handleField: (field: Field, opts: handler) => void;
    handleGroup: (group: Group, opts: handler) => void;
    [name: string]: any;
};
export async function parseFormatter(formatter: Record[], opts: handler) {
    const { handleField, handleGroup } = opts;
    let i = 0;
    while (i < formatter.length) {
        const record = formatter[i];
        if (isField(record)) {
            await handleField(record, opts);
        } else {
            await handleGroup(record, opts);
        }
        i++;
    }
}

export async function parseBlank(formatter: Record[]): Promise<Record[]> {
    const result: Record[] = [];
    let offset = 0;
    const valueMap: Map<string, string> = new Map;
    await parseFormatter(formatter, {
        async handleField(field, opts) {
            opts.result.push({
                ...field,
            });
        },
        async handleGroup(group, opts) {
            opts.result.push({
                ...group,
            });
            await parseFormatter(group.fields, opts);
        },
        result,
    });
    return result;
}

function convertValue(buffer: ArrayBuffer, order: 0 | 1): ArrayBuffer {
    let len = buffer.byteLength;
    if (!order || len === 1) { return buffer; }
    const source = new Uint8Array(buffer);
    const rs = new Uint8Array(len);
    let i = 0;
    while (i < len) {
        rs[i] = source[len - i - 1];
        i++;
    }
    return rs.buffer;
}

export async function parseFile(formatter: Record[], file: File, progressCallback?: (loaded: number, total: number) => void): Promise<Record[]> {
    const result: Record[] = [];
    let offset = 0;
    const valueMap: Map<string, string> = new Map;
    const total = file.size;
    let loaded = 0;
    await parseFormatter(formatter, {
        result,
        async handleField(field, opts) {
            let repeat = parseValueAsNumber(field.repeat);
            while (repeat-- > 0) {
                const contentOffset = field.offset ? [
                    parseValueAsNumber(field.offset[0]),
                    parseValueAsNumber(field.offset[1])
                ] : null;
                const length = contentOffset ? contentOffset[1] - contentOffset[0] : parseValueAsNumber(field.length);
                const resultOffset = contentOffset || [offset, offset + length];
                const blob = file.slice(resultOffset[0], resultOffset[1]);
                offset += contentOffset ? 0 : length;
                let value;
                if (field.viewType === '+') {
                    const buffer = convertValue(await blob.arrayBuffer(), field.order);
                    switch (length) {
                        case 4: value = new Uint32Array(buffer)[0]; break;
                        case 2: value = new Uint16Array(buffer)[0]; break;
                        case 1: value = new Uint8Array(buffer)[0]; break;
                    }
                } else if (field.viewType === '-') {
                    value = await blob.text();
                } else {
                    const buffer = await blob.arrayBuffer();
                    value = Array.from(new Uint8Array(buffer))
                        .map(d => d.toString(16).padLeft(2, 0).toUpperCase())
                        .join(' ');
                }
                valueMap.set(field.name, value);
                opts.result.push({
                    ...field,
                    value,
                    length,
                    offset: resultOffset,
                });
                loaded += length;
                progressCallback && progressCallback(loaded, total);
            }
        },
        async handleGroup(group, opts) {
            let repeat = parseValueAsNumber(group.repeat);
            while (repeat-- > 0) {
                opts.result.push({
                    ...group,
                });
                await parseFormatter(group.fields, opts);
            }
        }
    });
    progressCallback && progressCallback(total, total);
    return result;

    function parseValueAsNumber(text: string | number): number {
        if (!String(text).includes('$')) { return +text; }
        const str = String(text).replace(/\${(.*)}/g, (match, v) => {
            return v.replace(/\b(\w+)\b/g, (m, key) => {
                return isNaN(key) ? valueMap.get(key) || '0' : key;
            });
        });
        return eval(str);
    }
}

export function fitHeight(textarea: HTMLElement) {
    if (!textarea) {
        return;
    }
    textarea.style.height = '0';
    textarea.style.height = textarea.scrollHeight + 'px';
}
export function genColorFromString(text: string) {
    return text
        .split('')
        .reduce((d, s) => (d += s.charCodeAt(0)), 0)
}

export function parseJson(json: string) {
    try {
        return JSON.parse(json);
    } catch (e) {
        console.warn(e);
    }
}

export const tips = `
支持的语法：

1. 分组group，以#开头，\${} 部分支持变量
#groupName
#[repeatCount]groupName  // 组重复
#[\${repeatByFieldName}]groupName   
##subGroupName

如：
#header
#[\${countFromOtherField}]someGroup

分组以 下一个同级分组 或 下一个低级分组 为结束条件，如

#group1
#group2

#group1
##subGroup
#group2

2. 字段Field, \${} 部分支持变量
fieldName,byteLength     // 以16进制读取
fieldName,[offsetStart, offsetEnd]     // 以offset读取（下个字段不会往前推进）
fieldName,[\${offsetStart}, \${offsetEnd}]     // 以offset变量读取（下个字段不会往前推进）
fieldName,>byteLength    // 以大端序读取
fieldName,<byteLength    // 以小端序读取
-fieldName,byteLength    // 以文本读取
+fieldName,byteLength    // 以数字读取
-[fieldRepeatCount]fieldName,byteLength   // 重复
-[\${fieldRepeatCount}]fieldName,\${byteLengthFromOtherField}

如：
-mark,100
+count,4
+[3]repeatField,4
`;
