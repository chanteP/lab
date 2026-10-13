// 预设 formatter（历史版本恢复：提供 ParserTable 的默认解析脚本列表）
const glb = `
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
`;

const wxapkg = `
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
`;

export default {
    wxapkg,
    glb,
};
