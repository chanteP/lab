import { BaseParser } from './base';
import { TTFParser } from './ttf';

export function getParser(typeOrFile: string | File): typeof BaseParser {
    const type = typeof typeOrFile !== 'string' ? typeOrFile.name.split('.').pop() : typeOrFile;

    switch (type) {
        case 'ttf':
            return TTFParser;
        default:
            return BaseParser;
    }
}
