import { registerDataFormatter } from './parser';

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
