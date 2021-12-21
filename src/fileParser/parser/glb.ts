
export default `
#header
-magic,4
+version,4
+length,4

#json
+chunkLength, 4
-chunkType, 4
-data,\${chunkLength}

#binary buffer
+chunkLength, 4
-chunkType, 4
data,\${chunkLength}
`