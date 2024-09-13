import { FileFormat } from './type';

export const OTF: FileFormat = {
    name: 'ttf/otf',
    format: `
#header
sfnt, 4, string
numTables, >2,number
searchRange, >2,number
entrySelector, >2, number
rangeShift, >2, number

loop(\${numTables}): # tableRecords
tag, 4, string
crc, 4
offset, >4, number
length, >4, number
content, [\${offset}, \${offset + length}]
    `,
};
