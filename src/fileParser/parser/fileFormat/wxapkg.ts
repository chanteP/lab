import { FileFormat } from './type';

export const WXAPKG: FileFormat = {
    name: 'wxapkg',
    format: `
#header
firstMark, 1, number
info1, >4, number
indexInfoLength, >4, number
bodyInfoLength, >4, number
lastMark, 1, number
fileCount, >4, number

loop(\${fileCount}): #index
nameLength, >4, number
fileName, \${nameLength}, string
offset, >4, number
size, >4, number

##fileContent
content, [\${offset}, \${offset + size}], string

#data
`,
};
