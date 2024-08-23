import { registerDataFormatter } from './parser';
import { GroupRecord, hasGroupContains } from './parser/FileData';
import CRC32 from 'crc-32';

registerDataFormatter('default', (buffer) => {
    if (buffer instanceof ArrayBuffer) {
        return Array.from(new Uint8Array(buffer))
            .map((d) => d.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
    }
});

registerDataFormatter('image', (buffer) => {
    let src = '';
    if (buffer instanceof ArrayBuffer) {
        const blob = new Blob([buffer]);
        src = URL.createObjectURL(blob);
    }
    return `<img src="${src}" style="display: block; max-width: 100%" />`;
});

window.crc32 = CRC32.buf;

registerDataFormatter('png', (buffer, field, file) => {
    let src = '';
    if (buffer instanceof ArrayBuffer) {
        // src = URL.createObjectURL(new Blob([buffer]));

        const header = file.find((g) => g.name === 'header') as GroupRecord;
        const IHDR = file.find((g) => hasGroupContains(g, 'type', 'IHDR')) as GroupRecord;
        const IEND = file.find((g) => hasGroupContains(g, 'type', 'IEND')) as GroupRecord;
        if (header && IHDR && IEND) {
            const currentGroup = file.find((g) => g.content.some((f) => f === field));
            if (currentGroup) {
                const fileData = currentGroup.file;
                const IDAT = new Blob(
                    currentGroup.content.map((field) => {
                        return fileData.slice(field.offset, field.offset + field.length);
                    }),
                );

                // const length = new Uint32Array([buffer.byteLength]);
                // const type = new Uint32Array('IDAT'.split('').map((c) => c.charCodeAt(0)));
                // const crc = new Uint32Array([CRC32.buf(new Uint8Array(buffer))]);
                // // console.error(CRC32.buf(new Uint8Array(buffer)))
                // const IDAT = [length, type, buffer, crc];
                const blob = new Blob([header.data, IHDR.data, IDAT, IEND.data], {type: 'image/png'});
                src = URL.createObjectURL(blob);
            }
        }
    }
    return `<a href="${src}" download="data.png"><img src="${src}" style="display: block; max-width: 100%" /></a>`;
});
