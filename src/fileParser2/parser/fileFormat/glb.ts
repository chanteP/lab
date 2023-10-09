import { FileFormat } from './type';

export const GLB: FileFormat = {
    name: 'glb',
    format: `
#header
magic,4, string
version,4, number
length,4, number

loop(): #part
chunkLength, 4, number
chunkType, 4, string

if(chunkType is 'JSON'): json, \${chunkLength}, string | json
elseif(chunkType is 'BIN\x00'): bin, \${chunkLength}
endif
    `,
};
