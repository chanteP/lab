export class BaseParser {
    file: File;

    constructor(file: File) {
        this.file = file;
    }
    async parse() {}

    getFontList(): string[] {
        return [];
    }

    clip(stringList: string[]): File {
        return this.file;
    }
}
