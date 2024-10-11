import { Font, Glyph, parse } from 'opentype.js';

export class BaseParser {
    file: File;

    font: Font;

    constructor(file: File) {
        this.file = file;
    }
    async parse() {
        const buffer = await this.file.arrayBuffer();
        this.font = parse(buffer);
    }

    getFontList(): string[] {
        const glyphs = this.font.glyphs;
        const len = glyphs.length;

        const characters: string[] = [];

        let i = 0;
        while (i < len) {
            const glyph = glyphs.get(i);

            if (glyph.unicode) {
                characters.push(String.fromCharCode(glyph.unicode));
            }

            i++;
        }

        return characters;
    }

    getLigatureList(): { combo: string; result: Glyph }[] {
        const result: { combo: string; result: Glyph }[] = [];

        // 访问 GSUB 表
        const gsub = this.font.tables.gsub;
        gsub?.lookups?.forEach((lookup) => {
            lookup.subtables?.forEach((subTable) => {
                const head = subTable.coverage?.glyphs ?? [];

                subTable.ligatureSets?.forEach((ligatureSet, index) => {
                    // console.warn(ligatureSet);
                    ligatureSet?.forEach((set) => {
                        const ids = [head[index], ...set.components]
                            .filter(d => d !== undefined)
                            .map((component) => this.font.glyphs.get(component))
                            .map((glyph) => String.fromCharCode(glyph.unicode));
                        const target = this.font.glyphs.get(set.ligGlyph);
                        console.log(ids.join(' + '), ' = ', target.name);

                        result.push({ combo: ids.join(''), result: target });
                    });
                });
            });
        });

        return result;
    }

    async clip(stringList: string, options: { familyName: string }): Promise<File> {
        const notdef = this.font.glyphs.get(0);

        const glyphs: Glyph[] = [];
        new Set(stringList.split('')).forEach((char) => {
            const glyph = this.font.charToGlyph(char);
            if (!glyph) {
                console.error(`${char} not found`);
            } else {
                glyphs.push(glyph);
            }
        });

        console.log(glyphs);

        const languageKey = 'en' in this.font.names.fontFamily ? 'en' : Object.keys(this.font.names.fontFamily)[0];
        const name = options.familyName ?? this.font.names.fontFamily[languageKey];

        // 创建一个新的字体对象，包含子集的字形
        const subsetFont = new Font({
            familyName: name,
            styleName: this.font.names.fontSubfamily[languageKey],
            glyphs: notdef.name === '.notdef' ? [notdef, ...glyphs]: [...glyphs],
            unitsPerEm: this.font.unitsPerEm,
            ascender: this.font.ascender,
            descender: this.font.descender,
        });

        // 保存裁剪后的字体
        // subsetFont.download(`${name}.min.ttf`);

        const buffer = await subsetFont.toArrayBuffer();

        // 创建Blob对象
        const blob = new Blob([buffer], { type: 'font/opentype' });

        // 使用Blob对象创建File对象
        const file = new File([blob], `${name}.min.otf`, { type: 'font/opentype' });

        return file;
    }
}
