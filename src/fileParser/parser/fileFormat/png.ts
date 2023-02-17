import { FileFormat } from './type';

export const PNG: FileFormat = {
    name: 'png',
    format: `
#header
MARK, 1
PNG, 3, string
CRLF, 2
NEND, 1
LF, 1

loop(): #chunk
length, >4, number
type, 4, string
data, \${length}, png
crc, 4
    `,
};
