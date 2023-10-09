export const rules = `
# group
## group

fieldName, length, dataFormat
fieldName, >length, dataFormat
fieldName, <length, dataFormat

fieldName, [offsetStart, offsetEnd]
fieldName, length, dataFormat | dataFormat

\${fieldValueWithDataFormat}
\${fieldValueWithDataFormat + offset}
\${fieldValueWithDataFormat - offset}

while(byteValue): # group
if(var, matchData): # group
loop(numberValue): # group

while(byteValue): # field...
if(var, matchData): # field...
loop(numberValue): # field...

back(numberValue)
next(numberValue)
goto(numberValue)
find(byteValue)
backFind(byteValue)

stringValue: 'string' "string"
byteValue: [00 0F AF]
numberValue: 123

// comment
/* comment */
`;
