type Scalar = string | number | boolean | null;
type Token = { indent: number; text: string; line: number };

function isScalar(value: unknown): value is Scalar {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function rounded(value: number) {
    if (!Number.isFinite(value)) throw new Error('项目数值必须是有限数');
    const result = Number(value.toFixed(4));
    return Object.is(result, -0) ? 0 : result;
}

function scalarText(value: Scalar) {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return String(rounded(value));
    if (value === null) return 'null';
    return String(value);
}

function keyText(key: string) {
    return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function scalarArrayText(value: unknown[]) {
    if (!value.length) return '[]';
    const text = value.map((item) => scalarText(item as Scalar)).join(',');
    // A trailing comma preserves the array type for one-element arrays.
    return value.length === 1 ? `${text},` : text;
}

function inlineText(value: unknown): string | undefined {
    if (isScalar(value)) return scalarText(value);
    if (Array.isArray(value)) {
        if (!value.length) return '[]';
        return value.every(isScalar) ? scalarArrayText(value) : undefined;
    }
    if (typeof value === 'object' && value && !Object.keys(value).length) return '{}';
    return undefined;
}

function writeBlock(value: unknown, indent: number, lines: string[]) {
    const padding = ' '.repeat(indent);
    if (Array.isArray(value)) {
        value.forEach((item) => {
            const inline = inlineText(item);
            if (inline !== undefined) lines.push(`${padding}- ${inline}`);
            else {
                lines.push(`${padding}-`);
                writeBlock(item, indent + 2, lines);
            }
        });
        return;
    }
    if (typeof value !== 'object' || !value) throw new Error('项目根节点必须是对象或数组');
    Object.entries(value).forEach(([key, item]) => {
        if (item === undefined) return;
        const inline = inlineText(item);
        if (inline !== undefined) lines.push(`${padding}${keyText(key)}: ${inline}`);
        else {
            lines.push(`${padding}${keyText(key)}:`);
            writeBlock(item, indent + 2, lines);
        }
    });
}

/** Serializes JSON-compatible project data into the compact, YAML-inspired model3d format. */
export function stringifyProjectYaml(value: unknown) {
    const inline = inlineText(value);
    if (inline !== undefined) return `${inline}\n`;
    const lines: string[] = [];
    writeBlock(value, 0, lines);
    return `${lines.join('\n')}\n`;
}

function tokens(source: string) {
    return source.replace(/^\uFEFF/, '').split(/\r?\n/).flatMap((raw, index): Token[] => {
        if (!raw.trim() || raw.trimStart().startsWith('#')) return [];
        const indent = raw.match(/^ */)![0].length;
        if (raw.slice(0, indent + 1).includes('\t')) throw new Error(`第 ${index + 1} 行不能使用 Tab 缩进`);
        return [{ indent, text: raw.slice(indent), line: index + 1 }];
    });
}

function splitComma(text: string) {
    const parts: string[] = [];
    let start = 0, quoted = false, escaped = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (escaped) escaped = false;
        else if (char === '\\' && quoted) escaped = true;
        else if (char === '"') quoted = !quoted;
        else if (char === ',' && !quoted) {
            parts.push(text.slice(start, index));
            start = index + 1;
        }
    }
    if (quoted) throw new Error('字符串缺少结束双引号');
    parts.push(text.slice(start));
    return parts;
}

function scalarValue(text: string): Scalar {
    if (!text) throw new Error('数组元素不能为空');
    if (text.startsWith('"')) {
        try {
            const value = JSON.parse(text);
            if (typeof value !== 'string') throw new Error();
            return value;
        } catch { throw new Error(`无效字符串：${text}`); }
    }
    if (text === 'null') return null;
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return rounded(Number(text));
    throw new Error(`无效值：${text}；字符串必须使用双引号`);
}

function inlineValue(text: string): unknown {
    if (text === '[]') return [];
    if (text === '{}') return {};
    const parts = splitComma(text);
    if (parts.length > 1 || text.endsWith(',')) {
        if (parts[parts.length - 1] === '') parts.pop();
        return parts.map(scalarValue);
    }
    return scalarValue(text);
}

function mappingKey(text: string, line: number) {
    let quoted = false, escaped = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (escaped) escaped = false;
        else if (char === '\\' && quoted) escaped = true;
        else if (char === '"') quoted = !quoted;
        else if (char === ':' && !quoted) {
            const rawKey = text.slice(0, index);
            const key = rawKey.startsWith('"') ? scalarValue(rawKey) : rawKey;
            if (typeof key !== 'string' || !key) throw new Error(`第 ${line} 行对象键无效`);
            return { key, rest: text.slice(index + 1).trimStart() };
        }
    }
    throw new Error(`第 ${line} 行缺少对象键分隔符 :`);
}

function parseBlock(tokens: Token[], start: number, indent: number): { value: unknown; next: number } {
    const sequence = tokens[start].text === '-' || tokens[start].text.startsWith('- ');
    const value: any = sequence ? [] : {};
    let index = start;
    while (index < tokens.length && tokens[index].indent === indent) {
        const token = tokens[index];
        const isItem = token.text === '-' || token.text.startsWith('- ');
        if (sequence !== isItem) break;
        if (sequence) {
            const rest = token.text === '-' ? '' : token.text.slice(2);
            if (rest) value.push(inlineValue(rest));
            else if (tokens[index + 1]?.indent > indent) {
                const child = parseBlock(tokens, index + 1, tokens[index + 1].indent);
                value.push(child.value);
                index = child.next - 1;
            } else value.push(null);
        } else {
            const { key, rest } = mappingKey(token.text, token.line);
            if (Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`第 ${token.line} 行对象键重复：${key}`);
            if (rest) value[key] = inlineValue(rest);
            else if (tokens[index + 1]?.indent > indent) {
                const child = parseBlock(tokens, index + 1, tokens[index + 1].indent);
                value[key] = child.value;
                index = child.next - 1;
            } else value[key] = null;
        }
        index++;
    }
    return { value, next: index };
}

/** Parses the compact format; it intentionally does not accept arbitrary standard YAML scalar styles. */
export function parseProjectYaml<T = unknown>(source: string): T {
    const parsedTokens = tokens(source);
    if (!parsedTokens.length) throw new Error('项目文件为空');
    if (parsedTokens.length === 1 && parsedTokens[0].indent === 0 && !parsedTokens[0].text.includes(':')) return inlineValue(parsedTokens[0].text) as T;
    const result = parseBlock(parsedTokens, 0, parsedTokens[0].indent);
    if (result.next !== parsedTokens.length) throw new Error(`第 ${parsedTokens[result.next].line} 行缩进或结构无效`);
    return result.value as T;
}
