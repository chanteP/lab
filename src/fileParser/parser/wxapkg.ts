export default `
#header
+firstMark,1
+info1,>4
+indexInfoLength,>4
+bodyInfoLength,>4
+lastMark,1
+fileCount,>4

#[\${fileCount}]index
+nameLength,>4
-fileName,\${nameLength}
+offset,>4
+size,>4
##fileContent
-content,[\${offset}, \${offset + size}]

#data
`