import { BaseParser } from './base';
import { ByteReader } from './utils';

export class TTFParser extends BaseParser {
    async parse() {
        const reader = new ByteReader();
        await reader.setFile(this.file);

        const header = {
            sfnt: reader.read(4, 'string'),
            numTables: reader.read(2, 'number', 'BE'),
            searchRange: reader.read(2, 'number', 'BE'),
            entrySelector: reader.read(2, 'number', 'BE'),
            rangeShift: reader.read(2, 'number', 'BE'),
        };

        const tables = [];

        let i = 0;
        while (i < header.numTables) {
            tables.push({
                tag: reader.read(4, 'string'),
                checkSum: reader.skip(4),
                offset: reader.read(4, 'number', 'BE'),
                length: reader.read(4, 'number', 'BE'),
            });
            i++;
        }

        debugger

        tables
    }
    getFontList(): string[] {
        return [];
    }
}
