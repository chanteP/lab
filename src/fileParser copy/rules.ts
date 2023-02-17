export const rules = `
# group
## group

fieldName, length, dataFormat
fieldName, >length, dataFormat
fieldName, <length, dataFormat

fieldName, [offsetStart, offsetEnd]
fieldName, length, dataFormat | dataFormat

\${fieldValueWithDataFormat}

while(matchData)# group
if(data, equalValue)# group
loop(count)# group

back(byte)
backWhile(byte)

loop(count)fieldName, ...

// comment
`;
