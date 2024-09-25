import { Font, parse } from 'opentype.js';

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

    async clip(stringList: string, options: { familyName: string }): Promise<File> {
        const notdef = this.font.glyphs.get(0);
        const glyphs = stringList.split('').map((char) => {
            return this.font.charToGlyph(char);
        });

        console.log(glyphs);

        const languageKey = 'en' in this.font.names.fontFamily ? 'en' : Object.keys(this.font.names.fontFamily)[0];
        const name = options.familyName ?? this.font.names.fontFamily[languageKey];

        // 创建一个新的字体对象，包含子集的字形
        const subsetFont = new Font({
            familyName: name,
            styleName: this.font.names.fontSubfamily[languageKey],
            glyphs: [notdef, ...glyphs],
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
