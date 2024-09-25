function toNumber(value: ArrayBuffer, order: 'LE' | 'BE' = 'LE'): number {
    switch (value.byteLength) {
        case 4:
            return new DataView(value).getInt32(0, order === 'LE');
        case 2:
            return new DataView(value).getInt16(0, order === 'LE');
        case 1:
            return new DataView(value).getInt8(0);
        default:
            console.error('unexpected data length', value);
            return 0;
    }
}

type ReaderTypes = {
    string: () => string;
    arraybuffer: () => ArrayBuffer;
    number: (order?: 'LE' | 'BE') => number;
};

export class ByteReader {
    cursor = 0;
    size = 0;
    file: Blob;
    data?: ArrayBuffer;

    ready = false;

    isAsync = false;

    constructor(isAsync = false) {
        this.isAsync = isAsync;
    }

    async setFile(file?: Blob) {
        this.ready = false;

        this.file = file;
        if (!this.isAsync) {
            this.data = await file.arrayBuffer();
        }
        this.size = file.size;

        this.ready = true;
    }

    to(pos: number) {
        if (pos > this.size) {
            console.error('pos out of range', pos, this.size);
        }
        this.cursor = pos;
    }

    skip(len: number){
        this.cursor += len;
    }

    get<T extends keyof ReaderTypes>(
        offset: number,
        len: number,
        format: T = 'arraybuffer' as T,
        ...args: Parameters<ReaderTypes[T]>
    ): ReturnType<ReaderTypes[T]> {
        if (!this.file || !this.ready) {
            throw new Error('not ready');
        }
        const data = this.data.slice(offset, offset + len);

        if (format === 'string') {
            return new TextDecoder('utf-8').decode(data) as ReturnType<ReaderTypes[T]>;
        }
        if (format === 'number') {
            return toNumber(data, args[0]) as ReturnType<ReaderTypes[T]>;
        }

        return data as ReturnType<ReaderTypes[T]>;
    }

    async getAsync<T extends keyof ReaderTypes>(
        offset: number,
        len: number,
        format: T = 'arraybuffer' as T,
        ...args: Parameters<ReaderTypes[T]>
    ): Promise<ReturnType<ReaderTypes[T]>> {
        if (!this.file || !this.ready) {
            throw new Error('not ready');
        }

        const data = this.file.slice(offset, offset + len);

        if (format === 'string') {
            return data.text() as Promise<ReturnType<ReaderTypes[T]>>;
        }
        if (format === 'number') {
            const val = await data.arrayBuffer();
            return toNumber(val, args[0]) as ReturnType<ReaderTypes[T]>;
        }

        return data.arrayBuffer() as ReturnType<ReaderTypes[T]>;
    }

    read<T extends keyof ReaderTypes>(
        len: number,
        format?: T,
        ...args: Parameters<ReaderTypes[T]>
    ): ReturnType<ReaderTypes[T]> {
        const data = this.get(this.cursor, len, format, ...args);
        this.skip(len);
        return data;
    }

    async readAsync<T extends keyof ReaderTypes>(
        len: number,
        format?: T,
        ...args: Parameters<ReaderTypes[T]>
    ): Promise<ReturnType<ReaderTypes[T]>> {
        const data = this.getAsync(this.cursor, len, format, ...args);
        this.skip(len);
        return data;
    }
}
